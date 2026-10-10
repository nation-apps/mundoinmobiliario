import type { SupabaseClient } from "@supabase/supabase-js";
import { DIAS_CERRADAS } from "./embudo";
import type { ClienteEtiqueta, ConversacionResumen, Etiqueta, StaffMiembro } from "./chats-tipos";

/** Tope de tarjetas abiertas por seguridad: más que esto en un negocio de esta escala sería un error de carga. */
const TOPE_ABIERTAS = 600;
const TOPE_CERRADAS = 150;

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
export async function leerEmbudo(supabase: SupabaseClient): Promise<{ datos: DatosEmbudo; error: string | null }> {
  const desde = new Date(Date.now() - DIAS_CERRADAS * 86_400_000).toISOString();
  const [abiertas, cerradas, etiquetas, clienteEtiquetas, staff] = await Promise.all([
    supabase
      .from("conversaciones_resumen")
      .select("*")
      .neq("etapa", "cerrado")
      .order("actividad_at", { ascending: false })
      .limit(TOPE_ABIERTAS),
    supabase
      .from("conversaciones_resumen")
      .select("*")
      .eq("etapa", "cerrado")
      .gte("actividad_at", desde)
      .order("actividad_at", { ascending: false })
      .limit(TOPE_CERRADAS),
    supabase.from("etiquetas").select("id, nombre, color").order("nombre"),
    supabase.from("cliente_etiquetas").select("cliente_id, etiqueta_id"),
    supabase.from("staff").select("user_id, nombre, rol").eq("activo", true).order("nombre"),
  ]);
  const error = abiertas.error?.message ?? cerradas.error?.message ?? null;
  return {
    error,
    datos: {
      conversaciones: [...((abiertas.data ?? []) as ConversacionResumen[]), ...((cerradas.data ?? []) as ConversacionResumen[])],
      etiquetas: (etiquetas.data ?? []) as Etiqueta[],
      clienteEtiquetas: (clienteEtiquetas.data ?? []) as ClienteEtiqueta[],
      staff: (staff.data ?? []) as StaffMiembro[],
    },
  };
}
