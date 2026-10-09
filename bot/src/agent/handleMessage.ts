import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { isRateLimited } from "../lib/rateLimit.js";
import { findOrCreateByPhone } from "../db/repositories/clientes.js";
import { actualizarFuenteConversacion, getOrCreateConversacionAbierta } from "../db/repositories/conversaciones.js";
import { esFuenteDeCampana, fuenteCampana } from "../lib/fuente.js";
import { paginaDeAnuncio } from "../meta/client.js";
import { marcaDePagina } from "../meta/paginas.js";
import { guardarMensaje, marcarExternalId } from "../db/repositories/mensajes.js";
import { sendTextIfWindowOpen } from "../whatsapp/window.js";
import { descargarMedia } from "../whatsapp/client.js";
import { handleInbound } from "./handleInbound.js";
import { procesarDocumentoEntrante } from "./documentoEntrante.js";
import type { AdReferral, InboundMessage } from "../whatsapp/parser.js";

/**
 * Si la persona escribió desde un anuncio de clic a WhatsApp, se anota de qué
 * anuncio vino junto a su primer mensaje. Así el agente (que lee el historial
 * guardado) sabe qué servicio busca aunque el texto sea el genérico de Meta
 * ("Hola, quiero más información"), y el staff lo ve también en el panel.
 */
export function anotarAnuncio(texto: string, referral: AdReferral | undefined): string {
  if (!referral) return texto;
  const partes = [referral.headline, referral.body?.split("\n").find((l) => l.trim())].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  const detalle = partes.length ? `: "${partes.join(" — ").slice(0, 200)}"` : "";
  return `${texto}\n\n(Llegó desde un anuncio de Meta${detalle})`;
}

/**
 * El anuncio exacto (id de Meta) queda en el metadata del primer mensaje, para
 * saber qué video trajo cada conversación y cada venta: el titular solo no
 * alcanza porque varios anuncios comparten el mismo texto.
 */
export function metadataAnuncio(referral: AdReferral | undefined): Record<string, unknown> | undefined {
  if (!referral) return undefined;
  const anuncio = {
    ...(referral.sourceId ? { id: referral.sourceId } : {}),
    ...(referral.headline ? { titulo: referral.headline.slice(0, 200) } : {}),
    ...(referral.body ? { texto: referral.body.slice(0, 500) } : {}),
    ...(referral.sourceUrl ? { url: referral.sourceUrl } : {}),
  };
  return Object.keys(anuncio).length ? { anuncio } : undefined;
}

/**
 * El «origen» de quien llega por un anuncio de clic a WhatsApp: «Campaña WhatsApp Meta <marca>», con la marca de la
 * página que publicó el anuncio. Sin anuncio no hay campaña (la conversación queda «WhatsApp directo»).
 */
export async function fuenteDeAnuncio(referral: AdReferral | undefined): Promise<string | null> {
  if (!referral) return null;
  const paginaId = referral.sourceId ? await paginaDeAnuncio(referral.sourceId) : null;
  return fuenteCampana("WhatsApp", marcaDePagina(paginaId));
}

function extractText(message: InboundMessage): string | null {
  switch (message.kind) {
    case "text":
      return anotarAnuncio(message.text, message.referral);
    case "interactive_reply":
      return message.replyTitle;
    case "audio":
      return null; // se maneja aparte: mensaje fijo, no pasa por el agente.
    default:
      return null;
  }
}

export async function handleInboundMessage(message: InboundMessage): Promise<void> {
  if (isRateLimited(message.from, env.RATE_LIMIT_MAX_PER_MINUTE)) {
    // Se descarta sin responder: una respuesta (aunque sea de rechazo)
    // premia el abuso con engagement y gasta una llamada a la Graph API.
    logger.warn({ from: message.from }, "Mensaje descartado por rate limit");
    return;
  }

  const cliente = await findOrCreateByPhone(message.from, message.contactName);
  const fuenteAnuncio = message.kind === "text" ? await fuenteDeAnuncio(message.referral) : null;
  const conversacion = await getOrCreateConversacionAbierta({
    clienteId: cliente.id,
    canal: "whatsapp",
    ...(fuenteAnuncio ? { fuente: fuenteAnuncio } : {}),
  });
  // Ya tenía la conversación abierta (escribía directo) y ahora llega por un anuncio: cuenta para esa campaña.
  if (fuenteAnuncio && !esFuenteDeCampana(conversacion.fuente)) {
    await actualizarFuenteConversacion(conversacion.id, fuenteAnuncio).catch((err: unknown) =>
      logger.warn({ err, conversacionId: conversacion.id }, "No se pudo anotar la campaña de la conversación"),
    );
  }

  if (message.kind === "audio") {
    if (conversacion.estado === "escalada") {
      // Un humano ya está atendiendo: no le mandamos el mensaje fijo por
      // encima de lo que esa persona esté por escribir.
      logger.info({ conversacionId: conversacion.id }, "Conversación escalada, se ignora el audio");
      return;
    }
    const texto = "Por ahora no puedo escuchar audios 🙏 ¿Me lo escribes en un mensaje de texto?";
    const guardado = await guardarMensaje({ conversacionId: conversacion.id, rol: "assistant", contenido: texto });
    const waMessageId = await sendTextIfWindowOpen(message.from, texto);
    if (waMessageId) await marcarExternalId(guardado.id, waMessageId).catch(() => {});
    return;
  }

  if (message.kind === "image" || message.kind === "document") {
    // Se guarda siempre (también si la conversación está escalada): el
    // contador tiene que encontrar el archivo en el panel pase lo que pase.
    // Si corresponde un acuse, lo decide procesarDocumentoEntrante.
    await procesarDocumentoEntrante({
      conversacion,
      canal: "whatsapp",
      destinatarioId: message.from,
      externalId: message.id,
      mediaType: message.kind,
      descargar: () => descargarMedia(message.mediaId),
      nombreArchivo: message.kind === "document" ? message.filename : undefined,
      caption: message.caption,
    });
    return;
  }

  const userText = extractText(message);
  if (userText === null) {
    logger.info({ kind: message.kind }, "Tipo de mensaje sin manejo de texto, se ignora");
    return;
  }

  // handleInbound guarda el mensaje ANTES de mirar si la conversación está
  // escalada — a propósito: antes, una conversación escalada ni siquiera
  // guardaba el mensaje de texto entrante (se descartaba en el primer
  // `return` de esta función, antes de llegar acá), así que el staff nunca
  // veía en el panel lo último que el cliente había escrito.
  const anuncio = message.kind === "text" ? metadataAnuncio(message.referral) : undefined;
  await handleInbound({
    conversacion,
    canal: "whatsapp",
    destinatarioId: message.from,
    // El wa_id del remitente ES el teléfono, así que en WhatsApp nunca falta
    // aunque la columna ya admita null para los leads de otros canales.
    telefono: cliente.telefono ?? message.from,
    contactName: message.contactName,
    texto: userText,
    externalId: message.id,
    ...(anuncio ? { metadata: anuncio } : {}),
  });
}
