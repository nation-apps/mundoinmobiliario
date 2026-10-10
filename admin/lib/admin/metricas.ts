/**
 * Métricas de la bandeja: funciones puras, sin Supabase ni React, para que el
 * cálculo se pueda probar aparte. Las lee /admin/metricas (lib/admin/metricas-carga.ts
 * trae las filas; components/admin/metricas/* las dibuja).
 *
 * Criterios:
 * - El periodo cuenta las conversaciones CREADAS en él (cohorte): sus etapas,
 *   cierres y tiempos de respuesta son los de hoy.
 * - «Sin responder» y «abiertas» son en vivo, no dependen del periodo.
 * - Días y horas en la zona del negocio (Cancún).
 */

import { ZONA_NEGOCIO } from "./rango";
import type { Canal, Etapa, EstadoConversacion, MotivoCierre, OrigenConversacion, RolMensaje } from "./chats-tipos";

/* ---------- Entradas ---------- */

/** Columnas de `conversaciones` que usan las métricas. */
export type FilaMetrica = {
  id: string;
  canal: Canal;
  origen: OrigenConversacion;
  hilo_externo: string | null;
  estado: EstadoConversacion;
  etapa: Etapa;
  motivo_cierre: MotivoCierre | null;
  asignada_a: string | null;
  fuente: string | null;
  created_at: string;
  primera_respuesta_at: string | null;
  primera_respuesta_humana_at: string | null;
};

/** Conversación abierta ahora (de `conversaciones_resumen`, que sabe quién escribió al final). */
export type FilaAbierta = {
  id: string;
  asignada_a: string | null;
  ultimo_rol: RolMensaje | null;
  estado: EstadoConversacion;
};

export type MiembroEquipo = { user_id: string; nombre: string; rol: string; activo: boolean };

/* ---------- Periodos ---------- */

export type PeriodoId = "hoy" | "7d" | "30d" | "90d" | "mes";

export const PERIODOS: { id: PeriodoId; label: string; comparado: string }[] = [
  { id: "hoy", label: "Hoy", comparado: "ayer a esta hora" },
  { id: "7d", label: "Últimos 7 días", comparado: "los 7 días anteriores" },
  { id: "30d", label: "Últimos 30 días", comparado: "los 30 días anteriores" },
  { id: "90d", label: "Últimos 90 días", comparado: "los 90 días anteriores" },
  { id: "mes", label: "Este mes", comparado: "el mes pasado a esta altura" },
];

export const PERIODO_POR_DEFECTO: PeriodoId = "30d";

export function esPeriodo(valor: unknown): valor is PeriodoId {
  return PERIODOS.some((p) => p.id === valor);
}

/** Minutos que la zona está adelantada respecto de UTC en ese instante (Cancún: −300). */
function desfaseMin(instante: Date, zona: string): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  const comoUtc = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second);
  return Math.round((comoUtc - instante.getTime()) / 60_000);
}

/** "2026-10-09" del negocio para ese instante. */
export function diaLocal(instante: Date, zona = ZONA_NEGOCIO): string {
  return instante.toLocaleDateString("en-CA", { timeZone: zona });
}

/** Hora del negocio (0–23) para ese instante. */
function horaLocal(instante: Date, zona: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: zona, hour: "numeric", hourCycle: "h23" }).format(instante));
}

/** Día de la semana del negocio, lunes = 0 … domingo = 6. */
function diaSemanaLocal(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Instante UTC de las 00:00 del negocio en ese día. */
export function medianoche(ymd: string, zona = ZONA_NEGOCIO): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const tentativa = new Date(Date.UTC(y, m - 1, d));
  return new Date(tentativa.getTime() - desfaseMin(tentativa, zona) * 60_000);
}

function sumarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

export type Rango = {
  inicio: Date;
  fin: Date;
  /** El mismo tramo justo antes, para comparar. */
  previoInicio: Date;
  previoFin: Date;
  granularidad: "hora" | "dia" | "semana";
};

export function rangoDelPeriodo(periodo: PeriodoId, ahora: Date, zona = ZONA_NEGOCIO): Rango {
  const hoy = diaLocal(ahora, zona);
  const desdeDias = (dias: number, granularidad: Rango["granularidad"]): Rango => {
    const inicio = medianoche(sumarDias(hoy, -(dias - 1)), zona);
    return {
      inicio,
      fin: ahora,
      previoInicio: medianoche(sumarDias(hoy, -(2 * dias - 1)), zona),
      previoFin: inicio,
      granularidad,
    };
  };
  switch (periodo) {
    case "hoy": {
      const inicio = medianoche(hoy, zona);
      // Ayer hasta la misma hora: comparar un día a medias con uno entero engañaría.
      return {
        inicio,
        fin: ahora,
        previoInicio: medianoche(sumarDias(hoy, -1), zona),
        previoFin: new Date(ahora.getTime() - 86_400_000),
        granularidad: "hora",
      };
    }
    case "7d":
      return desdeDias(7, "dia");
    case "30d":
      return desdeDias(30, "dia");
    case "90d":
      return desdeDias(90, "semana");
    case "mes": {
      const inicio = medianoche(`${hoy.slice(0, 7)}-01`, zona);
      const [y, m] = hoy.split("-").map(Number);
      const mesPrevio = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
      const previoInicio = medianoche(`${mesPrevio}-01`, zona);
      return {
        inicio,
        fin: ahora,
        previoInicio,
        previoFin: new Date(Math.min(previoInicio.getTime() + (ahora.getTime() - inicio.getTime()), inicio.getTime())),
        granularidad: "dia",
      };
    }
  }
}

/* ---------- Clasificaciones ---------- */

/**
 * Series de la gráfica de entradas, en el orden fijo de su color (el orden
 * es lo que mantiene distinguibles a los vecinos con daltonismo; se validó
 * con el validador de paletas de dataviz). «Otros» va en gris.
 */
export type SerieEntrada = "anuncio" | "instagram" | "whatsapp" | "messenger" | "otros";

export const SERIES: { id: SerieEntrada; label: string; color: string }[] = [
  { id: "anuncio", label: "Formularios de anuncios", color: "#2b50ec" },
  { id: "instagram", label: "Instagram", color: "#eb6834" },
  { id: "whatsapp", label: "WhatsApp", color: "#1baf7a" },
  { id: "messenger", label: "Messenger", color: "#eda100" },
  { id: "otros", label: "Otros (comentarios, sitio web, TikTok)", color: "#a8b1bf" },
];

/** Mismo valor que HILO_LEAD_ADS (chats-tipos): se repite para que este archivo no dependa de nada más. */
const HILO_LEAD_ADS = "facebook_lead_ads";

export function serieDe(f: Pick<FilaMetrica, "canal" | "origen" | "hilo_externo">): SerieEntrada {
  if (f.canal === "web" && f.hilo_externo === HILO_LEAD_ADS) return "anuncio";
  if (f.origen === "dm" && (f.canal === "whatsapp" || f.canal === "messenger" || f.canal === "instagram")) return f.canal;
  return "otros";
}

export function esCampana(fuente: string | null): boolean {
  return fuente?.startsWith("Campaña ") ?? false;
}

/** Nadie la tomó: sigue abierta, en «Nueva» y sin respuesta de una persona. */
function sinAtender(f: FilaMetrica): boolean {
  return f.estado !== "cerrada" && f.etapa === "nuevo" && f.primera_respuesta_humana_at === null;
}

function minutosEntre(desde: string, hasta: string | null): number | null {
  if (!hasta) return null;
  const min = (Date.parse(hasta) - Date.parse(desde)) / 60_000;
  return Number.isFinite(min) && min >= 0 ? min : null;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

/**
 * Menos de 5 segundos no es una respuesta de una persona: es un chat que abrió
 * el propio equipo (p. ej. un mensaje mandado desde Business Suite, que llega
 * como eco y crea la conversación). Se deja fuera para no inflar la mediana.
 */
const RESPUESTA_HUMANA_MINIMA_MIN = 5 / 60;

function minutosHumanos(filas: FilaMetrica[]): number[] {
  return filas
    .map((f) => minutosEntre(f.created_at, f.primera_respuesta_humana_at))
    .filter((m): m is number => m !== null && m >= RESPUESTA_HUMANA_MINIMA_MIN);
}

/* ---------- Resultado ---------- */

export type Kpis = {
  entradas: number;
  entradasPrevias: number;
  deCampana: number;
  sinResponderAhora: number;
  abiertasAhora: number;
  /** Mediana, en minutos, de la primera respuesta de una persona (null si nadie respondió). */
  respuestaHumanaMin: number | null;
  respuestaHumanaPreviaMin: number | null;
  respondidasPorPersona: number;
  /** Mediana de la primera respuesta, del bot o de una persona. */
  respuestaCualquieraMin: number | null;
  ganadas: number;
  cerradas: number;
};

export type Cubeta = { clave: string; etiqueta: string; detalle: string; valores: Record<SerieEntrada, number>; total: number; futura: boolean };

export type FilaOrigen = {
  origen: string;
  campana: boolean;
  entradas: number;
  sinAtender: number;
  conVisita: number;
  ganadas: number;
  respuestaHumanaMin: number | null;
};

export type FilaVendedor = {
  userId: string | null;
  nombre: string;
  rol: string;
  asignadas: number;
  abiertasAhora: number;
  sinResponderAhora: number;
  ganadas: number;
  perdidas: number;
  respuestaHumanaMin: number | null;
};

export type ConteoEtapa = { etapa: Exclude<Etapa, "cerrado">; total: number };

export type Cierres = { ganadas: number; perdidas: number; otras: number };

export type Metricas = {
  periodo: PeriodoId;
  inicio: string;
  fin: string;
  granularidad: Rango["granularidad"];
  generadoEn: string;
  /** Se llegó al tope de filas: los números de este periodo pueden quedar cortos. */
  truncado: boolean;
  kpis: Kpis;
  serie: Cubeta[];
  totalesSerie: Record<SerieEntrada, number>;
  porOrigen: FilaOrigen[];
  porVendedor: FilaVendedor[];
  etapas: ConteoEtapa[];
  cierres: Cierres;
  /** [lunes … domingo][0 … 23 h]: cuántas conversaciones empezaron a esa hora. */
  calor: number[][];
};

const ETAPAS_ABIERTAS: Exclude<Etapa, "cerrado">[] = ["nuevo", "en_atencion", "calificado", "agendado", "propuesta"];

function serieVacia(): Record<SerieEntrada, number> {
  return { anuncio: 0, instagram: 0, whatsapp: 0, messenger: 0, otros: 0 };
}

const NOMBRE_DIA_CORTO = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

function etiquetaDia(ymd: string): { etiqueta: string; detalle: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d, 12));
  const mes = fecha.toLocaleDateString("es-MX", { timeZone: "UTC", month: "short" }).replace(".", "");
  return {
    etiqueta: `${d} ${mes}`,
    detalle: fecha.toLocaleDateString("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }),
  };
}

/** Cubetas vacías del periodo (todas, aunque no haya entradas: un hueco también es un dato). */
function armarCubetas(rango: Rango, zona: string): { cubetas: Cubeta[]; claveDe: (iso: string) => string } {
  const cubetas: Cubeta[] = [];
  const ahora = rango.fin;
  if (rango.granularidad === "hora") {
    const horaActual = horaLocal(ahora, zona);
    for (let h = 0; h < 24; h++) {
      cubetas.push({
        clave: String(h),
        etiqueta: `${String(h).padStart(2, "0")}h`,
        detalle: `De ${String(h).padStart(2, "0")}:00 a ${String(h).padStart(2, "0")}:59`,
        valores: serieVacia(),
        total: 0,
        futura: h > horaActual,
      });
    }
    return { cubetas, claveDe: (iso) => String(horaLocal(new Date(iso), zona)) };
  }

  const primerDia = diaLocal(rango.inicio, zona);
  const ultimoDia = diaLocal(ahora, zona);
  if (rango.granularidad === "dia") {
    for (let dia = primerDia; dia <= ultimoDia; dia = sumarDias(dia, 1)) {
      cubetas.push({ clave: dia, ...etiquetaDia(dia), valores: serieVacia(), total: 0, futura: false });
    }
    return { cubetas, claveDe: (iso) => diaLocal(new Date(iso), zona) };
  }

  // Semanas de lunes a domingo; la primera puede empezar a media semana.
  const lunesDe = (ymd: string) => sumarDias(ymd, -diaSemanaLocal(ymd));
  for (let lunes = lunesDe(primerDia); lunes <= ultimoDia; lunes = sumarDias(lunes, 7)) {
    const desde = lunes < primerDia ? primerDia : lunes;
    const hasta = sumarDias(lunes, 6) > ultimoDia ? ultimoDia : sumarDias(lunes, 6);
    const a = etiquetaDia(desde);
    const b = etiquetaDia(hasta);
    cubetas.push({ clave: lunes, etiqueta: a.etiqueta, detalle: `Semana del ${a.etiqueta} al ${b.etiqueta}`, valores: serieVacia(), total: 0, futura: false });
  }
  return { cubetas, claveDe: (iso) => lunesDe(diaLocal(new Date(iso), zona)) };
}

export function calcularMetricas({
  periodo,
  rango,
  filas,
  abiertas,
  equipo,
  truncado = false,
  zona = ZONA_NEGOCIO,
}: {
  periodo: PeriodoId;
  rango: Rango;
  /** Conversaciones creadas entre `rango.previoInicio` y `rango.fin`. */
  filas: FilaMetrica[];
  abiertas: FilaAbierta[];
  equipo: MiembroEquipo[];
  truncado?: boolean;
  zona?: string;
}): Metricas {
  const ini = rango.inicio.getTime();
  const fin = rango.fin.getTime();
  const pIni = rango.previoInicio.getTime();
  const pFin = rango.previoFin.getTime();
  const actuales: FilaMetrica[] = [];
  const previas: FilaMetrica[] = [];
  for (const f of filas) {
    const t = Date.parse(f.created_at);
    if (t >= ini && t <= fin) actuales.push(f);
    else if (t >= pIni && t < pFin) previas.push(f);
  }

  const esperando = (a: FilaAbierta) => a.estado !== "cerrada" && a.ultimo_rol === "user";
  const abiertasVivas = abiertas.filter((a) => a.estado !== "cerrada");

  const tiemposHumanos = minutosHumanos(actuales);
  const tiemposCualquiera = actuales
    .map((f) => minutosEntre(f.created_at, f.primera_respuesta_at))
    .filter((m): m is number => m !== null);

  const kpis: Kpis = {
    entradas: actuales.length,
    entradasPrevias: previas.length,
    deCampana: actuales.filter((f) => esCampana(f.fuente)).length,
    sinResponderAhora: abiertasVivas.filter(esperando).length,
    abiertasAhora: abiertasVivas.length,
    respuestaHumanaMin: mediana(tiemposHumanos),
    respuestaHumanaPreviaMin: mediana(minutosHumanos(previas)),
    respondidasPorPersona: tiemposHumanos.length,
    respuestaCualquieraMin: mediana(tiemposCualquiera),
    ganadas: actuales.filter((f) => f.motivo_cierre === "ganado").length,
    cerradas: actuales.filter((f) => f.estado === "cerrada").length,
  };

  // Serie en el tiempo
  const { cubetas, claveDe } = armarCubetas(rango, zona);
  const porClave = new Map(cubetas.map((c) => [c.clave, c]));
  const totalesSerie = serieVacia();
  for (const f of actuales) {
    const serie = serieDe(f);
    totalesSerie[serie]++;
    const cubeta = porClave.get(claveDe(f.created_at));
    if (!cubeta) continue;
    cubeta.valores[serie]++;
    cubeta.total++;
  }

  // Por origen
  const grupos = new Map<string, FilaMetrica[]>();
  for (const f of actuales) {
    const clave = f.fuente?.trim() || "Sin origen registrado";
    const lista = grupos.get(clave);
    if (lista) lista.push(f);
    else grupos.set(clave, [f]);
  }
  const porOrigen: FilaOrigen[] = [...grupos.entries()]
    .map(([origen, lista]) => ({
      origen,
      campana: esCampana(origen),
      entradas: lista.length,
      sinAtender: lista.filter(sinAtender).length,
      conVisita: lista.filter((f) => f.etapa === "agendado" || f.etapa === "propuesta").length,
      ganadas: lista.filter((f) => f.motivo_cierre === "ganado").length,
      respuestaHumanaMin: mediana(minutosHumanos(lista)),
    }))
    .sort((a, b) => b.entradas - a.entradas || Number(b.campana) - Number(a.campana) || a.origen.localeCompare(b.origen, "es"));

  // Por vendedor: todo el equipo activo, más quien tenga conversaciones aunque ya no esté activo.
  const miembros = new Map(equipo.map((m) => [m.user_id, m]));
  const ids = new Set<string>(equipo.filter((m) => m.activo).map((m) => m.user_id));
  for (const f of actuales) if (f.asignada_a) ids.add(f.asignada_a);
  for (const a of abiertasVivas) if (a.asignada_a) ids.add(a.asignada_a);
  const filaVendedor = (userId: string | null): FilaVendedor => {
    const propias = actuales.filter((f) => f.asignada_a === userId);
    const vivas = abiertasVivas.filter((a) => a.asignada_a === userId);
    const miembro = userId ? miembros.get(userId) : undefined;
    return {
      userId,
      nombre: userId ? (miembro?.nombre ?? "Persona fuera del equipo") : "Sin asignar",
      rol: miembro?.rol ?? "",
      asignadas: propias.length,
      abiertasAhora: vivas.length,
      sinResponderAhora: vivas.filter(esperando).length,
      ganadas: propias.filter((f) => f.motivo_cierre === "ganado").length,
      perdidas: propias.filter((f) => f.motivo_cierre === "perdido").length,
      respuestaHumanaMin: mediana(minutosHumanos(propias)),
    };
  };
  const porVendedor = [...ids]
    .map(filaVendedor)
    .sort((a, b) => b.asignadas - a.asignadas || b.abiertasAhora - a.abiertasAhora || a.nombre.localeCompare(b.nombre, "es"));
  const sinAsignar = filaVendedor(null);
  if (sinAsignar.asignadas > 0 || sinAsignar.abiertasAhora > 0) porVendedor.push(sinAsignar);

  // Etapas y cierres
  const etapas = ETAPAS_ABIERTAS.map((etapa) => ({
    etapa,
    total: actuales.filter((f) => f.estado !== "cerrada" && f.etapa === etapa).length,
  }));
  const cerradas = actuales.filter((f) => f.estado === "cerrada");
  const cierres: Cierres = {
    ganadas: cerradas.filter((f) => f.motivo_cierre === "ganado").length,
    perdidas: cerradas.filter((f) => f.motivo_cierre === "perdido").length,
    otras: cerradas.filter((f) => f.motivo_cierre !== "ganado" && f.motivo_cierre !== "perdido").length,
  };

  // Mapa de calor: día de la semana × hora
  const calor = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const f of actuales) {
    const instante = new Date(f.created_at);
    calor[diaSemanaLocal(diaLocal(instante, zona))][horaLocal(instante, zona)]++;
  }

  return {
    periodo,
    inicio: rango.inicio.toISOString(),
    fin: rango.fin.toISOString(),
    granularidad: rango.granularidad,
    generadoEn: rango.fin.toISOString(),
    truncado,
    kpis,
    serie: cubetas,
    totalesSerie,
    porOrigen,
    porVendedor,
    etapas,
    cierres,
    calor,
  };
}

/* ---------- Formato ---------- */

/** 0.4 → "<1 min", 7 → "7 min", 85 → "1 h 25 min", 3000 → "2 d 2 h". */
export function duracionCorta(minutos: number | null): string {
  if (minutos === null) return "—";
  if (minutos < 1) return "<1 min";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  if (minutos < 24 * 60) {
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos - h * 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(minutos / 1440);
  const h = Math.round((minutos - d * 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

export const DIAS_SEMANA = NOMBRE_DIA_CORTO;
