import { createServerSupabase } from "@/lib/supabase/server-auth";
import { SIN_SUSCRIPCION, type Suscripcion } from "./suscripcion";

/** SOLO servidor. Si la tabla aún no existe (migración 0008 sin correr) devuelve «sin suscripción» y no rompe el panel. */
export async function cargarSuscripcion(): Promise<{ suscripcion: Suscripcion; leida: boolean }> {
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("suscripcion")
      .select("estado, periodo_fin, cancela_al_final, pendiente_desde, stripe_customer_id")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("[suscripcion] No se pudo leer:", error.message);
      return { suscripcion: SIN_SUSCRIPCION, leida: false };
    }
    return { suscripcion: (data as Suscripcion | null) ?? SIN_SUSCRIPCION, leida: true };
  } catch (err) {
    console.error("[suscripcion] No se pudo leer:", err);
    return { suscripcion: SIN_SUSCRIPCION, leida: false };
  }
}
