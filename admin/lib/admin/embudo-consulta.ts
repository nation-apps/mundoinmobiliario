import type { SupabaseClient } from "@supabase/supabase-js";
import { DIAS_CERRADAS } from "./embudo";
import { rangoDeFecha, rangoIso, type FiltroFecha } from "./filtro-fechas";
import type { ClienteEtiqueta, ConversacionResumen, Etiqueta, StaffMiembro } from "./chats-tipos";

/** Tope de tarjetas abiertas por seguridad: más que esto en un negocio de esta escala sería un error de carga. */
const TOPE_ABIERTAS = 600;
const TOPE_CERRADAS = 300;
/** Con filtro de fecha se traen además las del periodo (también cerradas más viejas que DIAS_CERRADAS). */
const TOPE_DEL_PERIODO = 600;

export type DatosEmbudo = {
  conversaciones: ConversacionResumen[];
  etiquetas: Etiqueta[];
  clienteEtiquetas: ClienteEtiqueta[];
  staff: StaffMiembro[];
};

/**
 * Las consultas del tablero. Sirven con el cliente del servidor (carga inicial) y con el del navegador (recarga en
 * vivo): ambos respetan la sesión del staff y RLS. Si algo falla devuelve `error` y deja lo demás vacío.
 */
export async function leerEmbudo(
  supabase: SupabaseClient,
  fecha?: FiltroFecha,
): Promise<{ datos: DatosEmbudo; error: string | null }> {
  const desde = new Date(Date.now() - DIAS_CERRADAS * 86_400_000).toISOString();
  const periodo = rangoIso(fecha ? rangoDeFecha(fecha) : null);
  const consultaPeriodo = () => {
    let q = supabase.from("conversaciones_resumen").select("*");
    if (periodo.desde) q = q.gte("created_at", periodo.desde);
    if (periodo.hasta) q = q.lt("created_at", periodo.hasta);
    return q.order("created_at", { ascending: false }).limit(TOPE_DEL_PERIODO);
  };
  const [abiertas, cerradas, etiquetas, clienteEtiquetas, staff, delPeriodo] = await Promise.all([
    supabase
      .from("conversaciones_resumen")
      .select("*")
      .not("etapa", "in", "(vendido,no_vendido)")
      .order("actividad_at", { ascending: false })
      .limit(TOPE_ABIERTAS),
    supabase
      .from("conversaciones_resumen")
      .select("*")
      .in("etapa", ["vendido", "no_vendido"])
      .gte("actividad_at", desde)
      .order("actividad_at", { ascending: false })
      .limit(TOPE_CERRADAS),
    supabase.from("etiquetas").select("id, nombre, color").order("nombre"),
    supabase.from("cliente_etiquetas").select("cliente_id, etiqueta_id"),
    supabase.from("staff").select("user_id, nombre, rol").eq("activo", true).order("nombre"),
    periodo.desde || periodo.hasta ? consultaPeriodo() : Promise.resolve({ data: [] as ConversacionResumen[], error: null }),
  ]);
  const error = abiertas.error?.message ?? cerradas.error?.message ?? null;
  return {
    error,
    datos: {
      conversaciones: sinRepetir([
        ...((abiertas.data ?? []) as ConversacionResumen[]),
        ...((cerradas.data ?? []) as ConversacionResumen[]),
        ...((delPeriodo.data ?? []) as ConversacionResumen[]),
      ]),
      etiquetas: (etiquetas.data ?? []) as Etiqueta[],
      clienteEtiquetas: (clienteEtiquetas.data ?? []) as ClienteEtiqueta[],
      staff: (staff.data ?? []) as StaffMiembro[],
    },
  };
}

function sinRepetir(lista: ConversacionResumen[]): ConversacionResumen[] {
  const vistas = new Set<string>();
  return lista.filter((c) => (vistas.has(c.id) ? false : (vistas.add(c.id), true)));
}
