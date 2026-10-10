import { redirect } from "next/navigation";
import { Shuffle } from "lucide-react";
import Reparto from "@/components/admin/reparto/Reparto";
import { PageHeader } from "@/components/admin/ui";
import { desdeHaceDias, type ConteoReparto, type MiembroReparto, type RepartoConfig } from "@/lib/admin/reparto";
import { createServerSupabase, getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reparto de leads" };

/** Ventana de las estadísticas de la página. */
const DIAS_ESTADISTICAS = 30;

export default async function RepartoPage() {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?next=/admin/reparto");
  // Un vendedor no configura el reparto (y la base tampoco se lo deja leer: is_staff()).
  if (staff.rol === "vendedor") redirect("/admin/chats");

  const supabase = await createServerSupabase();
  const desde = desdeHaceDias(DIAS_ESTADISTICAS);
  const [configRes, equipoRes, registroRes] = await Promise.all([
    supabase
      .from("reparto_config")
      .select("modo, alcance, participantes, porcentajes, mismo_vendedor, updated_at")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("staff").select("user_id, nombre, email, rol").eq("activo", true).order("nombre"),
    supabase.from("reparto_asignaciones").select("user_id, motivo").gte("created_at", desde).limit(10000),
  ]);

  // Sin la migración 0004 la tabla no existe: se avisa en vez de responder un 500.
  if (configRes.error) console.error("[reparto] No se pudo leer reparto_config:", configRes.error.message);

  const conteo = new Map<string, ConteoReparto>();
  for (const fila of (registroRes.data ?? []) as { user_id: string; motivo: string }[]) {
    const actual = conteo.get(fila.user_id) ?? { user_id: fila.user_id, reparto: 0, mismoCliente: 0 };
    if (fila.motivo === "mismo_cliente") actual.mismoCliente += 1;
    else actual.reparto += 1;
    conteo.set(fila.user_id, actual);
  }

  return (
    <>
      <PageHeader
        eyebrow="Ajustes"
        titulo="Reparto de leads"
        icono={<Shuffle size={20} strokeWidth={1.9} />}
        descripcion="Cómo se asignan los chats nuevos entre los vendedores: al azar o por porcentaje."
      />
      <Reparto
        inicial={(configRes.data as RepartoConfig | null) ?? null}
        equipo={(equipoRes.data ?? []) as MiembroReparto[]}
        conteo={[...conteo.values()]}
        diasEstadisticas={DIAS_ESTADISTICAS}
        usuarioId={staff.userId}
      />
    </>
  );
}
