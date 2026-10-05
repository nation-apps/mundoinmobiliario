import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { getStaff } from "@/lib/supabase/server-auth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { AvisosProvider } from "@/components/admin/chats/Avisos";

export const metadata = {
  title: "Panel Mundo Inmobiliario",
  robots: { index: false, follow: false },
};

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");

  return (
    <div className="flex min-h-svh bg-bg">
      {/* Un solo provider para todo el panel: el badge del menú y los avisos
          de chats siguen vivos aunque el staff esté en otra sección. */}
      <AvisosProvider usuarioId={staff.userId} destino="panel">
        <AdminSidebar nombre={staff.nombre} rol={staff.rol} />
        <div className="flex-1 overflow-x-hidden lg:pl-[236px]">
          <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-20 lg:px-8 lg:pt-8">
            {children}
          </div>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                borderRadius: 0,
                border: "1px solid var(--line)",
                background: "var(--white)",
                color: "var(--ink)",
                fontFamily: "var(--font-sans)",
              },
            }}
          />
        </div>
      </AvisosProvider>
    </div>
  );
}
