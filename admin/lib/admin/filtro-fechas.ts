/**
 * Filtro por fecha de entrada del lead (cuándo se creó la conversación) para el embudo y la bandeja. Los días son los del
 * negocio: Cancún, UTC−5 todo el año (sin horario de verano), igual que la agenda.
 */

import { ZONA_NEGOCIO } from "./rango";

export type FechaId = "todas" | "hoy" | "ayer" | "7d" | "30d" | "mes" | "mes_pasado" | "rango";

/** `desde` y `hasta` («2026-10-23», ambos incluidos) solo cuentan con `id: "rango"`. */
export type FiltroFecha = { id: FechaId; desde: string; hasta: string };

export const FECHA_TODAS: FiltroFecha = { id: "todas", desde: "", hasta: "" };

export const OPCIONES_FECHA: { id: FechaId; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "mes", label: "Este mes" },
  { id: "mes_pasado", label: "Mes pasado" },
  { id: "rango", label: "Elegir fechas…" },
];

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** «2026-10-23» (día de Cancún) de un instante. */
function diaDe(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: ZONA_NEGOCIO });
}

function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/** El instante en que empieza ese día en Cancún. */
function inicioDe(dia: string): number {
  return Date.parse(`${dia}T00:00:00-05:00`);
}

/** El tramo [desde, hasta) en milisegundos, o null si no se filtra por fecha. */
export function rangoDeFecha(f: FiltroFecha, ahora: number = Date.now()): { desde: number; hasta: number } | null {
  const hoy = diaDe(ahora);
  const manana = inicioDe(sumarDias(hoy, 1));
  const primeroDelMes = `${hoy.slice(0, 7)}-01`;
  switch (f.id) {
    case "todas":
      return null;
    case "hoy":
      return { desde: inicioDe(hoy), hasta: manana };
    case "ayer":
      return { desde: inicioDe(sumarDias(hoy, -1)), hasta: inicioDe(hoy) };
    case "7d":
      return { desde: inicioDe(sumarDias(hoy, -6)), hasta: manana };
    case "30d":
      return { desde: inicioDe(sumarDias(hoy, -29)), hasta: manana };
    case "mes":
      return { desde: inicioDe(primeroDelMes), hasta: manana };
    case "mes_pasado": {
      const anterior = sumarDias(primeroDelMes, -1);
      return { desde: inicioDe(`${anterior.slice(0, 7)}-01`), hasta: inicioDe(primeroDelMes) };
    }
    case "rango": {
      const desde = DIA.test(f.desde) ? inicioDe(f.desde) : Number.NEGATIVE_INFINITY;
      const hasta = DIA.test(f.hasta) ? inicioDe(sumarDias(f.hasta, 1)) : Number.POSITIVE_INFINITY;
      if (desde === Number.NEGATIVE_INFINITY && hasta === Number.POSITIVE_INFINITY) return null;
      return { desde, hasta };
    }
  }
}

/** ¿El instante cae en el tramo? Sin tramo, todo cuenta. */
export function enRango(iso: string | null | undefined, rango: { desde: number; hasta: number } | null): boolean {
  if (!rango) return true;
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) && t >= rango.desde && t < rango.hasta;
}

export function hayFiltroFecha(f: FiltroFecha): boolean {
  return rangoDeFecha(f) !== null;
}

/** El tramo como ISO para consultar la base (solo los extremos que existen). */
export function rangoIso(rango: { desde: number; hasta: number } | null): { desde: string | null; hasta: string | null } {
  if (!rango) return { desde: null, hasta: null };
  return {
    desde: Number.isFinite(rango.desde) ? new Date(rango.desde).toISOString() : null,
    hasta: Number.isFinite(rango.hasta) ? new Date(rango.hasta).toISOString() : null,
  };
}
