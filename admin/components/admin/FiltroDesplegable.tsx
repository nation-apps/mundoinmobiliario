"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Menu, MenuOpcion, MenuTitulo } from "@/components/admin/Menu";

const CLASE_FILTRO =
  "inline-flex h-9 shrink-0 items-center gap-2 border px-3 text-[13px] transition-colors aria-expanded:ring-3 aria-expanded:ring-accent-soft max-lg:h-11";

/** Un filtro como menú desplegable (bandeja y embudo): muestra lo elegido y, si hay conteos, cuántas quedarían con cada opción. */
export default function FiltroDesplegable<T extends string>({
  nombre,
  icono,
  opciones,
  valor,
  conteos,
  onCambiar,
}: {
  nombre: string;
  icono: ReactNode;
  opciones: { id: T; label: string; icono?: ReactNode }[];
  valor: T;
  /** Cuántas conversaciones quedarían con cada opción; sin esto no se muestra el número. */
  conteos?: Record<T, number>;
  onCambiar: (id: T) => void;
}) {
  const elegida = opciones.find((o) => o.id === valor) ?? opciones[0];
  const activo = valor !== opciones[0]?.id;
  return (
    <Menu
      etiqueta={`Filtrar por ${nombre.toLowerCase()}`}
      ancho={250}
      claseBoton={`${CLASE_FILTRO} ${
        activo ? "border-accent/45 bg-accent-soft text-accent-deep" : "border-line bg-porcelain text-ink hover:border-line-strong"
      }`}
      boton={
        <>
          <span className={activo ? "text-accent" : "text-muted"}>{icono}</span>
          <span className={activo ? "text-accent-deep/80" : "text-muted"}>{nombre}</span>
          <span className="font-medium">{elegida?.label}</span>
          <ChevronDown size={14} aria-hidden className={activo ? "text-accent" : "text-muted"} />
        </>
      }
    >
      <MenuTitulo>{nombre}</MenuTitulo>
      {opciones.map((o) => (
        <MenuOpcion key={o.id} elegida={o.id === valor} onElegir={() => onCambiar(o.id)} icono={o.icono} detalle={conteos ? (conteos[o.id] ?? 0) : undefined}>
          {o.label}
        </MenuOpcion>
      ))}
    </Menu>
  );
}
