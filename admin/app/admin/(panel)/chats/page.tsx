import { Suspense } from "react";
import { redirect } from "next/navigation";
import Bandeja from "@/components/admin/chats/Bandeja";
import { cargarDatosBandeja } from "@/lib/admin/chats-carga";
import { RUTA_CHATS_PANEL } from "@/lib/admin/chats-tipos";
import { getStaff } from "@/lib/supabase/server-auth";
import CargandoChats from "./loading";

export const dynamic = "force-dynamic";

export const metadata = { title: "Chats" };

export default async function ChatsPage() {
  // El layout del panel ya redirige sin sesión, pero los layouts no se vuelven
  // a evaluar al navegar entre páginas: se repite aquí, y además de aquí sale
  // el usuarioId que necesita la bandeja ("Mías", asignaciones, notas).
  const staff = await getStaff();
  if (!staff) redirect(`/admin/login?next=${RUTA_CHATS_PANEL}`);

  const inicial = await cargarDatosBandeja();

  // <Bandeja> lee ?c=<id> con useSearchParams: va dentro de <Suspense>.
  // El estado de los canales lo pide la propia bandeja desde el navegador.
  return (
    <Suspense fallback={<CargandoChats />}>
      <Bandeja
        usuarioId={staff.userId}
        modo="panel"
        inicial={inicial}
        estadoPorDefecto={staff.rol === "vendedor" ? "mias" : "todas"}
      />
    </Suspense>
  );
}
