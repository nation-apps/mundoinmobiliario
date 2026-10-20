/**
 * Agenda del equipo (calendario y alertas): lógica pura, sin Supabase ni React. Las fechas se piensan en hora de Cancún
 * (UTC−5, sin horario de verano), que es la del negocio.
 *
 * Alertas de un apartado (o de cualquier evento pendiente): 3 días antes, 1 día antes y el mismo día. No hay una tarea
 * programada: al abrir el panel se calcula en qué punto está cada evento (`alertaDe`) y se avisa una vez por punto (`hitoDe`).
 */

import { ZONA_NEGOCIO } from "./rango";

export type TipoAgenda = "apartado" | "visita" | "llamada" | "otro";
export type EstadoAgenda = "pendiente" | "hecho" | "cancelado";

export const TIPOS_AGENDA: TipoAgenda[] = ["apartado", "visita", "llamada", "otro"];

export const TIPO_AGENDA_LABEL: Record<TipoAgenda, string> = {
  apartado: "Apartar moto",
  visita: "Visita a la sucursal",
  llamada: "Llamada",
  otro: "Otro",
};

export type EventoAgenda = {
  id: string;
  tipo: TipoAgenda;
  titulo: string;
  notas: string | null;
  fecha_hora: string;
  estado: EstadoAgenda;
  cliente_id: string | null;
  conversacion_id: string | null;
  asignada_a: string | null;
  creado_por: string | null;
  created_at: string;
};

export const COLUMNAS_AGENDA = "id, tipo, titulo, notas, fecha_hora, estado, cliente_id, conversacion_id, asignada_a, creado_por, created_at";

/* ---------- Fechas en hora de Cancún ---------- */

/** «2026-10-25» (día de Cancún) de un instante. */
export function diaCancun(instante: string | number | Date): string {
  return new Date(instante).toLocaleDateString("en-CA", { timeZone: ZONA_NEGOCIO });
}

/** Días de calendario entre dos días «YYYY-MM-DD» (positivo si `hasta` es después). */
export function diasEntre(desde: string, hasta: string): number {
  const [ya, ma, da] = desde.split("-").map(Number);
  const [yb, mb, db] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(yb!, mb! - 1, db!) - Date.UTC(ya!, ma! - 1, da!)) / 86_400_000);
}

/** Cuántos días faltan (0 = hoy, negativo = ya pasó), contando días de Cancún y no horas. */
export function diasHasta(fechaHora: string, ahora: number | Date = Date.now()): number {
  return diasEntre(diaCancun(ahora), diaCancun(fechaHora));
}

/** Un valor de `<input type="datetime-local">` («2026-10-25T14:30», hora de Cancún) a un instante UTC en ISO. */
export function deInputLocal(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}:00-05:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/** Un instante a un valor de `<input type="datetime-local">` en hora de Cancún. */
export function aInputLocal(instante: string | number | Date): string {
  const f = new Date(instante);
  const dia = f.toLocaleDateString("en-CA", { timeZone: ZONA_NEGOCIO });
  const hora = f.toLocaleTimeString("en-GB", { timeZone: ZONA_NEGOCIO, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dia}T${hora === "24:00" ? "00:00" : hora}`;
}

export function horaCancun(instante: string | number | Date): string {
  return new Date(instante).toLocaleTimeString("es-MX", { timeZone: ZONA_NEGOCIO, hour: "numeric", minute: "2-digit", hour12: true });
}

export function fechaLargaCancun(instante: string | number | Date): string {
  return new Date(instante).toLocaleDateString("es-MX", { timeZone: ZONA_NEGOCIO, weekday: "long", day: "numeric", month: "long" });
}

/* ---------- Alertas ---------- */

export type Alerta = {
  /** `vencido`: ya pasó y sigue pendiente. `hoy`, `manana` y `pronto` (2 o 3 días) avisan; `ninguna`: falta más de 3 días o ya no importa. */
  nivel: "vencido" | "hoy" | "manana" | "pronto" | "ninguna";
  dias: number;
  texto: string;
};

/** En qué punto está un evento. Solo los pendientes avisan. */
export function alertaDe(evento: Pick<EventoAgenda, "estado" | "fecha_hora">, ahora: number | Date = Date.now()): Alerta {
  const dias = diasHasta(evento.fecha_hora, ahora);
  if (evento.estado !== "pendiente") return { nivel: "ninguna", dias, texto: "" };
  if (dias < 0) return { nivel: "vencido", dias, texto: dias === -1 ? "Venció ayer" : `Venció hace ${-dias} días` };
  if (dias === 0) return { nivel: "hoy", dias, texto: "Hoy" };
  if (dias === 1) return { nivel: "manana", dias, texto: "Mañana" };
  if (dias <= 3) return { nivel: "pronto", dias, texto: `En ${dias} días` };
  return { nivel: "ninguna", dias, texto: "" };
}

export type Hito = "3d" | "1d" | "hoy" | "vencido";

/**
 * El aviso que toca dar de un evento: «3d» desde 3 días antes, «1d» desde el día anterior, «hoy» el mismo día y «vencido»
 * después. Cada hito se avisa una sola vez (el panel recuerda cuáles ya avisó); si se abre el panel por primera vez a 2 días,
 * se da el de «3d». Null si no hay nada que avisar.
 */
export function hitoDe(evento: Pick<EventoAgenda, "estado" | "fecha_hora">, ahora: number | Date = Date.now()): Hito | null {
  const { nivel } = alertaDe(evento, ahora);
  if (nivel === "vencido") return "vencido";
  if (nivel === "hoy") return "hoy";
  if (nivel === "manana") return "1d";
  if (nivel === "pronto") return "3d";
  return null;
}

/** Cuántos eventos están pidiendo atención (vencidos, de hoy, de mañana o de los próximos 3 días). */
export function contarAlertas(eventos: Pick<EventoAgenda, "estado" | "fecha_hora">[], ahora: number | Date = Date.now()): number {
  return eventos.filter((e) => alertaDe(e, ahora).nivel !== "ninguna").length;
}

/** Los eventos de un día (YYYY-MM-DD de Cancún), por hora. */
export function eventosDelDia<T extends Pick<EventoAgenda, "fecha_hora">>(eventos: T[], dia: string): T[] {
  return eventos.filter((e) => diaCancun(e.fecha_hora) === dia).sort((a, b) => Date.parse(a.fecha_hora) - Date.parse(b.fecha_hora));
}

/* ---------- El mes ---------- */

/** Las semanas (lunes a domingo) que cubren un mes «YYYY-MM»; cada día lleva su fecha «YYYY-MM-DD» y si es del mes. */
export function semanasDelMes(mes: string): { dia: string; delMes: boolean }[][] {
  const [y, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(y!, m! - 1, 1));
  const ultimo = new Date(Date.UTC(y!, m!, 0));
  const desfase = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const inicio = new Date(primero.getTime() - desfase * 86_400_000);
  const semanas: { dia: string; delMes: boolean }[][] = [];
  for (let t = inicio.getTime(); t <= ultimo.getTime() || semanas.length === 0 || (semanas[semanas.length - 1]?.length ?? 0) < 7; ) {
    const semana: { dia: string; delMes: boolean }[] = [];
    for (let i = 0; i < 7; i++, t += 86_400_000) {
      const f = new Date(t);
      semana.push({ dia: f.toISOString().slice(0, 10), delMes: f.getUTCMonth() === m! - 1 });
    }
    semanas.push(semana);
    if (t > ultimo.getTime()) break;
  }
  return semanas;
}

export function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

/** El mes anterior (−1) o siguiente (+1) de un «YYYY-MM». */
export function moverMes(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const f = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return f.toISOString().slice(0, 7);
}

export function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 15)).toLocaleDateString("es-MX", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** El rango UTC (ISO) que cubre un mes de Cancún con una semana de margen a cada lado (lo que pinta la cuadrícula). */
export function rangoDelMes(mes: string): { desde: string; hasta: string } {
  const semanas = semanasDelMes(mes);
  const primero = semanas[0]![0]!.dia;
  const ultimo = semanas[semanas.length - 1]![6]!.dia;
  return { desde: new Date(`${primero}T00:00:00-05:00`).toISOString(), hasta: new Date(`${ultimo}T23:59:59-05:00`).toISOString() };
}
