import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Las páginas de Facebook del negocio. Mundo de Motos anuncia desde dos (TVS Motor Cancún y Mundo de Motos MX) y cada
 * lead tiene que decir de cuál vino: el campo «origen» (lib/fuente.ts) usa la `marca` de la página. La página de
 * META_PAGE_ID es la de los mensajes directos; las de META_PAGINAS reciben formularios de anuncios.
 */
export type PaginaMeta = { id: string; marca: string; token: string };

const esquema = z.array(z.object({ id: z.string().min(1), marca: z.string().min(1), token: z.string().min(1) }));

let cache: PaginaMeta[] | null = null;

export function paginasMeta(): PaginaMeta[] {
  if (cache) return cache;
  if (!env.META_PAGINAS) return (cache = []);
  try {
    const parsed = esquema.safeParse(JSON.parse(env.META_PAGINAS));
    if (parsed.success) return (cache = parsed.data);
    logger.error({ issues: parsed.error.issues.length }, "META_PAGINAS no tiene la forma esperada: se ignora");
  } catch {
    logger.error("META_PAGINAS no es JSON válido: se ignora");
  }
  return (cache = []);
}

export function marcaDePagina(paginaId: string | null | undefined): string | null {
  if (!paginaId) return null;
  return paginasMeta().find((p) => p.id === paginaId)?.marca ?? null;
}

/** El token para leer datos de esa página (leads, anuncios): el suyo de META_PAGINAS o, si es la principal, META_PAGE_ACCESS_TOKEN. */
export function tokenDePagina(paginaId: string | null | undefined): string | null {
  const propia = paginasMeta().find((p) => p.id === paginaId);
  if (propia) return propia.token;
  if (paginaId && paginaId === env.META_PAGE_ID && env.META_PAGE_ACCESS_TOKEN) return env.META_PAGE_ACCESS_TOKEN;
  return null;
}

/** Tokens con los que intentar leer un anuncio, del más indicado al menos (sin repetir). */
export function tokensParaAnuncios(): string[] {
  const candidatos = [env.META_ADS_TOKEN, ...paginasMeta().map((p) => p.token), env.META_PAGE_ACCESS_TOKEN];
  return [...new Set(candidatos.filter((t): t is string => Boolean(t)))];
}

/** Solo para pruebas. */
export function _reiniciarPaginas(): void {
  cache = null;
}
