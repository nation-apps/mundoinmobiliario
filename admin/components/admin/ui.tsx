"use client";

import type { ReactNode } from "react";

/** Cabecera de sección del panel. */
export function PageHeader({
  eyebrow,
  titulo,
  acciones,
}: {
  eyebrow?: string;
  titulo: string;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div>
        {eyebrow && <span className="t-brace block">{eyebrow}</span>}
        <h1 className="t-display mt-2 text-[clamp(28px,3.6vw,44px)] leading-none">
          {titulo}
        </h1>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

/** Chip de filtro: mismo lenguaje que la carta del sitio público. */
export function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors ${
        activo
          ? "border-ink bg-ink text-bg"
          : "border-line text-ink-soft hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

const ESTADO_TONO: Record<string, { fondo: string; texto: string }> = {
  confirmada: { fondo: "rgba(12,163,12,0.10)", texto: "#0a7d0a" },
  confirmado: { fondo: "rgba(12,163,12,0.10)", texto: "#0a7d0a" },
  completada: { fondo: "rgba(29,19,21,0.07)", texto: "#4a3a3c" },
  entregada: { fondo: "rgba(12,163,12,0.10)", texto: "#0a7d0a" },
  pendiente_pago: { fondo: "rgba(250,178,25,0.16)", texto: "#8a6200" },
  en_revision: { fondo: "rgba(236,131,90,0.16)", texto: "#9c4a20" },
  no_asistio: { fondo: "rgba(250,178,25,0.16)", texto: "#8a6200" },
  cancelada: { fondo: "rgba(208,59,59,0.10)", texto: "#a82f2f" },
  expirada: { fondo: "rgba(208,59,59,0.08)", texto: "#a82f2f" },
  sin_comprobante: { fondo: "rgba(29,19,21,0.06)", texto: "#8d7b76" },
};

/** El color acompaña al texto: nunca es el único portador del significado. */
export function EstadoBadge({
  estado,
  etiqueta,
}: {
  estado: string;
  etiqueta?: string;
}) {
  const tono = ESTADO_TONO[estado] ?? {
    fondo: "rgba(29,19,21,0.06)",
    texto: "#4a3a3c",
  };
  return (
    <span
      className="inline-block whitespace-nowrap px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{ background: tono.fondo, color: tono.texto }}
    >
      {etiqueta ?? estado.replace(/_/g, " ")}
    </span>
  );
}

/** Marco de tabla con estados de carga y vacío que explican, no decoran. */
export function TableShell({
  cargando,
  vacio,
  mensajeVacio,
  children,
}: {
  cargando?: boolean;
  vacio?: boolean;
  mensajeVacio: string;
  children: ReactNode;
}) {
  if (cargando) {
    return (
      <div className="admin-card p-5">
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-9 w-full animate-pulse bg-bg-soft"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }
  if (vacio) {
    return (
      <div className="admin-card px-6 py-16 text-center">
        <p className="text-sm text-muted">{mensajeVacio}</p>
      </div>
    );
  }
  return <div className="admin-card overflow-x-auto">{children}</div>;
}

export function Th({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b border-line px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-line px-4 py-3 align-top text-sm ${className}`}
    >
      {children}
    </td>
  );
}
