import { normalizarTelefono } from "../lib/telefono.js";
import type { AdReferral, EcoApp, InboundMessage } from "../whatsapp/parser.js";

/**
 * Traduce los mensajes de Baileys (WhatsApp por QR) a las mismas formas que ya entiende el bot cuando llegan por la API
 * de Meta (`InboundMessage` y `EcoApp`). Funciones puras: sin red ni base de datos, para poder probarlas aparte.
 *
 * Aquí `mediaId` es el id del propio mensaje: sesion.ts guarda el mensaje original unos minutos y de ahí baja el archivo.
 */

type ClaveMinima = {
  id?: string | null;
  remoteJid?: string | null;
  /** Baileys 7: cuando `remoteJid` es un identificador interno (@lid), aquí viene el teléfono (@s.whatsapp.net). */
  remoteJidAlt?: string | null;
  fromMe?: boolean | null;
};

/** Lo que WhatsApp adjunta cuando la persona escribe desde un anuncio de «clic a WhatsApp». */
type AnuncioMinimo = {
  title?: string | null;
  body?: string | null;
  sourceId?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  ctwaClid?: string | null;
};
type ContextoMinimo = {
  externalAdReply?: AnuncioMinimo | null;
  /** Cómo llegó la persona a este chat: «ctwa_ad» (anuncio de clic a WhatsApp) u otros valores de WhatsApp. */
  entryPointConversionSource?: string | null;
  entryPointConversionApp?: string | null;
  conversionSource?: string | null;
  ctwaSignals?: string | null;
  ctwaPayload?: unknown;
};
type ConContexto = { contextInfo?: ContextoMinimo | null } | null;

/** El contenido ya "desenvuelto" (sin efímeros ni vista única): lo que devuelve `normalizeMessageContent`. */
export type ContenidoMinimo = {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null } & NonNullable<ConContexto> | null;
  imageMessage?: { caption?: string | null; mimetype?: string | null } & NonNullable<ConContexto> | null;
  videoMessage?: { caption?: string | null; mimetype?: string | null } & NonNullable<ConContexto> | null;
  documentMessage?: { caption?: string | null; mimetype?: string | null; fileName?: string | null } & NonNullable<ConContexto> | null;
  audioMessage?: { mimetype?: string | null } & NonNullable<ConContexto> | null;
  stickerMessage?: unknown;
  buttonsResponseMessage?: { selectedButtonId?: string | null; selectedDisplayText?: string | null } | null;
  listResponseMessage?: { title?: string | null; singleSelectReply?: { selectedRowId?: string | null } | null } | null;
  templateButtonReplyMessage?: { selectedId?: string | null; selectedDisplayText?: string | null } | null;
};

export type MensajeMinimo = {
  key: ClaveMinima;
  pushName?: string | null;
  /** Segundos desde 1970 (Baileys lo entrega como número o como Long). */
  messageTimestamp?: number | { toNumber(): number } | null;
};

/**
 * El anuncio desde el que escribió la persona (clic a WhatsApp), con la misma forma que le llega al bot por la API de
 * Meta (`AdReferral`): de ahí sale la campaña y el nombre del anuncio. Undefined si no escribió desde un anuncio.
 */
export function anuncioDe(contenido: ContenidoMinimo | null | undefined): AdReferral | undefined {
  if (!contenido) return undefined;
  let senalDeAnuncio = false;
  for (const parte of partesConContexto(contenido)) {
    const ctx = parte?.contextInfo;
    if (ctx && vieneDeAnuncio(ctx)) senalDeAnuncio = true;
    const anuncio = ctx?.externalAdReply;
    if (!anuncio) continue;
    const resultado: AdReferral = {
      ...(anuncio.sourceId ? { sourceId: anuncio.sourceId } : {}),
      ...(anuncio.title ? { headline: anuncio.title } : {}),
      ...(anuncio.body ? { body: anuncio.body } : {}),
      ...(anuncio.sourceUrl ? { sourceUrl: anuncio.sourceUrl } : {}),
    };
    if (Object.keys(resultado).length > 0) return resultado;
    senalDeAnuncio = true;
  }
  // WhatsApp avisó que viene de un anuncio pero no dijo cuál: igual cuenta como campaña (sin nombre ni enlace del anuncio).
  return senalDeAnuncio ? {} : undefined;
}

function partesConContexto(contenido: ContenidoMinimo): ConContexto[] {
  return [
    contenido.extendedTextMessage ?? null,
    contenido.imageMessage ?? null,
    contenido.videoMessage ?? null,
    contenido.documentMessage ?? null,
    contenido.audioMessage ?? null,
  ];
}

/** ¿El contexto del mensaje dice que la persona llegó desde un anuncio (aunque no traiga los datos del anuncio)? */
export function vieneDeAnuncio(ctx: ContextoMinimo): boolean {
  if (/ctwa|\bads?\b|_ads?\b/i.test(ctx.entryPointConversionSource ?? "")) return true;
  if (/ctwa|\bads?\b|_ads?\b/i.test(ctx.conversionSource ?? "")) return true;
  if (ctx.externalAdReply?.ctwaClid || ctx.externalAdReply?.sourceType === "ad") return true;
  return Boolean(ctx.ctwaSignals || ctx.ctwaPayload);
}

/**
 * Qué señales de origen trae un mensaje, sin datos personales (solo nombres de campos y palabras cortas de WhatsApp): para
 * entender por qué un chat que debería ser de campaña no lo parece. Se anota en el registro del bot.
 */
export function resumenContexto(contenido: ContenidoMinimo | null | undefined): Record<string, unknown> {
  if (!contenido) return {};
  const tipo = Object.keys(contenido).find((k) => (contenido as Record<string, unknown>)[k]) ?? null;
  for (const parte of partesConContexto(contenido)) {
    const ctx = parte?.contextInfo;
    if (!ctx) continue;
    const corto = (v: unknown) => (typeof v === "string" ? v.slice(0, 40) : undefined);
    return {
      tipo,
      camposContexto: Object.keys(ctx).filter((k) => (ctx as Record<string, unknown>)[k] != null),
      entrada: corto(ctx.entryPointConversionSource),
      app: corto(ctx.entryPointConversionApp),
      conversion: corto(ctx.conversionSource),
      anuncioSourceType: corto(ctx.externalAdReply?.sourceType),
    };
  }
  return { tipo, camposContexto: [] };
}

const SUFIJO_TELEFONO = "@s.whatsapp.net";

/** «5219981234567:12@s.whatsapp.net» → «5219981234567». Null si no es un teléfono (grupo, @lid, difusión…). */
export function telefonoDeJid(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith(SUFIJO_TELEFONO)) return null;
  const digitos = jid.slice(0, -SUFIJO_TELEFONO.length).split(":")[0]?.replace(/\D/g, "") ?? "";
  return digitos ? digitos : null;
}

/** Teléfono del contacto de una conversación individual: del `remoteJid`, o de su alterno si el principal es @lid. */
export function telefonoDeClave(key: ClaveMinima): string | null {
  return telefonoDeJid(key.remoteJid) ?? telefonoDeJid(key.remoteJidAlt);
}

/** Solo conversaciones uno a uno: se descartan grupos, estados, difusiones y canales. */
export function esChatIndividual(jid: string | null | undefined): boolean {
  if (!jid) return false;
  return jid.endsWith(SUFIJO_TELEFONO) || jid.endsWith("@lid");
}

/** El teléfono tal como lo guarda el bot (México: 52 + 10 dígitos). */
export function telefonoDelBot(digitos: string): string | null {
  return normalizarTelefono(digitos);
}

function segundos(marca: MensajeMinimo["messageTimestamp"]): string {
  const n = typeof marca === "number" ? marca : marca && typeof marca.toNumber === "function" ? marca.toNumber() : NaN;
  return String(Number.isFinite(n) && n > 0 ? n : Math.floor(Date.now() / 1000));
}

/** El texto del mensaje, o el pie de una foto, un video o un documento. Null si no trae. */
export function textoDe(contenido: ContenidoMinimo | null | undefined): string | null {
  if (!contenido) return null;
  const texto =
    contenido.conversation ??
    contenido.extendedTextMessage?.text ??
    contenido.imageMessage?.caption ??
    contenido.videoMessage?.caption ??
    contenido.documentMessage?.caption ??
    null;
  const limpio = texto?.trim();
  return limpio ? limpio : null;
}

/** Un mensaje que escribió un cliente. Null si no trae nada que el bot pueda usar ni siquiera como «no soportado». */
export function aMensajeEntrante(
  mensaje: MensajeMinimo,
  contenido: ContenidoMinimo | null | undefined,
  telefono: string,
): InboundMessage | null {
  const id = mensaje.key.id;
  if (!id || !contenido) return null;
  const base = {
    id,
    from: telefono,
    timestamp: segundos(mensaje.messageTimestamp),
    ...(mensaje.pushName ? { contactName: mensaje.pushName } : {}),
  };

  if (contenido.imageMessage) {
    return {
      kind: "image",
      ...base,
      mediaId: id,
      mimeType: contenido.imageMessage.mimetype ?? "image/jpeg",
      ...(contenido.imageMessage.caption?.trim() ? { caption: contenido.imageMessage.caption.trim() } : {}),
    };
  }
  if (contenido.documentMessage) {
    return {
      kind: "document",
      ...base,
      mediaId: id,
      mimeType: contenido.documentMessage.mimetype ?? "application/octet-stream",
      ...(contenido.documentMessage.fileName ? { filename: contenido.documentMessage.fileName } : {}),
      ...(contenido.documentMessage.caption?.trim() ? { caption: contenido.documentMessage.caption.trim() } : {}),
    };
  }
  if (contenido.audioMessage) return { kind: "audio", ...base, mediaId: id };

  const respuestaBoton = contenido.buttonsResponseMessage ?? contenido.templateButtonReplyMessage;
  if (respuestaBoton) {
    const titulo = "selectedDisplayText" in respuestaBoton ? respuestaBoton.selectedDisplayText : null;
    const idBoton =
      ("selectedButtonId" in respuestaBoton ? respuestaBoton.selectedButtonId : null) ??
      ("selectedId" in respuestaBoton ? respuestaBoton.selectedId : null) ??
      "";
    if (titulo) return { kind: "interactive_reply", ...base, replyId: idBoton, replyTitle: titulo };
  }
  if (contenido.listResponseMessage?.title) {
    return {
      kind: "interactive_reply",
      ...base,
      replyId: contenido.listResponseMessage.singleSelectReply?.selectedRowId ?? "",
      replyTitle: contenido.listResponseMessage.title,
    };
  }

  const texto = textoDe(contenido);
  if (texto) {
    const referral = anuncioDe(contenido);
    return { kind: "text", ...base, text: texto, ...(referral ? { referral } : {}) };
  }

  const tipo = contenido.videoMessage ? "video" : contenido.stickerMessage ? "sticker" : "otro";
  return { kind: "unsupported", ...base, messageType: tipo };
}

/** Un mensaje que el equipo escribió desde el celular del número vinculado (fromMe). */
export function aEco(mensaje: MensajeMinimo, contenido: ContenidoMinimo | null | undefined, telefono: string): EcoApp | null {
  const id = mensaje.key.id;
  if (!id || !contenido) return null;
  const base = { id, to: telefono, timestamp: segundos(mensaje.messageTimestamp), texto: textoDe(contenido) };

  if (contenido.imageMessage) {
    return { ...base, media: { tipo: "image", mediaId: id, mimeType: contenido.imageMessage.mimetype ?? "image/jpeg" }, tipoOriginal: "image" };
  }
  if (contenido.documentMessage) {
    return {
      ...base,
      media: {
        tipo: "document",
        mediaId: id,
        mimeType: contenido.documentMessage.mimetype ?? "application/octet-stream",
        ...(contenido.documentMessage.fileName ? { filename: contenido.documentMessage.fileName } : {}),
      },
      tipoOriginal: "document",
    };
  }
  if (contenido.audioMessage) {
    return { ...base, media: { tipo: "audio", mediaId: id, mimeType: contenido.audioMessage.mimetype ?? "audio/ogg" }, tipoOriginal: "audio" };
  }
  if (contenido.videoMessage) return { ...base, tipoOriginal: "video" };
  return { ...base, tipoOriginal: base.texto ? "text" : contenido.stickerMessage ? "sticker" : "otro" };
}
