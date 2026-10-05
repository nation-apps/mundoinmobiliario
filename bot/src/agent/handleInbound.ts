import { logger } from "../lib/logger.js";
import { escalarConversacion, type Conversacion } from "../db/repositories/conversaciones.js";
import {
  fueEntregado,
  getHistorialReciente,
  guardarMensaje,
  hayMensajeNuevoDeLaPersona,
  type MensajeMetadata,
} from "../db/repositories/mensajes.js";
import { getCanalConfig } from "../db/repositories/canales.js";
import { clienteAnulado } from "../db/repositories/etiquetas.js";
import { getCanalAdapter, type CanalActivo } from "../canales/index.js";
import { runAgent, FALLBACK_MESSAGE } from "./runner.js";
import { enCola } from "../lib/porConversacion.js";
import type { AgentContext } from "./tools/types.js";
import { RESPUESTA_MENSAJE_CORTADO, esMensajeCortado } from "./mensajeCortado.js";
import { env } from "../config/env.js";
import { faltanteMs, pausaObjetivoMs, type TipoRespuesta } from "../lib/ritmoHumano.js";
import { esRespuestaAutomatica } from "../lib/autorespuesta.js";

const AGENT_TIMEOUT_MS = 25_000;

async function runAgentWithTimeout(ctx: Parameters<typeof runAgent>[0], userText: string): Promise<string> {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<string>((resolve) => {
    timeoutId = setTimeout(() => resolve(FALLBACK_MESSAGE), AGENT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([runAgent(ctx, userText), timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * El núcleo compartido de "llegó un mensaje de texto, hay que atenderlo",
 * usado tanto por el flujo de WhatsApp (agent/handleMessage.ts, que resuelve
 * cliente/conversación a su manera — por teléfono) como por el de
 * Messenger/Instagram (agent/handleInboundMeta.ts, que resuelve por
 * identidad) y el de TikTok cuando se enchufe. Cada canal resuelve identidad
 * y conversación distinto — y los archivos van por agent/documentoEntrante.ts
 * — así que eso se queda en el wrapper de cada uno; acá vive solo lo que de
 * verdad es igual para todos: guardar, decidir si responde el bot, correr el
 * agente, enviar la respuesta y guardarla.
 *
 * El mensaje entrante se guarda SIEMPRE, incluso si la conversación está
 * escalada o el canal tiene la IA apagada — antes (bug encontrado al
 * unificar este código) una conversación escalada ni guardaba el mensaje
 * entrante: quedaba sin rastro, y el staff no veía en el panel lo que el
 * cliente acababa de escribir.
 */
export async function handleInbound(params: {
  conversacion: Conversacion;
  canal: CanalActivo;
  /** A quién se le responde: el teléfono en WhatsApp, el PSID/IGSID en Meta. */
  destinatarioId: string;
  telefono: string | null;
  contactName: string | undefined;
  texto: string;
  externalId: string;
  /** Datos extra del mensaje entrante (por ejemplo, de qué anuncio vino). */
  metadata?: MensajeMetadata;
}): Promise<void> {
  const { conversacion } = params;

  // El mensaje se guarda ya (el panel lo ve al instante), pero la respuesta
  // espera su turno: ver lib/porConversacion.ts.
  const guardado = await guardarMensaje({
    conversacionId: conversacion.id,
    rol: "user",
    contenido: params.texto,
    externalId: params.externalId,
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
  const recibidoAt = guardado?.created_at ?? new Date().toISOString();

  // La respuesta automática de otro negocio ("Gracias por comunicarte con X, en breve te respondemos") se guarda, pero no
  // se contesta: sería un bot hablándole a otro bot.
  if (esRespuestaAutomatica(params.texto)) {
    logger.info({ conversacionId: conversacion.id }, "Respuesta automática de otro negocio: no se contesta");
    return;
  }

  await enCola(conversacion.id, () => responder(params, recibidoAt));
}

/** Tiempo que se espera antes de contestar, por si la persona manda otro mensaje enseguida. */
const ASENTAR_MENSAJES_MS = 1_500;

async function responder(params: Parameters<typeof handleInbound>[0], recibidoAt: string): Promise<void> {
  const { conversacion } = params;
  // El reloj del ritmo humano corre desde que empieza este turno; la espera para juntar mensajes cuenta dentro de él.
  const inicio = Date.now();

  if (conversacion.estado === "escalada") {
    logger.info({ conversacionId: conversacion.id }, "Conversación escalada, el bot no responde");
    return;
  }

  const canalConfig = await getCanalConfig(params.canal);
  if (!canalConfig?.activo || !canalConfig?.ia_activa) {
    logger.info({ canal: params.canal, conversacionId: conversacion.id }, "Canal o IA apagados, el bot no responde");
    return;
  }

  // Contacto con la etiqueta «Anulado» (no es el público del negocio): el mensaje queda guardado en el panel, pero el bot
  // no contesta, ni siquiera con "escribiendo…".
  if (await clienteAnulado(conversacion.cliente_id)) {
    logger.info({ conversacionId: conversacion.id }, "Contacto anulado: el bot no responde");
    return;
  }

  // Leído y "escribiendo…" desde el primer instante: así la espera para juntar mensajes y la del ritmo se ven naturales.
  const adapterEntrada = getCanalAdapter(params.canal);
  if (env.RITMO_HUMANO) {
    void adapterEntrada.indicarEscribiendo?.(params.externalId).catch((err) => {
      logger.debug({ err }, "No se pudo mostrar 'escribiendo…' (es cosmético)");
    });
  }

  // Varios mensajes seguidos ("Maquilladora", "Estilista") se contestan UNA sola vez: el turno del último ve todo el
  // historial. Se espera un instante y, si ya llegó otro, este turno no responde.
  if (env.RITMO_HUMANO) {
    await new Promise((r) => setTimeout(r, ASENTAR_MENSAJES_MS));
    if (await hayMensajeNuevoDeLaPersona(conversacion.id, recibidoAt)) {
      logger.info({ conversacionId: conversacion.id }, "Llegó otro mensaje enseguida: responde el último, no este");
      return;
    }
  }

  // Un fragmento ("H") se contesta con un texto fijo: sin modelo, sin gasto. Si la persona ya recibió ese aviso y
  // vuelve a mandar otro fragmento, ahí sí interviene el modelo (puede ser algo que el texto fijo no resuelve).
  let respuestaFija = false;
  if (esMensajeCortado(params.texto)) {
    const reciente = await getHistorialReciente(conversacion.id, 4, 24).catch(() => []);
    const ultimoDelBot = [...reciente].reverse().find((m) => m.rol !== "user");
    respuestaFija = ultimoDelBot?.contenido !== RESPUESTA_MENSAJE_CORTADO;
  }

  // Ritmo humano: el modelo trabaja en paralelo y al final solo se espera lo que falte.
  const yaHabiaRespuestaDelBot = env.RITMO_HUMANO
    ? (await getHistorialReciente(conversacion.id, 6, 24).catch(() => [])).some((m) => m.rol !== "user" && fueEntregado(m))
    : true;

  let respuesta: string;
  // Mutable a propósito: las tools lo rellenan (teléfono, botones) durante el turno.
  const ctx: AgentContext = {
    canal: params.canal,
    conversacionId: conversacion.id,
    clienteId: conversacion.cliente_id,
    telefono: params.telefono,
    contactName: params.contactName,
  };
  try {
    respuesta = respuestaFija ? RESPUESTA_MENSAJE_CORTADO : await runAgentWithTimeout(ctx, params.texto);
  } catch (err) {
    logger.error({ err }, "Fallo inesperado orquestando el agente");
    respuesta = FALLBACK_MESSAGE;
    await escalarConversacion(conversacion.id).catch(() => {});
  }

  // Si mientras tanto escribió otra cosa, esta respuesta ya quedó vieja: el turno del mensaje nuevo contesta todo junto.
  if (env.RITMO_HUMANO && respuesta !== FALLBACK_MESSAGE && (await hayMensajeNuevoDeLaPersona(conversacion.id, recibidoAt))) {
    logger.info({ conversacionId: conversacion.id }, "Escribió de nuevo mientras se preparaba la respuesta: se descarta y responde el último");
    return;
  }

  if (env.RITMO_HUMANO && respuesta !== FALLBACK_MESSAGE) {
    const tipo: TipoRespuesta = respuestaFija ? "fija" : yaHabiaRespuestaDelBot ? "normal" : "primera";
    const objetivo = pausaObjetivoMs({ caracteres: respuesta.length, tipo, factor: env.RITMO_FACTOR });
    const espera = faltanteMs(objetivo, Date.now() - inicio);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  }

  // Enviar antes de guardar: si esto tira (Meta/WhatsApp rechazó el envío,
  // no solo "ventana cerrada"), el catch lo convierte en el mismo shape que
  // motivoCierre para que el mensaje quede guardado con error_entrega en vez
  // de aparecer en el panel como si le hubiera llegado al cliente.
  const adapter = getCanalAdapter(params.canal);
  // Los botones solo acompañan una respuesta real del asesor, nunca el mensaje de falla.
  const botones =
    adapter.enviarBotones && respuesta !== FALLBACK_MESSAGE && ctx.botones && ctx.botones.length >= 2 ? ctx.botones : null;
  const envio = {
    destinatarioId: params.destinatarioId,
    texto: respuesta,
    rol: "assistant" as const,
    // El mensaje que se está respondiendo ES el último entrante: la ventana
    // está abierta por definición en este momento, no hace falta releerla.
    ultimoMensajeAt: new Date().toISOString(),
  };
  let resultado: { externalId: string | null; motivoCierre?: string };
  try {
    try {
      resultado = botones
        ? await adapter.enviarBotones!({ ...envio, opciones: botones })
        : await adapter.enviarTexto(envio);
    } catch (err) {
      // Si Meta rechaza el mensaje con botones, la persona recibe igual la respuesta en texto.
      if (!botones) throw err;
      logger.warn({ err, conversacionId: conversacion.id }, "Falló el envío con botones: se reenvía como texto");
      resultado = await adapter.enviarTexto(envio);
    }
  } catch (err) {
    logger.error({ err, canal: params.canal, conversacionId: conversacion.id }, "Fallo enviando la respuesta del bot");
    resultado = { externalId: null, motivoCierre: err instanceof Error ? err.message : String(err) };
  }

  await guardarMensaje({
    conversacionId: conversacion.id,
    rol: "assistant",
    contenido: respuesta,
    ...(botones ? { metadata: { botones } } : {}),
    ...(resultado.externalId
      ? {
          externalId: resultado.externalId,
          // En WhatsApp el id también va a wa_message_id: es la columna con
          // la que el webhook de statuses marca un envío que falló después
          // (marcarMensajeFallido). Sin esto, esos fallos no encontraban fila.
          ...(params.canal === "whatsapp" ? { waMessageId: resultado.externalId } : {}),
        }
      : { errorEntrega: resultado.motivoCierre ?? "No se pudo enviar" }),
  });

  if (!resultado.externalId) {
    logger.warn(
      { canal: params.canal, conversacionId: conversacion.id, motivo: resultado.motivoCierre },
      "No se pudo enviar la respuesta del bot",
    );
  }
}
