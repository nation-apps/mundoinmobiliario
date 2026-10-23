"use client";

import { CalendarDays } from "lucide-react";
import FiltroDesplegable from "@/components/admin/FiltroDesplegable";
import { OPCIONES_FECHA, type FechaId, type FiltroFecha as Filtro } from "@/lib/admin/filtro-fechas";

/**
 * Filtro por fecha de entrada (embudo y bandeja): un desplegable con los periodos de siempre y, con «Elegir fechas…», dos campos
 * de fecha al lado. `conteos` es opcional, como en los demás filtros.
 */
export default function FiltroFecha({
  valor,
  onCambiar,
  conteos,
}: {
  valor: Filtro;
  onCambiar: (f: Filtro) => void;
  conteos?: Record<FechaId, number>;
}) {
  return (
    <>
      <FiltroDesplegable
        nombre="Fecha"
        icono={<CalendarDays size={15} aria-hidden />}
        opciones={OPCIONES_FECHA.map((o) => ({ ...o, icono: <CalendarDays size={16} strokeWidth={1.9} aria-hidden /> }))}
        valor={valor.id}
        {...(conteos ? { conteos } : {})}
        onCambiar={(id) => onCambiar({ id, desde: id === "rango" ? valor.desde : "", hasta: id === "rango" ? valor.hasta : "" })}
      />
      {valor.id === "rango" && (
        <div role="group" aria-label="Rango de fechas" className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
          <input
            type="date"
            aria-label="Desde"
            value={valor.desde}
            max={valor.hasta || undefined}
            onChange={(e) => onCambiar({ ...valor, desde: e.target.value })}
            className="admin-input h-9 !w-auto !py-0 max-lg:h-11"
          />
          <span aria-hidden>–</span>
          <input
            type="date"
            aria-label="Hasta"
            value={valor.hasta}
            min={valor.desde || undefined}
            onChange={(e) => onCambiar({ ...valor, hasta: e.target.value })}
            className="admin-input h-9 !w-auto !py-0 max-lg:h-11"
          />
        </div>
      )}
    </>
  );
}
