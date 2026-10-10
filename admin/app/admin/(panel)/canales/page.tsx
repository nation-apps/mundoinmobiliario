import { redirect } from "next/navigation";
import { RadioTower } from "lucide-react";
import Canales from "@/components/admin/chats/Canales";
import { PageHeader } from "@/components/admin/ui";
import { CANALES_CONFIGURABLES, type CanalConfig } from "@/lib/admin/chats-tipos";
import { createServerSupabase, getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Canales" };

export default async function CanalesPage() {
  // El layout ya redirige, pero los layouts no se re-evalúan al navegar
  // entre páginas del panel: cada página comprueba la sesión por su cuenta.
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?next=/admin/canales");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("canales")
    .select(
      "canal, activo, ia_activa, ia_comentarios_activa, texto_respuesta_privada, cuenta_id, cuenta_nombre, ultimo_webhook_at"
    );

  // Sin la migración 0006 la tabla no existe: la página se muestra igual,
  // con el aviso de que no hay canales, en vez de responder un 500.
  if (error) console.error("[canales] No se pudo leer public.canales:", error.message);

  const filas = ((data ?? []) as CanalConfig[])
    .filter((fila) => CANALES_CONFIGURABLES.includes(fila.canal))
    .sort(
      (a, b) =>
        CANALES_CONFIGURABLES.indexOf(a.canal) - CANALES_CONFIGURABLES.indexOf(b.canal)
    );

  return (
    <>
      <PageHeader
        eyebrow="Ajustes"
        titulo="Canales"
        icono={<RadioTower size={20} strokeWidth={1.9} />}
        descripcion="Qué canales están conectados, si el bot responde en cada uno y los datos para Meta."
      />
      <Canales inicial={filas} />
    </>
  );
}
