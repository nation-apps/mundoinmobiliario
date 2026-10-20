/**
 * Documentos de un cliente (enlaces a fichajes, separaciones, contratos…): lo que el vendedor guarda en la ficha. No se suben
 * archivos: se pega el enlace (Drive u otro sitio). Sin dependencias de React ni de Supabase, para poder probarlo aparte.
 */

export type TipoDocumento = "fichaje" | "separacion" | "contrato" | "otro";

export const TIPOS_DOCUMENTO: TipoDocumento[] = ["fichaje", "separacion", "contrato", "otro"];

export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  fichaje: "Fichaje",
  separacion: "Separación",
  contrato: "Contrato",
  otro: "Otro",
};

export type DocumentoCliente = {
  id: string;
  cliente_id: string;
  conversacion_id: string | null;
  tipo: TipoDocumento;
  titulo: string | null;
  url: string;
  creado_por: string | null;
  created_at: string;
};

export const COLUMNAS_DOCUMENTO = "id, cliente_id, conversacion_id, tipo, titulo, url, creado_por, created_at";

/** El enlace que se va a guardar: solo http o https. Si no lleva el protocolo, se le pone https. Null si no es un enlace. */
export function normalizarEnlace(crudo: string): string | null {
  const texto = crudo.trim();
  if (!texto || /\s/.test(texto)) return null;
  const conProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`;
  try {
    const u = new URL(conProtocolo);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Cómo se muestra un documento: su título, o el sitio al que lleva. */
export function nombreDeDocumento(d: Pick<DocumentoCliente, "titulo" | "url">): string {
  const titulo = d.titulo?.trim();
  if (titulo) return titulo;
  try {
    return new URL(d.url).hostname.replace(/^www\./, "");
  } catch {
    return d.url;
  }
}
