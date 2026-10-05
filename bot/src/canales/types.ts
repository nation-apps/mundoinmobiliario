import type { CanalConversacion } from "../db/repositories/conversaciones.js";

/**
 * Canales con fila propia en la tabla `canales` (interruptores de IA,
 * respuesta privada, salud del webhook) y por los que el bot puede recibir y
 * contestar. `tiktok` está desde el principio aunque su módulo se cablee
 * aparte: así el resto del bot (runner, prompt, tools, bandeja) ya lo acepta
 * y enchufarlo es sumar su adapter, no tocar tipos por todo el código.
 */
export type CanalActivo = "whatsapp" | "messenger" | "instagram" | "tiktok";
export type { CanalConversacion };
export type RolEnvio = "assistant" | "humano";
/** Mismo shape que TipoMediaMensaje (db/repositories/mensajes.ts) y TipoMediaWhatsApp (whatsapp/client.ts). */
export type TipoMediaCanal = "image" | "video" | "audio" | "document";

export type ResultadoEnvioCanal = {
  /** external_id que asignó el canal, o null si la ventana estaba cerrada y no se intentó nada. */
  externalId: string | null;
  /** Solo presente cuando externalId es null: por qué no se pudo enviar. */
  motivoCierre?: string;
};

/**
 * Una sola forma de mandar texto sin que quien llama tenga que saber las
 * reglas de ventana de cada canal (WhatsApp: 24h + plantillas; Meta: 24h +
 * Human Agent entre 24h y 7 días). Cada adapter recibe lo que ya se conoce
 * — destinatario y último mensaje entrante — en vez de ir a buscarlo, para
 * no repetir la misma consulta que ya hizo quien llama.
 */
export interface CanalAdapter {
  canal: CanalConversacion;
  enviarTexto(params: {
    destinatarioId: string;
    texto: string;
    rol: RolEnvio;
    /** Último mensaje ENTRANTE de esa persona por este canal; null si nunca escribió. */
    ultimoMensajeAt: string | null;
  }): Promise<ResultadoEnvioCanal>;
  /**
   * Mensaje con botones de respuesta rápida (hoy solo WhatsApp). Opcional: un
   * canal que no los tiene simplemente no implementa esto y quien llama manda
   * el texto normal.
   */
  enviarBotones?(params: {
    destinatarioId: string;
    texto: string;
    /** 2 o 3 opciones; WhatsApp corta cada título a 20 caracteres. */
    opciones: readonly string[];
    rol: RolEnvio;
    ultimoMensajeAt: string | null;
  }): Promise<ResultadoEnvioCanal>;
  /**
   * Avisa que el mensaje se leyó y se está escribiendo la respuesta (hoy solo WhatsApp). Opcional y solo
   * cosmético: quien llama ignora cualquier error.
   */
  indicarEscribiendo?(mensajeEntranteId: string): Promise<void>;
  enviarMedia(params: {
    destinatarioId: string;
    tipo: TipoMediaCanal;
    url: string;
    caption?: string | null;
    rol: RolEnvio;
    ultimoMensajeAt: string | null;
  }): Promise<ResultadoEnvioCanal>;
}
