import type { CanalAdapter, CanalConversacion, ResultadoEnvioCanal } from "./types.js";

/**
 * Adapter para un canal por el que no se puede contestar directo: nunca
 * llama a ninguna API, siempre devuelve "no enviado" con el motivo. Quien
 * llama (handleInbound, POST /admin/mensajes) ya sabe convertir eso en
 * `error_entrega` o en un 409 legible para el staff, así que el canal no
 * necesita un camino especial en cada uno de ellos.
 */
export function crearAdapterSinRespuesta(canal: CanalConversacion, motivo: string): CanalAdapter {
  const noEnviado = async (): Promise<ResultadoEnvioCanal> => ({ externalId: null, motivoCierre: motivo });
  return { canal, enviarTexto: noEnviado, enviarMedia: noEnviado };
}

export const MOTIVO_CANAL_WEB =
  "Este contacto llegó por el formulario del sitio web, que no admite respuesta directa. Escríbele por WhatsApp " +
  "a su número (con una plantilla aprobada si pasaron más de 24 horas desde su último mensaje por ahí).";

export const MOTIVO_TIKTOK_PENDIENTE =
  "TikTok todavía no está conectado para responder desde el bot o el panel. Responde desde la app de TikTok.";
