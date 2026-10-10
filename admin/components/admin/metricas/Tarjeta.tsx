"use client";

import type { ReactNode } from "react";
import { ChartColumnStacked, Table2 } from "lucide-react";

/** Tarjeta de una sección del tablero: título que dice qué se mide, nota de cómo leerlo y acciones. */
export function Tarjeta({
  titulo,
  nota,
  acciones,
  className = "",
  children,
}: {
  titulo: string;
  nota?: ReactNode;
  acciones?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`admin-card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="t-display text-[19px] leading-tight">{titulo}</h2>
          {nota && <p className="mt-1 text-[12.5px] leading-snug text-muted">{nota}</p>}
        </div>
        {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
      </header>
      {children}
    </section>
  );
}

export type Vista = "grafica" | "tabla";

/** Cambia entre la gráfica y su tabla (la tabla es la versión accesible de toda gráfica). */
export function ConmutadorVista({ vista, onCambiar, nombre }: { vista: Vista; onCambiar: (v: Vista) => void; nombre: string }) {
  const opciones: { id: Vista; label: string; icono: ReactNode }[] = [
    { id: "grafica", label: "Gráfica", icono: <ChartColumnStacked size={14} aria-hidden /> },
    { id: "tabla", label: "Tabla", icono: <Table2 size={14} aria-hidden /> },
  ];
  return (
    <div role="group" aria-label={`Ver ${nombre} como`} className="flex rounded-lg border border-line bg-bg p-0.5">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={vista === o.id}
          onClick={() => onCambiar(o.id)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors max-lg:min-h-10 ${
            vista === o.id ? "bg-porcelain text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {o.icono}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Estado vacío dentro de una tarjeta: dice qué falta para que haya datos. */
export function SinDatos({ children, alto = 180 }: { children: ReactNode; alto?: number }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-[13px] text-muted" style={{ minHeight: alto }}>
      {children}
    </div>
  );
}
