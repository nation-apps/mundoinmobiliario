import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca la sesión de Supabase en cada request del panel (`/admin`), para
 * que los Server Components lean siempre un token vigente. Solo refresca
 * cookies: nunca redirige.
 *
 * De paso anota la ruta pedida en el header de petición `x-ruta`: un layout
 * no recibe `searchParams` ni la ruta. Se escribe siempre aquí, así que un
 * valor mandado por el navegador se pisa.
 */
export async function proxy(request: NextRequest) {
  const busqueda = new URLSearchParams(request.nextUrl.search);
  busqueda.delete("_rsc"); // parámetro interno de las navegaciones de Next
  const consulta = busqueda.toString();
  request.headers.set("x-ruta", request.nextUrl.pathname + (consulta ? `?${consulta}` : ""));

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims verifica el token sin ir a la red y lo refresca solo si venció.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
