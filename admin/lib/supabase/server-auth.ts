import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Cliente de Supabase ligado a la sesión del staff (cookies).
 * Respeta RLS: solo ve lo que permite is_staff().
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component: el refresco de sesión lo hace proxy.ts
          }
        },
      },
    }
  );
}

export type StaffUser = {
  userId: string;
  nombre: string;
  email: string;
  rol: string;
};

/**
 * Devuelve el staff autenticado, o null si no hay sesión válida.
 *
 * - `cache`: el layout y la página piden el staff en la misma petición; así la
 *   consulta se hace una sola vez.
 * - `getClaims` verifica la firma del token en el servidor (las claves
 *   asimétricas del proyecto están publicadas), sin el viaje a Supabase Auth
 *   que hace `getUser`. proxy.ts es quien refresca la sesión.
 */
export const getStaff = cache(async (): Promise<StaffUser | null> => {
  const supabase = await createServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("staff")
    .select("user_id, nombre, email, rol, activo")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || !data.activo) return null;
  return {
    userId: data.user_id,
    nombre: data.nombre,
    email: data.email,
    rol: data.rol,
  };
});
