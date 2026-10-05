import { supabase } from "../db/client.js";
import { AppError } from "./errors.js";

export type AdminUser = { id: string; email: string | null; rol: string };

/**
 * Valida el JWT de Supabase que envía el panel y exige una fila activa en
 * `staff` (la misma tabla con la que el panel decide
 * quién entra: `is_staff()`).
 *
 * El bot corre con la service role key, así que las políticas RLS NO lo
 * protegen: cada ruta /admin/* llama a esta función, obligatoriamente.
 */
export async function requireStaff(authorizationHeader: string | undefined): Promise<AdminUser> {
  const token = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice("Bearer ".length) : null;
  if (!token) throw new AppError("Falta el token de sesión", "missing_token", 401);

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AppError("Sesión inválida o expirada", "invalid_token", 401);

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("activo, rol")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff?.activo) throw new AppError("Se requiere ser parte del staff", "forbidden", 403);

  return { id: data.user.id, email: data.user.email ?? null, rol: staff.rol as string };
}
