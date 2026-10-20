/**
 * De qué anuncio vino un lead, sacado de los metadatos de sus primeros mensajes. Dos formas, según cómo llegó:
 * - Formulario de anuncios: `{ ad_id, anuncio: "nombre", campana, formulario }` (bot/src/agent/handleLeadFormulario.ts).
 * - Clic a WhatsApp: `{ anuncio: { id, titulo, texto, url } }` (bot/src/agent/handleMessage.ts → metadataAnuncio).
 * Sin dependencias de React ni de Supabase, para poder probarlo aparte.
 */

export type AnuncioDeLead = {
  id: string | null;
  nombre: string | null;
  campana: string | null;
  formulario: string | null;
  /** Enlace que trajo el propio mensaje de WhatsApp (sirve si Meta no deja leer el anuncio). */
  enlaceDirecto: string | null;
};

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

function enlaceSeguro(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** El primer mensaje con datos de anuncio manda (es el que trajo al lead). Null si ninguno trae. */
export function anuncioDeMensajes(metadatos: (Record<string, unknown> | null | undefined)[]): AnuncioDeLead | null {
  for (const md of metadatos) {
    if (!md) continue;
    const anuncio = md.anuncio;
    const objeto = anuncio && typeof anuncio === "object" ? (anuncio as Record<string, unknown>) : null;
    const id = texto(md.ad_id) ?? texto(objeto?.id);
    const nombre = texto(typeof anuncio === "string" ? anuncio : null) ?? texto(objeto?.titulo);
    if (!id && !nombre) continue;
    return {
      id: id && /^\d{5,25}$/.test(id) ? id : null,
      nombre,
      campana: texto(md.campana),
      formulario: texto(md.formulario),
      enlaceDirecto: enlaceSeguro(texto(objeto?.url)),
    };
  }
  return null;
}

/** Lo que Meta cuenta del anuncio (la respuesta de GET /admin/anuncios/:id del bot). */
export type InfoAnuncio = {
  id: string;
  nombre: string | null;
  campana: string | null;
  estado: string | null;
  tipo: "video" | "imagen" | null;
  enlace: string | null;
  enlaceAdministrador: string | null;
};
