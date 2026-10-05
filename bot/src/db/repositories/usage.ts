import { supabase } from "../client.js";
import { env } from "../../config/env.js";

function hoyDelNegocio(): string {
  // El día del contador es el día del negocio (BUSINESS_TIMEZONE), no el del servidor.
  return new Intl.DateTimeFormat("en-CA", { timeZone: env.BUSINESS_TIMEZONE }).format(new Date());
}

export async function getTodayUsage(): Promise<number> {
  const { data, error } = await supabase
    .from("bot_daily_usage")
    .select("tokens_used")
    .eq("usage_date", hoyDelNegocio())
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.tokens_used) : 0;
}

/** Suma tokens al contador del día (del negocio), creando la fila si no existe. */
export async function incrementTokenUsage(tokens: number): Promise<void> {
  const usageDate = hoyDelNegocio();
  const { error } = await supabase.rpc("increment_bot_usage", {
    p_date: usageDate,
    p_tokens: tokens,
  });
  if (error) throw error;
}
