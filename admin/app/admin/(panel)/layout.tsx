import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getStaff } from "@/lib/supabase/server-auth";
import AdminSidebar, { COOKIE_MENU } from "@/components/admin/AdminSidebar";
import { AvisosProvider } from "@/components/admin/chats/Avisos";
import { exigirSuscripcion, suscripcionActual } from "@/lib/admin/acceso-suscripcion";
import { SUSCRIPCION_OBLIGATORIA, accesoPermitido, finDeGracia } from "@/lib/admin/suscripcion";
import Link from "next/link";

export const metadata = {
  title: "Panel Mundo Motos",
  robots: { index: false, follow: false },
};

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");

  // proxy.ts anota la ruta pedida. Las pantallas de la suscripción siempre abren: son por donde se arregla.
  const ruta = (await headers()).get("x-ruta") ?? "";
  const enPantallaDePago = ruta.startsWith("/admin/suscripcion") || ruta.startsWith("/admin/suspendido");
  if (!enPantallaDePago) await exigirSuscripcion(staff.rol);

  // Con la suscripción exigida, quien administra ve un aviso antes de que se acabe la gracia o termine el periodo.
  let aviso: string | null = null;
  if (SUSCRIPCION_OBLIGATORIA && staff.rol === "admin" && !enPantallaDePago) {
    const { suscripcion, leida } = await suscripcionActual();
    if (leida && accesoPermitido(suscripcion)) {
      const hasta = finDeGracia(suscripcion);
      if (suscripcion.estado === "pago_pendiente") {
        aviso = `No se pudo cobrar la suscripción.${hasta ? ` El panel sigue abierto hasta el ${hasta.toLocaleDateString("es-MX", { timeZone: "America/Cancun", day: "numeric", month: "long" })}.` : ""}`;
      } else if (suscripcion.cancela_al_final) {
        aviso = "La suscripción se cancelará al terminar el periodo pagado.";
      }
    }
  }

  // El ancho del menú sale de una cookie: el contenido se pinta ya con su margen, sin saltar al cargar.
  const contraido = (await cookies()).get(COOKIE_MENU)?.value === "contraido";

  return (
    <div id="marco-panel" data-menu={contraido ? "contraido" : "completo"} className="group/marco flex min-h-svh bg-bg">
      {/* Un solo provider para todo el panel: el badge del menú y los avisos
          de chats siguen vivos aunque el staff esté en otra sección. */}
      <AvisosProvider usuarioId={staff.userId} destino="panel">
        <AdminSidebar nombre={staff.nombre} rol={staff.rol} contraidoInicial={contraido} />
        <div className="flex-1 overflow-x-hidden transition-[padding] duration-300 lg:pl-[248px] lg:group-data-[menu=contraido]/marco:pl-[76px]">
          <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-[4.5rem] sm:px-5 lg:px-8 lg:pt-7">
            {aviso && (
              <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber/50 bg-[rgba(242,165,22,0.10)] px-4 py-2.5 text-[13px] text-amber-ink">
                <span>{aviso}</span>
                <Link href="/admin/suscripcion" className="font-semibold underline underline-offset-2">
                  Ir a Suscripción
                </Link>
              </p>
            )}
            {children}
          </div>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "var(--white)",
                color: "var(--ink)",
                fontFamily: "var(--font-sans)",
                boxShadow: "0 12px 32px -12px rgba(10,15,26,0.25)",
              },
            }}
          />
        </div>
      </AvisosProvider>
    </div>
  );
}
