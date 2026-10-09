/**
 * Reparto automático de conversaciones nuevas entre vendedores. El reparto lo
 * hace un trigger de Postgres al crear la conversación
 * (supabase/migrations/0004_reparto_leads.sql); aquí solo vive lo que el panel
 * necesita para configurarlo y mostrarlo.
 */

export type ModoReparto = "apagado" | "aleatorio" | "porcentaje";
export type AlcanceReparto = "todas" | "formularios";

/** public.reparto_config (una sola fila, id = 1). */
export type RepartoConfig = {
  modo: ModoReparto;
  alcance: AlcanceReparto;
  participantes: string[];
  porcentajes: Record<string, number>;
  mismo_vendedor: boolean;
  updated_at: string;
};

export type MiembroReparto = { user_id: string; nombre: string; email: string; rol: string };

/** Asignaciones de los últimos días, por persona (de public.reparto_asignaciones). */
export type ConteoReparto = { user_id: string; reparto: number; mismoCliente: number };

export const MODOS_REPARTO: { id: ModoReparto; label: string; ayuda: string }[] = [
  { id: "apagado", label: "Apagado", ayuda: "Las conversaciones nuevas quedan sin asignar; se asignan a mano desde el chat." },
  {
    id: "aleatorio",
    label: "Aleatorio",
    ayuda: "Cada conversación nueva se sortea entre los participantes, todos con la misma probabilidad.",
  },
  {
    id: "porcentaje",
    label: "Por porcentaje",
    ayuda:
      "Cada uno recibe su porcentaje exacto: la conversación nueva va a quien va más atrasado respecto de su parte. " +
      "Se cuenta desde la última vez que se guarda esta configuración.",
  },
];

export const ALCANCES_REPARTO: { id: AlcanceReparto; label: string }[] = [
  { id: "todas", label: "Todas las conversaciones nuevas (WhatsApp, Messenger, Instagram y formularios)" },
  { id: "formularios", label: "Solo formularios (anuncios de Facebook e Instagram y el formulario del sitio)" },
];

/** Inicio de la ventana de estadísticas: hace `dias` días, en ISO. */
export function desdeHaceDias(dias: number, ahora = Date.now()): string {
  return new Date(ahora - dias * 24 * 60 * 60 * 1000).toISOString();
}

/** Reparte 100 en enteros entre `ids`; el sobrante va a los primeros (3 personas → 34, 33, 33). */
export function porcentajesParejos(ids: string[]): Record<string, number> {
  if (ids.length === 0) return {};
  const base = Math.floor(100 / ids.length);
  const sobrante = 100 - base * ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, base + (i < sobrante ? 1 : 0)]));
}

export function sumaPorcentajes(porcentajes: Record<string, number>, ids: string[]): number {
  return ids.reduce((suma, id) => suma + (porcentajes[id] ?? 0), 0);
}

/** null si la configuración se puede guardar; si no, por qué. */
export function problemaReparto(
  config: Pick<RepartoConfig, "modo" | "participantes" | "porcentajes">,
  idsActivos: string[],
): string | null {
  if (config.modo === "aleatorio") {
    const enSorteo = config.participantes.filter((id) => idsActivos.includes(id));
    return enSorteo.length === 0 ? "Marca al menos a una persona para el sorteo." : null;
  }
  if (config.modo === "porcentaje") {
    const valores = idsActivos.map((id) => config.porcentajes[id] ?? 0);
    if (valores.some((v) => !Number.isInteger(v) || v < 0 || v > 100)) return "Cada porcentaje va de 0 a 100, sin decimales.";
    const suma = valores.reduce((a, b) => a + b, 0);
    return suma === 100 ? null : `Los porcentajes suman ${suma} %: tienen que sumar 100 %.`;
  }
  return null;
}
