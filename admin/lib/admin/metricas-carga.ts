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
    const mensajesConAnuncio = await todas<{ conversacion_id: string; metadata: Record<string, unknown> | null }>((desde, hasta) =>
      supabase
        .from("mensajes")
        .select("conversacion_id, metadata")
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

    return {
      ok: true,
      metricas: calcularMetricas({
        periodo,
        rango,
        filas,
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
