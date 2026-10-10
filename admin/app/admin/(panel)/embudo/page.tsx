import { redirect } from "next/navigation";
import { Kanban, TriangleAlert } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Embudo from "@/components/admin/embudo/Embudo";
import { PageHeader } from "@/components/admin/ui";
import { leerEmbudo } from "@/lib/admin/embudo-consulta";
import { createServerSupabase, getStaff } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Embudo" };

export default async function EmbudoPage() {
  // El layout ya redirige, pero los layouts no se re-evalúan al navegar entre páginas del panel.
  const staff = await getStaff();
  if (!staff) redirect("/admin/login?next=/admin/embudo");

  const supabase = (await createServerSupabase()) as unknown as SupabaseClient;
  const { datos, error } = await leerEmbudo(supabase);
  if (error) console.error("[embudo] No se pudo leer el embudo:", error);

  return (
    <>
      <PageHeader
        eyebrow="Operación"
        titulo="Embudo comercial"
        icono={<Kanban size={20} strokeWidth={1.9} />}
        descripcion="Cada tarjeta es una conversación. Arrástrala a otra columna para cambiar su etapa, o usa el menú ⋯ de la tarjeta."
      />
      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber/50 bg-[rgba(242,165,22,0.10)] px-4 py-2.5 text-[13px] text-amber-ink">
          <TriangleAlert size={16} aria-hidden />
          No se pudieron leer todas las conversaciones. Recarga la página en un momento.
        </p>
      )}
      {/* Un vendedor entra viendo las suyas; con «Limpiar» ve todo el embudo. */}
      <Embudo usuarioId={staff.userId} inicial={datos} soloMias={staff.rol === "vendedor"} />
    </>
  );
}
