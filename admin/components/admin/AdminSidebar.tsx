"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  Gauge,
  Images,
  Kanban,
  LogOut,
  Menu as IconoMenu,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Shuffle,
  SlidersHorizontal,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useAvisos } from "@/components/admin/chats/Avisos";
import { Menu, MenuAccion, MenuSeparador, MenuTitulo } from "@/components/admin/Menu";
import Pendientes from "@/components/admin/Pendientes";
import { iniciales } from "@/lib/admin/chats-tipos";

type ItemMenu = {
  href: string;
  label: string;
  icono: LucideIcon;
  /** Muestra el contador de conversaciones sin responder. */
  badge?: boolean;
  /** Solo administración y asistentes (la base tampoco deja a un vendedor leerlo). */
  soloStaff?: boolean;
};

type Grupo = { id: string; nombre: string; icono?: LucideIcon; plegable?: boolean; items: ItemMenu[] };

const GRUPOS: Grupo[] = [
  {
    id: "operacion",
    nombre: "Operación",
    items: [
      { href: "/admin/chats", label: "Chats", icono: MessagesSquare, badge: true },
      { href: "/admin/embudo", label: "Embudo", icono: Kanban },
      { href: "/admin/metricas", label: "Métricas", icono: Gauge, soloStaff: true },
    ],
  },
  {
    id: "ajustes",
    nombre: "Ajustes",
    icono: SlidersHorizontal,
    plegable: true,
    items: [
      { href: "/admin/canales", label: "Canales", icono: RadioTower },
      { href: "/admin/multimedia", label: "Multimedia del bot", icono: Images },
      { href: "/admin/reparto", label: "Reparto de leads", icono: Shuffle, soloStaff: true },
    ],
  },
];

const ROL_LABEL: Record<string, string> = { admin: "Administración", asistente: "Asistente", vendedor: "Ventas" };

/** Cookie con el ancho del menú: la lee el layout para pintar el ancho correcto desde el servidor. */
export const COOKIE_MENU = "mm-menu";
/** Grupos plegados (comodidad de cada navegador). */
const GRUPOS_STORAGE_KEY = "mm-menu-grupos";

/* ---------- Testigo del bot ---------- */

type EstadoBot = { enLinea: boolean; ms?: number } | null;

function useEstadoBot(): EstadoBot {
  const [estado, setEstado] = useState<EstadoBot>(null);
  useEffect(() => {
    let vigente = true;
    async function revisar() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/admin/estado-bot", { cache: "no-store" });
        // Sin sesión (venció) no se sabe nada del bot: mejor no afirmar que está caído.
        if (res.status === 401) return;
        const datos = (await res.json()) as { enLinea?: boolean; ms?: number };
        if (vigente) setEstado({ enLinea: Boolean(datos.enLinea), ms: datos.ms });
      } catch {
        if (vigente) setEstado({ enLinea: false });
      }
    }
    void revisar();
    const intervalo = setInterval(revisar, 60_000);
    document.addEventListener("visibilitychange", revisar);
    return () => {
      vigente = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, []);
  return estado;
}

function TestigoBot({ contraido }: { contraido: boolean }) {
  const estado = useEstadoBot();
  const texto = estado === null ? "Revisando el bot…" : estado.enLinea ? "Bot en línea" : "El bot no responde";
  const color = estado === null ? "text-white/35" : estado.enLinea ? "text-[#3ddc8f]" : "text-[#ff6b70]";
  return (
    <div
      role="status"
      title={estado?.ms !== undefined ? `${texto} · ${estado.ms} ms` : texto}
      className={`flex items-center gap-2.5 ${contraido ? "justify-center" : "px-3"} py-2`}
    >
      <span className={`${color} flex size-4 items-center justify-center`}>
        <span className={estado?.enLinea ? "punto-vivo" : "inline-block size-[7px] rounded-full bg-current"} />
      </span>
      {!contraido && (
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
          <span className="truncate text-[12.5px] text-white/70">{texto}</span>
          {estado?.enLinea && estado.ms !== undefined && (
            <span className="t-mono shrink-0 text-[10.5px] text-white/40 tabular-nums">{estado.ms} ms</span>
          )}
        </span>
      )}
      {contraido && <span className="sr-only">{texto}</span>}
    </div>
  );
}

/* ---------- Grupos plegados ---------- */

const sinSuscripcion = () => () => {};

function leerPlegados(): string[] {
  try {
    const crudo = localStorage.getItem(GRUPOS_STORAGE_KEY);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? datos.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function guardarPlegados(ids: string[]) {
  try {
    localStorage.setItem(GRUPOS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Sin storage el grupo se pliega igual; solo no se recuerda.
  }
}

/* ---------- Menú lateral ---------- */

export default function AdminSidebar({
  nombre,
  rol,
  contraidoInicial = false,
}: {
  nombre: string;
  rol: string;
  /** Lo que dice la cookie: el servidor ya pintó el contenido con ese ancho. */
  contraidoInicial?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [contraido, setContraido] = useState(contraidoInicial);
  const { sinResponder, avisosActivos, activar, desactivar } = useAvisos();
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const [plegados, setPlegados] = useState<string[] | null>(null);
  const plegadosVigentes = plegados ?? (hidratado ? leerPlegados() : []);

  // En el cajón del celular el menú va siempre completo.
  const rail = contraido && !abierto;

  function alternarGrupo(id: string) {
    const siguiente = plegadosVigentes.includes(id) ? plegadosVigentes.filter((g) => g !== id) : [...plegadosVigentes, id];
    setPlegados(siguiente);
    guardarPlegados(siguiente);
  }

  function alternarAncho() {
    const nuevo = !contraido;
    setContraido(nuevo);
    document.cookie = `${COOKIE_MENU}=${nuevo ? "contraido" : "completo"}; path=/; max-age=31536000; samesite=lax`;
    document.getElementById("marco-panel")?.setAttribute("data-menu", nuevo ? "contraido" : "completo");
  }

  async function salir() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  const esActivo = (href: string) => pathname.startsWith(href);

  const enlace = (item: ItemMenu) => {
    const activo = esActivo(item.href);
    const Icono = item.icono;
    const conteo = item.badge && sinResponder > 0 ? sinResponder : 0;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={() => setAbierto(false)}
          aria-current={activo ? "page" : undefined}
          aria-label={rail ? (conteo ? `${item.label}, ${conteo} sin responder` : item.label) : undefined}
          title={rail ? item.label : undefined}
          className={`group relative flex items-center gap-3 rounded-lg py-2 text-[13.5px] transition-colors max-lg:min-h-11 ${
            rail ? "justify-center px-0" : "px-3"
          } ${activo ? "bg-white/[0.08] text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white"}`}
        >
          <span
            aria-hidden
            className={`absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-colors ${
              activo ? "bg-accent" : "bg-transparent"
            }`}
          />
          <span className="relative flex">
            <Icono
              size={18}
              strokeWidth={activo ? 2.1 : 1.8}
              aria-hidden
              className={activo ? "text-[#93a6ff]" : "text-white/45 transition-colors group-hover:text-white/80"}
            />
            {rail && conteo > 0 && <span aria-hidden className="absolute -right-1 -top-1 size-2 rounded-full bg-redline ring-2 ring-pit" />}
          </span>
          {!rail && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
          {!rail && conteo > 0 && (
            <span
              aria-label={`${conteo} sin responder`}
              className="t-mono rounded-full bg-redline px-1.5 py-px text-[10.5px] font-semibold leading-4 text-white tabular-nums"
            >
              {conteo}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const marca = (
    <Link href="/admin/chats" className="flex min-w-0 items-center gap-2.5" aria-label="Mundo Motos, ir a Chats" onClick={() => setAbierto(false)}>
      <span
        aria-hidden
        className="t-display flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-[17px] font-bold text-white"
      >
        <span className="-skew-x-[9deg]">MM</span>
      </span>
      {!rail && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="t-titulo truncate text-[19px] text-white">
            Mundo <span className="t-script text-[#93a6ff]">Motos</span>
          </span>
          <span className="t-mono mt-1 truncate text-[9.5px] uppercase tracking-[0.16em] text-white/40">TVS · Cancún</span>
        </span>
      )}
    </Link>
  );

  const contenido = (
    <>
      <div className={`flex items-center gap-2 pb-5 pt-5 ${rail ? "flex-col px-2" : "justify-between px-4"}`}>
        {marca}
        <Pendientes />
      </div>

      <nav className={`flex-1 overflow-y-auto overflow-x-hidden ${rail ? "px-2" : "px-3"}`} aria-label="Secciones del panel">
        {GRUPOS.map((g) => {
          const items = g.items.filter((item) => !item.soloStaff || rol !== "vendedor");
          if (items.length === 0) return null;
          const contieneActual = items.some((item) => esActivo(item.href));
          const plegado = !rail && g.plegable === true && plegadosVigentes.includes(g.id) && !contieneActual;
          const GrupoIcono = g.icono;
          return (
            <div key={g.id} className={rail ? "mb-3 border-t border-white/[0.07] pt-3 first:border-t-0 first:pt-0" : "mb-5"}>
              {!rail &&
                (g.plegable ? (
                  <button
                    type="button"
                    onClick={() => alternarGrupo(g.id)}
                    aria-expanded={!plegado}
                    aria-controls={`grupo-${g.id}`}
                    className="t-mono flex w-full items-center gap-2 rounded-md px-3 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/35 transition-colors hover:text-white/70"
                  >
                    {GrupoIcono && <GrupoIcono size={12} aria-hidden />}
                    <span className="flex-1 text-left">{g.nombre}</span>
                    <ChevronDown size={14} aria-hidden className={`transition-transform duration-200 ${plegado ? "-rotate-90" : ""}`} />
                  </button>
                ) : (
                  <span className="t-mono block px-3 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                    {g.nombre}
                  </span>
                ))}
              <div
                id={`grupo-${g.id}`}
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${plegado ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
                inert={plegado}
              >
                <ul className="flex min-h-0 flex-col gap-0.5 overflow-hidden">{items.map(enlace)}</ul>
              </div>
            </div>
          );
        })}
      </nav>

      <div className={`border-t border-white/[0.07] py-3 ${rail ? "px-2" : "px-3"}`}>
        <TestigoBot contraido={rail} />
        <Menu
          etiqueta={`Cuenta de ${nombre}`}
          soloIcono={rail}
          lado="arriba"
          alinear="inicio"
          ancho={250}
          claseBoton={`mt-1 flex w-full items-center gap-2.5 rounded-lg py-2 text-left transition-colors hover:bg-white/[0.05] aria-expanded:bg-white/[0.07] max-lg:min-h-11 ${
            rail ? "justify-center px-0" : "px-2"
          }`}
          boton={
            <>
              <span className="t-display flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.1] text-[13px] font-semibold text-white">
                {iniciales(nombre)}
              </span>
              {!rail && (
                <>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-[13px] text-white">{nombre}</span>
                    <span className="t-mono truncate text-[10px] uppercase tracking-[0.14em] text-white/40">{ROL_LABEL[rol] ?? rol}</span>
                  </span>
                  <ChevronDown size={15} aria-hidden className="shrink-0 rotate-180 text-white/40" />
                </>
              )}
            </>
          }
        >
          <MenuTitulo>{nombre}</MenuTitulo>
          <MenuAccion icono={Volume2} marcada={avisosActivos} onElegir={() => (avisosActivos ? desactivar() : activar())}>
            Avisos con sonido
          </MenuAccion>
          <div className="max-lg:hidden">
            <MenuAccion icono={contraido ? PanelLeftOpen : PanelLeftClose} onElegir={alternarAncho}>
              {contraido ? "Mostrar el menú completo" : "Contraer el menú"}
            </MenuAccion>
          </div>
          <MenuSeparador />
          <MenuAccion icono={LogOut} peligro onElegir={() => void salir()}>
            Cerrar sesión
          </MenuAccion>
        </Menu>
      </div>
    </>
  );

  return (
    <>
      {/* barra superior móvil */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-white/[0.06] bg-pit px-3 lg:hidden">
        <Link href="/admin/chats" className="flex items-center gap-2.5 pl-1" aria-label="Mundo Motos, ir a Chats">
          <span aria-hidden className="t-display flex size-8 items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-white">
            <span className="-skew-x-[9deg]">MM</span>
          </span>
          <span className="t-titulo text-[18px] text-white">
            Mundo <span className="t-script text-[#93a6ff]">Motos</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <Pendientes />
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={abierto}
            className="flex size-11 items-center justify-center text-white/80 hover:bg-white/[0.07] hover:text-white"
          >
            {abierto ? <X size={20} aria-hidden /> : <IconoMenu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/[0.06] bg-pit transition-[transform,width] duration-300 lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        } ${rail ? "w-[76px]" : "w-[248px]"}`}
      >
        {contenido}
      </aside>

      {abierto && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setAbierto(false)}
          className="fixed inset-0 z-40 rounded-none bg-pit/50 backdrop-blur-[2px] lg:hidden"
        />
      )}
    </>
  );
}
