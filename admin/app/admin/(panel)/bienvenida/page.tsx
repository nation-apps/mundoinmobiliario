import { redirect } from "next/navigation";
import { MessageSquareHeart } from "lucide-react";
import Bienvenida from "@/components/admin/bienvenida/Bienvenida";
import { PageHeader } from "@/components/admin/ui";
import type { ConfigBienvenida } from "@/lib/admin/bienvenida";
import { createServerSupabase, getStaff } from "@/lib/supabase/server-auth";
import { exigirSuscripcion } from "@/lib/admin/acceso-suscripcion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bienvenida" };

export default async function BienvenidaPage() {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?next=/admin/bienvenida");
  await exigirSuscripcion(staff.rol);
  // Un vendedor no la configura (y la base tampoco se lo deja leer: is_staff()).
  if (staff.rol === "vendedor") redirect("/admin/chats");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("mensajes_bienvenida")
    .select("linea, formulario_activo, formulario_texto, directo_activo, directo_texto");
  // Sin la migración 0013 la tabla no existe: se avisa en vez de responder un 500.
  if (error) console.error("[bienvenida] No se pudo leer mensajes_bienvenida:", error.message);

  return (
    <>
      <PageHeader
        eyebrow="Ajustes"
        titulo="Bienvenida"
        icono={<MessageSquareHeart size={20} strokeWidth={1.9} />}
        descripcion="El mensaje con el que cada WhatsApp da la bienvenida, escrito por ti: reemplaza al que arma el bot."
      />
      {error ? (
        <p className="admin-card px-5 py-4 text-[13px] text-ink-soft">
          No se pudo leer la configuración. Aplica la migración 0013_documentos_y_bienvenida.sql en Supabase y recarga la página.
        </p>
      ) : (
        <Bienvenida inicial={(data ?? []) as ConfigBienvenida[]} />
      )}
    </>
  );
}
