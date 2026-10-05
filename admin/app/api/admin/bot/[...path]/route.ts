import { NextResponse } from "next/server";
import { createServerSupabase, getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

/**
 * Puente entre el panel (navegador) y el bot (Railway). El navegador nunca
 * conoce BOT_API_URL ni llama al bot directo: este handler comprueba que
 * haya sesión de staff, toma el JWT de Supabase de la cookie y lo manda al
 * bot como `Authorization: Bearer …` (el bot lo vuelve a validar contra la
 * tabla `staff`, ver bot/src/lib/adminAuth.ts).
 *
 * Solo se exponen las rutas /admin/* del bot. Ejemplo:
 *   POST /api/admin/bot/mensajes  →  POST {BOT_API_URL}/admin/mensajes
 */
const RUTAS_PERMITIDAS = /^(mensajes|comentarios\/[^/]+\/responder|ia\/sugerencia|clientes\/[^/]+\/(telefono|whatsapp)|canales\/estado|conversaciones\/[^/]+\/visto|plantillas|promociones)$/;

async function reenviar(req: Request, path: string[]): Promise<Response> {
  const base = process.env.BOT_API_URL;
  if (!base) {
    return NextResponse.json({ error: "bot_no_configurado", mensaje: "Falta BOT_API_URL en el servidor." }, { status: 503 });
  }
  const ruta = path.join("/");
  if (!RUTAS_PERMITIDAS.test(ruta)) {
    return NextResponse.json({ error: "ruta_no_permitida" }, { status: 404 });
  }

  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "sin_sesion" }, { status: 401 });

  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return NextResponse.json({ error: "sin_sesion" }, { status: 401 });

  const url = new URL(req.url);
  const destino = `${base.replace(/\/$/, "")}/admin/${ruta}${url.search}`;
  const body = req.method === "GET" ? undefined : await req.text();

  let res: Response;
  try {
    res = await fetch(destino, {
      method: req.method,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "bot_no_disponible", mensaje: "No se pudo conectar con el bot. Revisa que esté en línea en Railway." },
      { status: 502 },
    );
  }

  // Un 204/304 no admite cuerpo (ni vacío): `new Response("", { status: 204 })` lanza TypeError.
  if (res.status === 204 || res.status === 304) return new NextResponse(null, { status: res.status });

  const texto = await res.text();
  return new NextResponse(texto, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return reenviar(req, path);
}

export async function POST(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return reenviar(req, path);
}
