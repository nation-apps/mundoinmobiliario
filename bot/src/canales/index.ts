import { whatsappAdapter } from "./whatsapp.js";
import { messengerAdapter, instagramAdapter } from "./meta.js";
import { crearAdapterSinRespuesta, MOTIVO_CANAL_WEB, MOTIVO_TIKTOK_PENDIENTE } from "./sinRespuesta.js";
import type { CanalAdapter, CanalConversacion } from "./types.js";

/**
 * Un adapter por cada canal en el que puede existir una conversación, incluso
 * los que no admiten respuesta: `web` (el formulario del sitio) nunca la
 * tiene, y los DMs de `tiktok` tampoco mientras TikTok no apruebe Business
 * Messaging (ver canales/tiktok.ts).
 */
const ADAPTERS: Record<CanalConversacion, CanalAdapter> = {
  whatsapp: whatsappAdapter,
  messenger: messengerAdapter,
  instagram: instagramAdapter,
  tiktok: crearAdapterSinRespuesta("tiktok", MOTIVO_TIKTOK_PENDIENTE),
  web: crearAdapterSinRespuesta("web", MOTIVO_CANAL_WEB),
};

export function getCanalAdapter(canal: CanalConversacion): CanalAdapter {
  return ADAPTERS[canal];
}

export type { CanalActivo, CanalAdapter, CanalConversacion, RolEnvio, ResultadoEnvioCanal } from "./types.js";
