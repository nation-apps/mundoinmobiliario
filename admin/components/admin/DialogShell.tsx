"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Diálogo modal del panel: fondo entintado, hoja de porcelana, cierre con
 * Escape y foco atrapado dentro. Se usa tanto para formularios como para
 * confirmaciones destructivas — en el panel nunca se usa window.confirm,
 * que no se puede redactar en español ni acompañar de contexto.
 */
export default function DialogShell({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  ancho = "760px",
  pie,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  ancho?: string;
  pie?: ReactNode;
  children: ReactNode;
}) {
  const hojaRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const descripcionId = useId();

  // `onCerrar` suele llegar como función nueva en cada render. Si entrara
  // en las dependencias del efecto, este se re-ejecutaría con cada tecla
  // y devolvería el foco al primer campo. Se guarda en una ref.
  const cerrarRef = useRef(onCerrar);
  useEffect(() => {
    cerrarRef.current = onCerrar;
  });
  const cerrar = useCallback(() => cerrarRef.current(), []);

  useEffect(() => {
    if (!abierto) return;
    document.body.classList.add("is-locked");

    const hoja = hojaRef.current;
    const previo = document.activeElement as HTMLElement | null;
    hoja?.querySelector<HTMLElement>(
      "input:not([disabled]), select, textarea, button"
    )?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrar();
        return;
      }
      if (e.key !== "Tab" || !hoja) return;
      const focos = [
        ...hoja.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => el.offsetParent !== null);
      if (!focos.length) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.classList.remove("is-locked");
      window.removeEventListener("keydown", onKey, true);
      previo?.focus?.();
    };
  }, [abierto, cerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onCerrar}
        className="absolute inset-0 rounded-none bg-pit/50 backdrop-blur-[2px]"
      />
      <div
        ref={hojaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descripcion ? descripcionId : undefined}
        style={{ maxWidth: ancho }}
        className="relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-porcelain shadow-[0_24px_60px_-20px_rgba(10,15,26,0.45)] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 id={tituloId} className="t-display text-2xl leading-tight">
              {titulo}
            </h2>
            {descripcion && (
              <p id={descripcionId} className="mt-1.5 text-xs text-muted">
                {descripcion}
              </p>
            )}
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mb-1.5 -mr-3.5 -mt-2.5 flex size-11 shrink-0 items-center justify-center text-muted transition-colors hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M2 2 L14 14 M14 2 L2 14"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            </svg>
          </button>
        </header>

        {/* En móvil la hoja va pegada abajo: sin pie, el cuerpo respeta el
            indicador de inicio de iOS; con pie, lo respeta el pie. */}
        <div
          className={`flex-1 overflow-y-auto px-6 pt-5 ${
            pie ? "pb-5" : "pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          }`}
        >
          {children}
        </div>

        {pie && (
          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {pie}
          </footer>
        )}
      </div>
    </div>
  );
}
