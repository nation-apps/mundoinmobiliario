import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import Calendario from "@/components/admin/agenda/Calendario";
import { PageHeader } from "@/components/admin/ui";
import type { StaffMiembro } from "@/lib/admin/chats-tipos";
import { createServerSupabase, getStaff } from "@/lib/supabase/server-auth";
import { exigirSuscripcion } from "@/lib/admin/acceso-suscripcion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendario" };

export default async function CalendarioPage() {
  // El layout ya redirige, pero los layouts no se re-evalúan al navegar entre páginas del panel.
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?next=/admin/calendario");
  await exigirSuscripcion(staff.rol);

  const supabase = await createServerSupabase();
  const { data } = await supabase.from("staff").select("user_id, nombre, rol").eq("activo", true).order("nombre");

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        titulo="Calendario"
        icono={<CalendarDays size={20} strokeWidth={1.9} />}
        descripcion="Apartados, visitas y llamadas del equipo. Te avisa 3 días antes, 1 día antes y el mismo día."
      />
      <Calendario usuarioId={staff.userId} rol={staff.rol} staff={(data ?? []) as StaffMiembro[]} />
    </>
  );
}
