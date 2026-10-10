"use client";

import type { ReactNode } from "react";

/** Cabecera de sección del panel: rótulo de la sección, título del box y acciones. */
export function PageHeader({
  eyebrow,
  titulo,
  descripcion,
  icono,
  acciones,
}: {
  eyebrow?: string;
  titulo: string;
  descripcion?: ReactNode;
  /** Un ícono ya dibujado (`<RadioTower size={20} />`): las páginas son de servidor y no pueden pasar el componente. */
  icono?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <span className="t-brace">{eyebrow}</span>}
        <h1 className="t-titulo mt-2.5 flex items-center gap-3 text-[clamp(30px,3.4vw,42px)]">
          {icono && (
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
              {icono}
            </span>
          )}
          <span className="min-w-0">{titulo}</span>
        </h1>
        {descripcion && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

/** Chip de filtro (píldora). */
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
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`h-8 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors ${
        activo
          ? "border-ink bg-ink text-white"
          : "border-line bg-porcelain text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

const ESTADO_TONO: Record<string, { fondo: string; texto: string }> = {
  confirmada: { fondo: "rgba(14,159,90,0.12)", texto: "#0a6b3d" },
  confirmado: { fondo: "rgba(14,159,90,0.12)", texto: "#0a6b3d" },
  completada: { fondo: "rgba(10,15,26,0.07)", texto: "#364152" },
  entregada: { fondo: "rgba(14,159,90,0.12)", texto: "#0a6b3d" },
  pendiente_pago: { fondo: "rgba(242,165,22,0.18)", texto: "#8a5a00" },
  en_revision: { fondo: "rgba(242,165,22,0.18)", texto: "#8a5a00" },
  no_asistio: { fondo: "rgba(242,165,22,0.18)", texto: "#8a5a00" },
  cancelada: { fondo: "rgba(212,32,41,0.10)", texto: "#a3161d" },
  expirada: { fondo: "rgba(212,32,41,0.08)", texto: "#a3161d" },
  sin_comprobante: { fondo: "rgba(10,15,26,0.06)", texto: "#5f6b7d" },
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
    fondo: "rgba(10,15,26,0.06)",
    texto: "#364152",
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
      style={{ background: tono.fondo, color: tono.texto }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
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
              className="h-9 w-full animate-pulse rounded-md bg-bg-soft"
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
      className={`t-mono whitespace-nowrap border-b border-line bg-[#f7f9fb] px-4 py-2.5 text-left text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted ${className}`}
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
