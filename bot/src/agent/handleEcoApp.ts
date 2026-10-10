import { logger } from "../lib/logger.js";
import { subirAdjunto } from "../lib/adjuntos.js";
import { findOrCreateByPhone } from "../db/repositories/clientes.js";
import { getOrCreateConversacionAbierta, pasarAPersona } from "../db/repositories/conversaciones.js";
import { existeExternalId, guardarMensaje } from "../db/repositories/mensajes.js";
import { descargarMedia } from "../whatsapp/client.js";
import type { EcoApp } from "../whatsapp/parser.js";

/** `metadata.via` de lo que el equipo escribe desde el celular: el panel lo rotula. */
export const VIA_APP_WHATSAPP = "whatsapp_business_app";

/**
 * Espera antes de decidir que un eco no es de un envío del propio panel: el panel manda por la API y recién después
 * guarda el mensaje con su id. Si el eco llegara antes, el panel chocaría con el índice único de `external_id`.
 */
const ESPERA_ENVIO_PANEL_MS = 2000;

const PLACEHOLDER: Record<string, string> = {
  image: "[Imagen]",
  video: "[Video]",
  audio: "[Audio]",
  document: "[Documento]",
};

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Coexistencia: un asesor le escribió a un cliente desde la app WhatsApp Business del celular (el mismo número que
 * usa la API). El panel tiene que ver lo que se dijo y el bot no debe hablarle encima: se guarda como mensaje del
 * equipo y el chat pasa a «Yo». Si la persona le escribió primero desde el celular, el chat se abre aquí también.
 */
export async function handleEcoApp(eco: EcoApp, esperaMs = ESPERA_ENVIO_PANEL_MS): Promise<void> {
  if (await existeExternalId(eco.id)) return;
  await esperar(esperaMs);
  if (await existeExternalId(eco.id)) return; // era un envío del propio panel o del bot

  const cliente = await findOrCreateByPhone(eco.to);
  const conversacion = await getOrCreateConversacionAbierta({ clienteId: cliente.id, canal: "whatsapp" });

  let mediaPath: string | undefined;
  let errorDescarga: string | undefined;
  if (eco.media) {
    try {
      const { buffer, mimeType } = await descargarMedia(eco.media.mediaId);
      mediaPath = await subirAdjunto({
        conversacionId: conversacion.id,
        buffer,
        mimeType,
        nombreOriginal: eco.media.filename,
      });
    } catch (err) {
      // El texto del mensaje se conserva igual: perder el archivo no debe perder la conversación.
      logger.warn({ err, conversacionId: conversacion.id }, "No se pudo guardar el archivo que el equipo mandó desde el celular");
      errorDescarga = "no se pudo descargar";
    }
  }

  const contenido = eco.texto?.trim() || (eco.media ? PLACEHOLDER[eco.media.tipo] : null) || `[${eco.tipoOriginal}]`;

  try {
    await guardarMensaje({
      conversacionId: conversacion.id,
      rol: "humano",
      contenido,
      externalId: eco.id,
      ...(mediaPath && eco.media ? { mediaPath, mediaType: eco.media.tipo } : {}),
      metadata: { via: VIA_APP_WHATSAPP, ...(errorDescarga ? { error_descarga: errorDescarga } : {}) },
    });
  } catch (err) {
    // Meta puede repetir el aviso: el segundo choca con el índice único de external_id y ya estaba guardado.
    if ((err as { code?: string }).code === "23505") return;
    throw err;
  }

  const paso = await pasarAPersona(conversacion.id).catch((err: unknown) => {
    logger.warn({ err, conversacionId: conversacion.id }, "No se pudo pasar la conversación a «Yo»");
    return false;
  });
  logger.info(
    { conversacionId: conversacion.id, tipo: eco.tipoOriginal, pasoAPersona: paso },
    "Mensaje del equipo desde la app WhatsApp Business reflejado en el panel",
  );
}
