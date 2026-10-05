import { createBrowserClient } from "@supabase/ssr";

/** Cliente de navegador con la anon key (protegido por RLS). */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
