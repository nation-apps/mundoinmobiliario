import { supabase } from "../db/client.js";
import type { AttachmentType } from "../meta/parser.js";
import type { TipoMediaMensaje } from "../db/repositories/mensajes.js";

/** Bucket privado donde queda todo lo que manda un cliente. El panel lo abre con URLs firmadas. */
export const BUCKET_ADJUNTOS = "adjuntos";

const EXTENSION_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/xml": "xml",
  "text/xml": "xml",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** No hay una categoría exacta de mensajes.media_type para todo lo que manda Meta: se aproxima con la más cercana. */
const MEDIA_TYPE_POR_ATTACHMENT: Record<AttachmentType, TipoMediaMensaje> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
  share: "document",
  story_mention: "document",
  ig_reel: "video",
  otro: "document",
};

export function mediaTypeDeAttachment(tipo: AttachmentType): TipoMediaMensaje {
  return MEDIA_TYPE_POR_ATTACHMENT[tipo];
}

/**
 * Extensión del archivo guardado. Primero por MIME (lo que dice el canal),
 * después por el nombre original (WhatsApp manda muchos Excel como
 * "application/octet-stream" pero con "ventas-septiembre.xlsx" de nombre), y
 * si nada sirve, "bin": el archivo se guarda igual, que es lo que importa.
 */
export function extensionPara(mimeType: string, nombreOriginal?: string): string {
  const porMime = EXTENSION_POR_MIME[mimeType.split(";")[0]!.trim().toLowerCase()];
  if (porMime) return porMime;
  const porNombre = nombreOriginal?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase();
  return porNombre ?? "bin";
}

/**
 * Sube un archivo entrante (WhatsApp, Messenger o Instagram) al bucket
 * privado `adjuntos`, en "{conversacion_id}/{timestamp}.{ext}". A diferencia
 * de `plantillas-media` (público: la biblioteca que el estudio elige mandar),
 * esto es contenido del cliente — comprobantes, fichas RUC, DNI — y nunca se
 * expone con una URL pública. Devuelve la ruta dentro del bucket, que es lo
 * que se guarda en `mensajes.media_path`.
 */
export async function subirAdjunto(params: {
  conversacionId: string;
  buffer: Buffer;
  mimeType: string;
  nombreOriginal?: string | undefined;
}): Promise<string> {
  const extension = extensionPara(params.mimeType, params.nombreOriginal);
  const path = `${params.conversacionId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET_ADJUNTOS)
    .upload(path, params.buffer, { contentType: params.mimeType });
  if (error) throw error;
  return path;
}
