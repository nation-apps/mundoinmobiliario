import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso suspendido" };

export default async function SuspendidoPage() {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  return (
    <div className="admin-card mx-auto mt-10 flex max-w-md flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-bg-soft text-ink-soft">
        <LockKeyhole size={22} aria-hidden />
      </span>
      <h1 className="t-titulo text-[30px]">Acceso suspendido</h1>
      <p className="text-sm text-ink-soft">
        El pago de la suscripción del CRM está pendiente. Avísale a la administración para que lo active y el panel vuelva a abrirse.
      </p>
    </div>
  );
}
