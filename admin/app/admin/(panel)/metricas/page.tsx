import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import TableroMetricas from "@/components/admin/metricas/TableroMetricas";
import { cargarMetricas } from "@/lib/admin/metricas-carga";
import { PERIODO_POR_DEFECTO, esPeriodo } from "@/lib/admin/metricas";
import { getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Métricas" };

export default async function MetricasPage({ searchParams }: { searchParams: Promise<{ periodo?: string | string[] }> }) {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?next=/admin/metricas");
  // Quien vende ve los chats; las métricas del equipo son de administración.
  if (staff.rol === "vendedor") redirect("/admin/chats");

  const pedido = (await searchParams).periodo;
  const periodo = esPeriodo(pedido) ? pedido : PERIODO_POR_DEFECTO;
  const resultado = await cargarMetricas(periodo);

  if (!resultado.ok) {
    return (
      <div className="admin-card mx-auto mt-10 flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center">
        <TriangleAlert size={22} aria-hidden className="text-amber" />
        <p className="text-sm text-ink-soft">{resultado.error}</p>
      </div>
    );
  }
  return <TableroMetricas metricas={resultado.metricas} />;
}
