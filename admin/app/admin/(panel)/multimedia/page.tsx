import { redirect } from "next/navigation";
import { Images } from "lucide-react";
import Multimedia, { type ItemMultimedia } from "@/components/admin/multimedia/Multimedia";
import { PageHeader } from "@/components/admin/ui";
import { createServerSupabase, getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Multimedia del bot" };

export default async function MultimediaPage() {
  // El layout ya redirige, pero los layouts no se re-evalúan al navegar
  // entre páginas del panel: cada página comprueba la sesión por su cuenta.
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?next=/admin/multimedia");

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("plantillas_media")
    .select("id, nombre, tipo, storage_path, descripcion_uso, caption, activo")
    .order("created_at", { ascending: false });
  if (error) console.error("[multimedia] No se pudo leer plantillas_media:", error.message);

  const urlBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/plantillas-media/`;

  return (
    <>
      <PageHeader
        eyebrow="Ajustes"
        titulo="Multimedia del bot"
        icono={<Images size={20} strokeWidth={1.9} />}
        descripcion="Fotos, videos y documentos que el bot y el equipo pueden mandar en los chats."
      />
      <Multimedia items={(data ?? []) as ItemMultimedia[]} urlBase={urlBase} />
    </>
  );
}
