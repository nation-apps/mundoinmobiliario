"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useAvisos } from "@/components/admin/chats/Avisos";

type ItemMenu = {
  href: string;
  label: string;
  /** Muestra el contador de conversaciones sin responder. */
  badge?: boolean;
};

const SECCIONES: { grupo: string; items: ItemMenu[] }[] = [
  {
    grupo: "Operación",
    items: [
      { href: "/admin/chats", label: "Chats", badge: true },
      { href: "/admin/canales", label: "Canales" },
      { href: "/admin/multimedia", label: "Multimedia del bot" },
    ],
  },
];

export default function AdminSidebar({
  nombre,
  rol,
}: {
  nombre: string;
  rol: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const { sinResponder } = useAvisos();

  async function salir() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  const contenido = (
    <>
      <div className="px-6 pb-7 pt-7">
        <Link href="/admin/chats" className="flex flex-col leading-none">
          <span className="t-display text-2xl text-porcelain">
            Mundo <span className="t-script text-accent">Inmobiliario</span>
          </span>
          <span className="mt-2 text-[9px] font-semibold uppercase tracking-[0.28em] text-white/40">
            Panel interno
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3" aria-label="Secciones del panel">
        {SECCIONES.map((s) => (
          <div key={s.grupo} className="mb-6">
            <span className="block px-3 pb-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/30">
              {s.grupo}
            </span>
            <ul className="flex flex-col gap-0.5">
              {s.items.map((item) => {
                const activo =
                  item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setAbierto(false)}
                      aria-current={activo ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                        activo
                          ? "bg-white/[0.07] text-porcelain"
                          : "text-white/55 hover:text-porcelain"
                      }`}
                    >
                      <span
                        className={`h-3.5 w-px transition-colors ${
                          activo ? "bg-accent" : "bg-transparent"
                        }`}
                        aria-hidden
                      />
                      {item.label}
                      {item.badge && sinResponder > 0 && (
                        <span
                          aria-label={`${sinResponder} sin responder`}
                          className="ml-auto bg-accent px-1.5 text-[10px] font-semibold tabular-nums text-porcelain"
                        >
                          {sinResponder}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-6 py-5">
        <span className="block truncate text-sm text-porcelain">{nombre}</span>
        <span className="block text-[10px] uppercase tracking-[0.18em] text-white/35">
          {rol}
        </span>
        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={salir}
            className="text-[10px] uppercase tracking-[0.16em] text-white/50 transition-colors hover:text-accent"
          >
            Salir
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* barra superior móvil */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-bg px-5 lg:hidden">
        <span className="t-display text-lg">
          Mundo <span className="t-script text-accent">Inmobiliario</span>
        </span>
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={abierto}
          className="flex flex-col gap-[5px] p-2"
        >
          <span
            className={`block h-px w-6 bg-ink transition-transform ${abierto ? "translate-y-[3px] rotate-45" : ""}`}
          />
          <span
            className={`block h-px w-6 bg-ink transition-transform ${abierto ? "-translate-y-[3px] -rotate-45" : ""}`}
          />
        </button>
      </div>

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col bg-ink transition-transform duration-300 lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {contenido}
      </aside>

      {abierto && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setAbierto(false)}
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
        />
      )}
    </>
  );
}
