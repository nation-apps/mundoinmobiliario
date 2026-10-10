import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getStaff } from "@/lib/supabase/server-auth";
import AdminSidebar, { COOKIE_MENU } from "@/components/admin/AdminSidebar";
import { AvisosProvider } from "@/components/admin/chats/Avisos";

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
