import { NextResponse } from "next/server";
import { getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

/**
 * ¿Responde el bot? Alimenta el testigo del menú lateral. Solo toca `/health`
 * del bot (no consulta a Meta ni a la base) y mide la latencia desde el
 * servidor del panel. Nunca devuelve la URL del bot.
 */
export async function GET() {
  const staff = await getStaff();
  if (!staff) return NextResponse.json({ error: "sin_sesion" }, { status: 401 });

  const base = process.env.BOT_API_URL;
  if (!base) return NextResponse.json({ enLinea: false, motivo: "sin_configurar" });

  const inicio = performance.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json({ enLinea: res.ok, ms: Math.round(performance.now() - inicio) });
  } catch {
    return NextResponse.json({ enLinea: false, motivo: "sin_respuesta" });
  }
}
