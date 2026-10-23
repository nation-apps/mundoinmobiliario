/**
 * Carga de /admin/metricas. SOLO servidor: usa la sesión del staff (RLS), así
 * que no debe importarse desde un componente con "use client".
 */

import { createServerSupabase } from "@/lib/supabase/server-auth";
import { anuncioDeMensajes } from "./anuncio";
import {
  calcularMetricas,
  rangoDelPeriodo,
  type FilaAbierta,
  type FilaMetrica,
  type Metricas,
  type MiembroEquipo,
  type PeriodoId,
} from "./metricas";

/** PostgREST devuelve hasta 1000 filas por pedido: se pide por páginas. */
const PAGINA = 1000;
/** Tope de seguridad: más que esto en un periodo y la página avisa que los números pueden quedar cortos. */
const TOPE = 20_000;

const COLUMNAS =
  "id, canal, origen, hilo_externo, estado, etapa, motivo_cierre, motivo_perdida, asignada_a, fuente, created_at, primera_respuesta_at, primera_respuesta_humana_at";

type Pagina<T> = (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function todas<T>(pedir: Pagina<T>): Promise<{ filas: T[]; truncado: boolean }> {
  const filas: T[] = [];
  for (let desde = 0; desde < TOPE; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}

export type ResultadoMetricas = { ok: true; metricas: Metricas } | { ok: false; error: string };

export async function cargarMetricas(periodo: PeriodoId): Promise<ResultadoMetricas> {
  try {
    const supabase = await createServerSupabase();
    const rango = rangoDelPeriodo(periodo, new Date());

    const [conversaciones, abiertas, equipo] = await Promise.all([
      todas<FilaMetrica>((desde, hasta) =>
        supabase
          .from("conversaciones")
          .select(COLUMNAS)
          .gte("created_at", rango.previoInicio.toISOString())
          .lte("created_at", rango.fin.toISOString())
          .order("created_at", { ascending: true })
          .range(desde, hasta),
      ),
      todas<FilaAbierta>((desde, hasta) =>
        supabase
          .from("conversaciones_resumen")
          .select("id, asignada_a, ultimo_rol, estado")
          .neq("estado", "cerrada")
          .order("id")
          .range(desde, hasta),
      ),
      supabase.from("staff").select("user_id, nombre, rol, activo"),
    ]);
    if (equipo.error) throw new Error(equipo.error.message);

    // De qué anuncio vino cada lead: lo dicen los primeros mensajes (formulario de anuncios o clic a WhatsApp).
    const mensajesConAnuncio = await todas<{ conversacion_id: string; metadata: Record<string, unknown> | null; created_at: string }>((desde, hasta) =>
      supabase
        .from("mensajes")
        .select("conversacion_id, metadata, created_at")
        .or("metadata->>ad_id.not.is.null,metadata->anuncio->>id.not.is.null")
        .gte("created_at", rango.previoInicio.toISOString())
        .order("created_at", { ascending: true })
        .range(desde, hasta),
    );
    const anuncioPorConversacion = new Map<string, ReturnType<typeof anuncioDeMensajes>>();
    for (const m of mensajesConAnuncio.filas) {
      if (anuncioPorConversacion.has(m.conversacion_id)) continue; // el primero es el que trajo al lead
      anuncioPorConversacion.set(m.conversacion_id, anuncioDeMensajes([m.metadata]));
    }
    const filas = conversaciones.filas.map((f) => {
      const anuncio = anuncioPorConversacion.get(f.id);
      return anuncio?.id ? { ...f, anuncio_id: anuncio.id, anuncio_nombre: anuncio.nombre, anuncio_campana: anuncio.campana } : f;
    });

    const filasAnuncio = await filasPorAnuncio(supabase, rango, filas, mensajesConAnuncio.filas);

    return {
      ok: true,
      metricas: calcularMetricas({
        periodo,
        rango,
        filas,
        filasAnuncio,
        abiertas: abiertas.filas,
        equipo: (equipo.data ?? []) as MiembroEquipo[],
        truncado: conversaciones.truncado || abiertas.truncado || mensajesConAnuncio.truncado,
      }),
    };
  } catch (err) {
    console.error("[metricas] No se pudieron calcular:", err);
    return { ok: false, error: "No se pudieron leer las conversaciones. Recarga la página en un momento." };
  }
}

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * «Por anuncio» contado como lo cuenta Meta: una fila por cada llegada desde un anuncio en el periodo (un formulario enviado o un
 * mensaje de clic a WhatsApp), una sola vez por conversación y anuncio, aunque la conversación sea anterior (p. ej. alguien que ya
 * escribía y hoy llenó un formulario). Las conversaciones nuevas del periodo sin ningún anuncio van como «sin anuncio».
 */
async function filasPorAnuncio(
  supabase: Supabase,
  rango: { inicio: Date; fin: Date },
  filas: FilaMetrica[],
  mensajes: { conversacion_id: string; metadata: Record<string, unknown> | null; created_at: string }[],
): Promise<FilaMetrica[]> {
  const ini = rango.inicio.getTime();
  const fin = rango.fin.getTime();
  const enPeriodo = (iso: string) => {
    const t = Date.parse(iso);
    return t >= ini && t <= fin;
  };

  const llegadas = new Map<string, { conversacionId: string; anuncio: NonNullable<ReturnType<typeof anuncioDeMensajes>> }>();
  for (const m of mensajes) {
    if (!enPeriodo(m.created_at)) continue;
    const anuncio = anuncioDeMensajes([m.metadata]);
    if (!anuncio?.id) continue;
    const clave = `${m.conversacion_id}|${anuncio.id}`;
    if (!llegadas.has(clave)) llegadas.set(clave, { conversacionId: m.conversacion_id, anuncio });
  }

  // Las conversaciones de esas llegadas que no están entre las del periodo (son anteriores): se traen aparte.
  const porId = new Map(filas.map((f) => [f.id, f]));
  const faltan = [...new Set([...llegadas.values()].map((l) => l.conversacionId))].filter((id) => !porId.has(id));
  for (let i = 0; i < faltan.length; i += 100) {
    const { data, error } = await supabase.from("conversaciones").select(COLUMNAS).in("id", faltan.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as FilaMetrica[]) porId.set(f.id, f);
  }

  const resultado: FilaMetrica[] = [];
  const conAnuncio = new Set<string>();
  for (const { conversacionId, anuncio } of llegadas.values()) {
    const f = porId.get(conversacionId);
    if (!f) continue;
    conAnuncio.add(conversacionId);
    resultado.push({ ...f, anuncio_id: anuncio.id, anuncio_nombre: anuncio.nombre, anuncio_campana: anuncio.campana });
  }
  for (const f of filas) {
    if (enPeriodo(f.created_at) && !conAnuncio.has(f.id) && !f.anuncio_id) resultado.push(f);
  }
  return resultado;
}
