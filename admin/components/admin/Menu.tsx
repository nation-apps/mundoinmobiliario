"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as KeyboardEventReact,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, type LucideIcon } from "lucide-react";

/**
 * Menú desplegable del panel (patrón «menu button» de WAI-ARIA).
 *
 * - Se dibuja en un portal con posición fija: ninguna columna con
 *   `overflow-hidden` (lista, hilo, ficha) lo recorta.
 * - Se abre hacia arriba si abajo no cabe, y nunca se sale de la pantalla.
 * - Teclado: flechas, Inicio/Fin, Esc y Tab cierran devolviendo el foco al botón.
 */

type Alineacion = "inicio" | "fin";
type Lado = "abajo" | "arriba";

const SELECTOR_ITEMS = '[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]';

const MenuContexto = createContext<{ cerrar: () => void } | null>(null);

function useMenu() {
  const ctx = useContext(MenuContexto);
  if (!ctx) throw new Error("Las opciones del menú van dentro de <Menu>.");
  return ctx;
}

/** Botón tipo píldora para filtros y selectores (mismo alto que un campo). */
export const CLASE_DISPARADOR =
  "inline-flex h-9 items-center gap-2 border border-line bg-porcelain px-3 text-[13px] text-ink transition-colors hover:border-line-strong aria-expanded:border-accent aria-expanded:ring-3 aria-expanded:ring-accent-soft disabled:pointer-events-none disabled:opacity-50 max-lg:h-11";

export function Menu({
  etiqueta,
  boton,
  claseBoton = CLASE_DISPARADOR,
  titulo,
  alinear = "inicio",
  lado = "abajo",
  ancho = 240,
  deshabilitado = false,
  soloIcono = false,
  children,
}: {
  /** Nombre accesible del menú (y del botón cuando es solo un ícono). */
  etiqueta: string;
  boton: ReactNode;
  claseBoton?: string;
  /** Texto de ayuda al pasar el puntero. */
  titulo?: string;
  alinear?: Alineacion;
  lado?: Lado;
  ancho?: number;
  deshabilitado?: boolean;
  /** El botón no tiene texto visible: su nombre accesible es `etiqueta`. */
  soloIcono?: boolean;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; ancho: number; arriba: boolean } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const enfoque = useRef<"elegido" | "primero" | "ultimo">("elegido");
  const idMenu = useId();

  const cerrar = useCallback((devolverFoco = true) => {
    setAbierto(false);
    setPos(null);
    if (devolverFoco) botonRef.current?.focus();
  }, []);

  const ubicar = useCallback(() => {
    const b = botonRef.current;
    const m = menuRef.current;
    if (!b || !m) return;
    const r = b.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(Math.max(ancho, r.width), vw - 16);
    const h = Math.min(m.scrollHeight, vh - 16);
    const abajo = vh - r.bottom - 8;
    const arribaLibre = r.top - 8;
    const arriba = lado === "arriba" ? arribaLibre >= h || arribaLibre > abajo : abajo < h && arribaLibre > abajo;
    const top = Math.max(8, Math.min(arriba ? r.top - 6 - h : r.bottom + 6, vh - 8 - h));
    const left = Math.max(8, Math.min(alinear === "inicio" ? r.left : r.right - w, vw - 8 - w));
    setPos({ top, left, ancho: w, arriba });
  }, [alinear, ancho, lado]);

  const items = useCallback(
    () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLElement>(SELECTOR_ITEMS) ?? []).filter(
        // Fuera las deshabilitadas y las ocultas por el tamaño de pantalla (no pueden recibir el foco).
        (el) => el.getAttribute("aria-disabled") !== "true" && el.getClientRects().length > 0,
      ),
    [],
  );

  // Recién abierto: se mide, se ubica y se enfoca la opción elegida (o la primera).
  useLayoutEffect(() => {
    if (!abierto) return;
    ubicar();
  }, [abierto, ubicar]);

  const ubicado = pos !== null;
  useEffect(() => {
    if (!abierto || !ubicado) return;
    const lista = items();
    const elegido = lista.find((el) => el.getAttribute("aria-checked") === "true");
    const destino =
      enfoque.current === "ultimo" ? lista.at(-1) : enfoque.current === "elegido" ? (elegido ?? lista[0]) : lista[0];
    destino?.focus({ preventScroll: true });
  }, [abierto, ubicado, items]);

  useEffect(() => {
    if (!abierto) return;
    let cuadro = 0;
    const reubicar = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(ubicar);
    };
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      cerrar(false);
    };
    window.addEventListener("resize", reubicar);
    window.addEventListener("scroll", reubicar, true);
    document.addEventListener("pointerdown", fuera);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("resize", reubicar);
      window.removeEventListener("scroll", reubicar, true);
      document.removeEventListener("pointerdown", fuera);
    };
  }, [abierto, ubicar, cerrar]);

  function abrir(desde: "elegido" | "primero" | "ultimo") {
    enfoque.current = desde;
    setAbierto(true);
  }

  function teclaBoton(e: KeyboardEventReact<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      abrir(e.key === "ArrowDown" ? "primero" : "ultimo");
    }
  }

  function teclaMenu(e: KeyboardEventReact<HTMLDivElement>) {
    const lista = items();
    const actual = lista.indexOf(document.activeElement as HTMLElement);
    const mover = (i: number) => lista[(i + lista.length) % lista.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        mover(actual + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        mover(actual < 0 ? -1 : actual - 1);
        break;
      case "Home":
        e.preventDefault();
        mover(0);
        break;
      case "End":
        e.preventDefault();
        mover(-1);
        break;
      case "Escape":
        // Que no cierre también el diálogo o la capa de abajo.
        e.preventDefault();
        e.stopPropagation();
        cerrar(true);
        break;
      case "Tab":
        e.preventDefault();
        cerrar(true);
        break;
    }
  }

  return (
    <MenuContexto.Provider value={{ cerrar: () => cerrar(true) }}>
      <button
        ref={botonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        aria-label={soloIcono ? etiqueta : undefined}
        title={titulo}
        disabled={deshabilitado}
        onClick={() => (abierto ? cerrar(false) : abrir("elegido"))}
        onKeyDown={teclaBoton}
        className={claseBoton}
      >
        {boton}
      </button>
      {abierto &&
        createPortal(
          <div
            ref={menuRef}
            id={idMenu}
            role="menu"
            aria-label={etiqueta}
            onKeyDown={teclaMenu}
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: pos?.ancho ?? ancho,
              maxHeight: "calc(100dvh - 16px)",
              visibility: pos ? "visible" : "hidden",
              transformOrigin: pos?.arriba ? "bottom" : "top",
            }}
            className="z-[70] animate-menu-in overflow-y-auto rounded-xl border border-line bg-porcelain p-1.5 text-ink shadow-[0_12px_32px_-8px_rgba(10,15,26,0.28),0_2px_6px_rgba(10,15,26,0.06)]"
          >
            {children}
          </div>,
          document.body,
        )}
    </MenuContexto.Provider>
  );
}

const CLASE_ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink outline-none transition-colors hover:bg-bg-soft focus-visible:bg-bg-soft focus-visible:outline-none aria-disabled:pointer-events-none aria-disabled:opacity-45 max-lg:min-h-11";

/** Una opción de un grupo excluyente (filtros, etapa, periodo): la elegida lleva la marca. */
export function MenuOpcion({
  elegida,
  onElegir,
  icono,
  detalle,
  deshabilitada = false,
  children,
}: {
  elegida: boolean;
  onElegir: () => void;
  icono?: ReactNode;
  /** Dato a la derecha (un conteo, un atajo). */
  detalle?: ReactNode;
  deshabilitada?: boolean;
  children: ReactNode;
}) {
  const { cerrar } = useMenu();
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={elegida}
      aria-disabled={deshabilitada || undefined}
      tabIndex={-1}
      onClick={() => {
        if (deshabilitada) return;
        onElegir();
        cerrar();
      }}
      className={`${CLASE_ITEM} ${elegida ? "font-medium" : ""}`}
    >
      <span className="flex w-4 shrink-0 justify-center text-accent">{elegida && <Check size={16} strokeWidth={2.75} aria-hidden />}</span>
      {icono && <span className="flex shrink-0 items-center text-ink-soft">{icono}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detalle !== undefined && <span className="t-mono shrink-0 text-[11px] tabular-nums text-muted">{detalle}</span>}
    </button>
  );
}

/** Una acción (navegar, cerrar sesión, activar avisos). */
export function MenuAccion({
  onElegir,
  icono: Icono,
  detalle,
  peligro = false,
  marcada,
  children,
}: {
  onElegir: () => void;
  icono?: LucideIcon;
  detalle?: ReactNode;
  peligro?: boolean;
  /** Si se pasa, es una casilla (activar/desactivar) y muestra su estado. */
  marcada?: boolean;
  children: ReactNode;
}) {
  const { cerrar } = useMenu();
  const casilla = marcada !== undefined;
  return (
    <button
      type="button"
      role={casilla ? "menuitemcheckbox" : "menuitem"}
      aria-checked={casilla ? marcada : undefined}
      tabIndex={-1}
      onClick={() => {
        onElegir();
        cerrar();
      }}
      className={`${CLASE_ITEM} ${peligro ? "text-redline hover:bg-redline/8 focus-visible:bg-redline/8" : ""}`}
    >
      {Icono && <Icono size={16} strokeWidth={1.9} aria-hidden className={peligro ? "" : "text-ink-soft"} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {casilla && (
        <span
          aria-hidden
          className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${marcada ? "bg-accent" : "bg-line-strong"}`}
        >
          <span className={`absolute top-0.5 size-3.5 rounded-full bg-porcelain shadow transition-transform ${marcada ? "translate-x-4" : "translate-x-0.5"}`} />
        </span>
      )}
      {!casilla && detalle !== undefined && <span className="t-mono shrink-0 text-[11px] text-muted">{detalle}</span>}
    </button>
  );
}

export function MenuSeparador() {
  return <div role="separator" className="-mx-1.5 my-1.5 h-px bg-line" />;
}

export function MenuTitulo({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" className="t-mono px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
      {children}
    </div>
  );
}

/** Para contenido propio dentro del menú (sus botones deben llevar role="menuitem"): cierra el menú. */
export function useCerrarMenu() {
  return useMenu().cerrar;
}
