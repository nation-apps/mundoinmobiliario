/**
 * Fechas en la zona horaria del negocio (Ciudad de México). México no tiene
 * horario de verano desde 2022, pero se usa `Intl` con el nombre de la zona en
 * vez de un offset fijo, así un cambio de regla no rompe las fechas.
 */
export const ZONA_NEGOCIO = "America/Mexico_City";

/** "2026-10-05" a partir de un instante UTC, leído como día del negocio. */
export function diaDe(isoUTC: string): string {
  return new Date(isoUTC).toLocaleDateString("en-CA", { timeZone: ZONA_NEGOCIO });
}

/** Hora del negocio "14:30" a partir de un instante UTC. */
export function horaDe(isoUTC: string): string {
  return new Date(isoUTC).toLocaleTimeString("es-MX", {
    timeZone: ZONA_NEGOCIO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
