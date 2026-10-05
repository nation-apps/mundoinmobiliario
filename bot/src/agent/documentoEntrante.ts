import { logger } from "../lib/logger.js";
import { subirAdjunto } from "../lib/adjuntos.js";
import { guardarMensaje, type MensajeMetadata } from "../db/repositories/mensajes.js";
import { registrarEvento } from "../db/repositories/eventos.js";
import { getCanalConfig } from "../db/repositories/canales.js";
import { getCanalAdapter, type CanalActivo } from "../canales/index.js";
import { type Conversacion } from "../db/repositories/conversaciones.js";

/**
 * Lo que el bot contesta cuando le llega un archivo. Una sola frase y nada
 * más: el bot nunca abre, lee ni opina sobre un documento — lo ve el contador.
 */
export const ACUSE_DOCUMENTO = "Recibido 👍 Se lo paso a un asesor para que lo revise. Si quieres agregar algo, escríbeme por aquí.";

/**
 * Un solo acuse por ráfaga. Un cliente que manda los comprobantes del mes
 * suele mandar diez fotos seguidas; diez "Recibido" seguidos serían ruido.
 */
const VENTANA_ACUSE_MS = 10 * 60_000;
const ultimoAcusePorConversacion = new Map<string, number>();

/**
 * true si a esta conversación todavía no se le mandó un acuse en la ventana,
 * y la marca como atendida en el mismo paso. Es síncrono A PROPÓSITO: WhatsApp
 * manda cada foto de un álbum en su propio webhook y esos webhooks se procesan
 * en paralelo; si la marca esperara a una consulta a la base, cinco fotos
 * podrían ver "sin acuse" a la vez y el cliente recibiría cinco. Mismo
 * criterio de Map en memoria que el rate limit (una sola instancia).
 */
export function reservarAcuse(conversacionId: string, ahora = Date.now()): boolean {
  for (const [id, momento] of ultimoAcusePorConversacion) {
    if (ahora - momento > VENTANA_ACUSE_MS) ultimoAcusePorConversacion.delete(id);
  }
  if (ultimoAcusePorConversacion.has(conversacionId)) return false;
  ultimoAcusePorConversacion.set(conversacionId, ahora);
  return true;
}

/** Solo para tests: cada caso arranca sin acuses previos. */
export function reiniciarAcuses(): void {
  ultimoAcusePorConversacion.clear();
}

export type DocumentoEntrante = {
  conversacion: Conversacion;
  canal: CanalActivo;
  /** A quién se le responde el acuse: el teléfono en WhatsApp, el PSID/IGSID en Meta. */
  destinatarioId: string;
  externalId: string;
  mediaType: "image" | "document";
  /**
   * Cómo bajar los bytes. Se inyecta porque cada canal tiene su forma (media
   * id + Graph en WhatsApp, URL firmada en Meta) y así este flujo no conoce a
   * ninguna API en particular.
   */
  descargar: () => Promise<{ buffer: Buffer; mimeType: string }>;
  nombreArchivo?: string | undefined;
  caption?: string | undefined;
  metadata?: MensajeMetadata;
};

/**
 * Un cliente mandó una foto o un documento (comprobantes del mes, ficha RUC,
 * una notificación de SUNAT…). Reemplaza al flujo de comprobantes de pago de
 * la plantilla original: acá no hay nada que validar ni cobrar, solo
 * guardarlo donde el contador lo encuentre y avisarle al cliente que llegó.
 *
 * El orden importa:
 * 1. Se guarda SIEMPRE, aunque la conversación esté escalada o la IA apagada,
 *    y aunque la descarga falle (queda el mensaje con el error, para que el
 *    staff sepa que llegó algo y lo pida de nuevo).
 * 2. Se registra el evento `documento`: es lo que el panel escucha para
 *    marcar "documentos pendientes".
 * 3. Recién después, y solo si corresponde, el acuse: primero se envía y
 *    después se guarda, igual que cualquier respuesta del bot.
 */
export async function procesarDocumentoEntrante(doc: DocumentoEntrante): Promise<void> {
  const { conversacion } = doc;
  const tocaAcuse = reservarAcuse(conversacion.id);

  let mediaPath: string | undefined;
  let mimeType: string | undefined;
  let descargadoBuffer: Buffer | undefined;
  let errorDescarga: string | undefined;
  try {
    const descargado = await doc.descargar();
    mimeType = descargado.mimeType;
    descargadoBuffer = descargado.buffer;
    mediaPath = await subirAdjunto({
      conversacionId: conversacion.id,
      buffer: descargado.buffer,
      mimeType: descargado.mimeType,
      nombreOriginal: doc.nombreArchivo,
    });
  } catch (err) {
    errorDescarga = err instanceof Error ? err.message : String(err);
    logger.error({ err, canal: doc.canal, externalId: doc.externalId }, "No se pudo descargar/guardar un documento entrante");
  }

  const etiqueta = doc.mediaType === "image" ? "[Imagen]" : `[Documento${doc.nombreArchivo ? `: ${doc.nombreArchivo}` : ""}]`;
  const mensaje = await guardarMensaje({
    conversacionId: conversacion.id,
    rol: "user",
    contenido: doc.caption?.trim() ? `${etiqueta} ${doc.caption.trim()}` : etiqueta,
    externalId: doc.externalId,
    ...(mediaPath ? { mediaPath } : {}),
    mediaType: doc.mediaType,
    metadata: {
      ...(doc.metadata ?? {}),
      ...(doc.nombreArchivo ? { nombre_archivo: doc.nombreArchivo } : {}),
      ...(mimeType ? { mime_type: mimeType } : {}),
      ...(doc.caption?.trim() ? { caption: doc.caption.trim() } : {}),
      ...(errorDescarga ? { error_descarga: errorDescarga.slice(0, 300) } : {}),
    },
  });

  await registrarEvento(conversacion.id, "documento", {
    mensaje_id: mensaje.id,
    canal: doc.canal,
    media_type: doc.mediaType,
    media_path: mediaPath ?? null,
    ...(doc.nombreArchivo ? { nombre_archivo: doc.nombreArchivo } : {}),
  }).catch((err: unknown) => logger.error({ err }, "No se pudo registrar el evento de documento"));

  if (!tocaAcuse) return;
  if (conversacion.estado === "escalada") {
    // Una persona ya está atendiendo: el acuse automático no se mete en medio.
    return;
  }
  const canalConfig = await getCanalConfig(doc.canal);
  if (!canalConfig?.activo || !canalConfig.ia_activa) return;

  const adapter = getCanalAdapter(doc.canal);
  const textoAcuse = ACUSE_DOCUMENTO;
  let resultado: { externalId: string | null; motivoCierre?: string };
  try {
    resultado = await adapter.enviarTexto({
      destinatarioId: doc.destinatarioId,
      texto: textoAcuse,
      rol: "assistant",
      // El archivo que se está acusando ES el último mensaje entrante.
      ultimoMensajeAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, canal: doc.canal, conversacionId: conversacion.id }, "Falló el envío del acuse de documento");
    resultado = { externalId: null, motivoCierre: err instanceof Error ? err.message : String(err) };
  }

  await guardarMensaje({
    conversacionId: conversacion.id,
    rol: "assistant",
    contenido: textoAcuse,
    ...(resultado.externalId
      ? {
          externalId: resultado.externalId,
          // En WhatsApp el id también va a wa_message_id: es la columna con la
          // que el webhook de statuses marca un envío que falló después.
          ...(doc.canal === "whatsapp" ? { waMessageId: resultado.externalId } : {}),
        }
      : { errorEntrega: resultado.motivoCierre ?? "No se pudo enviar" }),
  });
}
