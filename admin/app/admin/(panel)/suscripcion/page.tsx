import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import SuscripcionVista from "@/components/admin/suscripcion/Suscripcion";
import { PageHeader } from "@/components/admin/ui";
import { SUSCRIPCION_OBLIGATORIA } from "@/lib/admin/suscripcion";
import { suscripcionActual } from "@/lib/admin/acceso-suscripcion";
import { getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suscripción" };

export default async function SuscripcionPage({ searchParams }: { searchParams: Promise<{ pago?: string }> }) {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?next=/admin/suscripcion");

  const { suscripcion } = await suscripcionActual();
  const pago = (await searchParams).pago;

  return (
    <>
      <PageHeader
        eyebrow="Ajustes"
        titulo="Suscripción"
        icono={<CreditCard size={20} strokeWidth={1.9} />}
        descripcion="El plan del CRM, su estado y el medio de pago."
      />
      <SuscripcionVista
        suscripcion={suscripcion}
        esAdmin={staff.rol === "admin"}
        obligatoria={SUSCRIPCION_OBLIGATORIA}
        precio="39 USD al mes"
        retorno={pago === "ok" ? "ok" : pago === "cancelado" ? "cancelado" : null}
      />
    </>
  );
}
