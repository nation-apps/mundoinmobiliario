import { supabase } from "../client.js";
import type { CambioSuscripcion, EstadoSuscripcion } from "../../stripe/estado.js";

export type Suscripcion = {
  estado: EstadoSuscripcion;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  periodo_fin: string | null;
  cancela_al_final: boolean;
  pendiente_desde: string | null;
  email: string | null;
  ultimo_evento_at: string | null;
};

export async function leerSuscripcion(): Promise<Suscripcion> {
  const { data, error } = await supabase.from("suscripcion").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return (
    (data as Suscripcion | null) ?? {
      estado: "sin_suscripcion",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      periodo_fin: null,
      cancela_al_final: false,
      pendiente_desde: null,
      email: null,
      ultimo_evento_at: null,
    }
  );
}

/** true si el evento es nuevo; false si ya se había procesado (Stripe repite avisos). */
export async function registrarEventoStripe(id: string, tipo: string): Promise<boolean> {
  const { error } = await supabase.from("stripe_eventos").insert({ id, tipo });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

/** Si el procesamiento falla, el evento se olvida para que el reintento de Stripe lo aplique. */
export async function olvidarEventoStripe(id: string): Promise<void> {
  await supabase.from("stripe_eventos").delete().eq("id", id);
}

export async function guardarSuscripcion(parche: Partial<CambioSuscripcion> & { pendiente_desde?: string | null; ultimo_evento_at?: string }): Promise<void> {
  const { error } = await supabase
    .from("suscripcion")
    .upsert({ id: 1, ...parche }, { onConflict: "id" });
  if (error) throw error;
}
