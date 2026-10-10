"use client";

import { useMemo, useState } from "react";
import { DIAS_SEMANA, type Metricas } from "@/lib/admin/metricas";
import { ConmutadorVista, SinDatos, Tarjeta, type Vista } from "./Tarjeta";

/** Rampa secuencial de un solo tono (más es más oscuro); el cero queda casi del color de la superficie. */
const RAMPA = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const CERO = "#f1f4f8";

const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function hora(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export default function MapaCalor({ metricas }: { metricas: Metricas }) {
  const [vista, setVista] = useState<Vista>("grafica");
  const [activa, setActiva] = useState<{ dia: number; h: number } | null>(null);
  const { calor, kpis } = metricas;

  const { maximo, pico } = useMemo(() => {
    let maximo = 0;
    let pico = { dia: 0, h: 0 };
    calor.forEach((fila, dia) =>
      fila.forEach((v, h) => {
        if (v > maximo) {
          maximo = v;
          pico = { dia, h };
        }
      }),
    );
    return { maximo, pico };
  }, [calor]);

  const tono = (v: number) => (v === 0 ? CERO : RAMPA[Math.min(RAMPA.length - 1, Math.ceil((v / maximo) * RAMPA.length) - 1)]);
  const nota =
    maximo > 0
      ? `Cuándo empiezan las conversaciones. El pico: ${DIAS_LARGOS[pico.dia]} de ${hora(pico.h)} a ${String(pico.h).padStart(2, "0")}:59 (${maximo}).`
      : "Cuándo empiezan las conversaciones, por día y hora.";

  return (
    <Tarjeta titulo="¿A qué hora escriben?" nota={nota} acciones={<ConmutadorVista vista={vista} onCambiar={setVista} nombre="el mapa de horas" />}>
      {kpis.entradas === 0 ? (
        <SinDatos alto={200}>Cuando entren conversaciones, aquí se verán los días y horas con más movimiento.</SinDatos>
      ) : vista === "tabla" ? (
        <div className="max-h-[300px] overflow-auto rounded-lg border border-line">
          <table className="w-full text-[12px] tabular-nums">
            <caption className="sr-only">Conversaciones nuevas por día de la semana y hora</caption>
            <thead className="sticky top-0 bg-[#f7f9fb]">
              <tr>
                <th scope="col" className="t-mono px-2 py-1.5 text-left text-[10px] font-medium uppercase text-muted">
                  Día
                </th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} scope="col" className="t-mono px-1.5 py-1.5 text-[10px] font-medium text-muted">
                    {String(h).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calor.map((fila, dia) => (
                <tr key={dia} className="border-t border-line">
                  <th scope="row" className="px-2 py-1 text-left font-normal capitalize text-ink-soft">
                    {DIAS_SEMANA[dia]}
                  </th>
                  {fila.map((v, h) => (
                    <td key={h} className={`px-1.5 py-1 text-center ${v ? "font-semibold text-ink" : "text-line-strong"}`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="overflow-x-auto pb-1">
            <div
              className="grid min-w-[520px] gap-[2px]"
              style={{ gridTemplateColumns: "34px repeat(24, minmax(0, 1fr))" }}
              onPointerLeave={() => setActiva(null)}
              aria-hidden
            >
              {calor.map((fila, dia) => (
                <div key={dia} className="contents">
                  <span className="t-mono flex items-center text-[10px] capitalize text-muted">{DIAS_SEMANA[dia]}</span>
                  {fila.map((v, h) => (
                    <span
                      key={h}
                      onPointerEnter={() => setActiva({ dia, h })}
                      onPointerDown={() => setActiva({ dia, h })}
                      className={`aspect-square min-h-3 rounded-[3px] transition-[outline-color] ${
                        activa?.dia === dia && activa.h === h ? "outline outline-2 outline-ink" : "outline outline-2 outline-transparent"
                      }`}
                      style={{ background: tono(v) }}
                    />
                  ))}
                </div>
              ))}
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="t-mono pt-1 text-center text-[9.5px] text-muted">
                  {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="min-h-[18px] text-[12px] text-ink-soft" aria-live="polite">
              {activa ? (
                <>
                  <span className="capitalize">{DIAS_LARGOS[activa.dia]}</span> de {hora(activa.h)} a {String(activa.h).padStart(2, "0")}:59 ·{" "}
                  <strong className="t-mono font-semibold tabular-nums text-ink">{calor[activa.dia][activa.h]}</strong>{" "}
                  {calor[activa.dia][activa.h] === 1 ? "conversación" : "conversaciones"}
                </>
              ) : (
                <span className="text-muted">Pasa el puntero por un cuadro para ver el número.</span>
              )}
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-muted" aria-hidden>
              Menos
              {[CERO, ...RAMPA].map((c) => (
                <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
              ))}
              Más
            </div>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
