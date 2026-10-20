import { supabase } from "../client.js";

/** El nombre de una persona del equipo (para firmar un mensaje a su nombre). Null si no existe. */
export async function nombreDeStaff(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("staff").select("nombre").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as { nombre: string } | null)?.nombre ?? null;
}
