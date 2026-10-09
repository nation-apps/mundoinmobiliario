import type { ReactNode } from "react";

export const NEGOCIO_LEGAL = "Mundo Motos";
export const CORREO_PRIVACIDAD = "amplificape@gmail.com";
export const ACTUALIZADO = "9 de octubre de 2026";

/** Contenedor común de las páginas públicas que Meta pide para publicar la app. */
export function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="min-h-svh bg-bg px-5 py-12">
      <article className="mx-auto w-full max-w-2xl text-ink">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">{NEGOCIO_LEGAL}</p>
        <h1 className="t-display mt-3 text-3xl">{titulo}</h1>
        <p className="mt-2 text-xs text-muted">Última actualización: {ACTUALIZADO}</p>
        <div className="mt-8 flex flex-col gap-4 text-sm leading-relaxed text-ink-soft [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </div>
      </article>
    </main>
  );
}
