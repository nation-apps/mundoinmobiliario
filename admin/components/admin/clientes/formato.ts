import { diaDe, horaDe } from "@/lib/admin/rango";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * "12 mar 2025" a partir de un instante UTC, leído en el día del negocio.
 * Se muestran fechas de años distintos, así que el año nunca se omite.
 */
export function fechaLima(isoUTC: string | null | undefined): string {
  if (!isoUTC) return "—";
  const [y, m, d] = diaDe(isoUTC).split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]} ${y}`;
}

/** "12 mar 2025 · 14:30" */
export function fechaHoraLima(isoUTC: string | null | undefined): string {
  if (!isoUTC) return "—";
  return `${fechaLima(isoUTC)} · ${horaDe(isoUTC)}`;
}
