import { CircleCheck, CircleX } from "lucide-react";
import { ETAPA_LABEL } from "@/lib/admin/chats-tipos";
import type { Metricas } from "@/lib/admin/metricas";
import { SinDatos, Tarjeta } from "./Tarjeta";

/** Rampa ordinal (un tono, de claro a oscuro según avanza la etapa), validada con el validador de dataviz. */
const RAMPA_ETAPAS = ["#9cc3f1", "#6ba3e9", "#3f86dd", "#1c5cab", "#104281"];

/** Dónde están hoy las conversaciones que entraron en el periodo, y cuántas terminaron en Vendido o No vendido. */
export default function Etapas({ metricas }: { metricas: Metricas }) {
  const { etapas, cierres, kpis } = metricas;
  const maximo = Math.max(1, ...etapas.map((e) => e.total));
  const abiertas = etapas.reduce((n, e) => n + e.total, 0);

  return (
    <Tarjeta titulo="Etapa actual" nota="Dónde están hoy las conversaciones que entraron en el periodo.">
      {kpis.entradas === 0 ? (
        <SinDatos alto={200}>Sin conversaciones en este periodo.</SinDatos>
      ) : (
        <>
          <ul className="flex flex-col gap-3" aria-label={`${abiertas} abiertas por etapa`}>
            {etapas.map((e, i) => (
              <li key={e.etapa} title={`${ETAPA_LABEL[e.etapa]}: ${e.total}`} className="group">
                <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-soft group-hover:text-ink">{ETAPA_LABEL[e.etapa]}</span>
                  <span className="t-mono font-semibold tabular-nums text-ink">{e.total}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-bg-soft">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: e.total ? `${Math.max(2, (e.total / maximo) * 100)}%` : 0, background: RAMPA_ETAPAS[i] }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-line pt-4">
            <p className="t-mono mb-2 text-[10.5px] uppercase tracking-[0.12em] text-muted">Cerradas · {kpis.cerradas}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
              <li className="flex items-center gap-1.5 text-ink-soft">
                <CircleCheck size={15} aria-hidden className="text-signal" />
                <span className="t-mono font-semibold tabular-nums text-ink">{cierres.vendidas}</span>
                {cierres.vendidas === 1 ? "vendida" : "vendidas"}
              </li>
              <li className="flex items-center gap-1.5 text-ink-soft">
                <CircleX size={15} aria-hidden className="text-redline" />
                <span className="t-mono font-semibold tabular-nums text-ink">{cierres.noVendidas}</span>
                no {cierres.noVendidas === 1 ? "vendida" : "vendidas"}
              </li>
            </ul>
          </div>
        </>
      )}
    </Tarjeta>
  );
}
