import { MOTIVO_PERDIDA_LABEL } from "@/lib/admin/chats-tipos";
import type { Metricas } from "@/lib/admin/metricas";
import { SinDatos, Tarjeta } from "./Tarjeta";

/** Una sola serie (cuántas por motivo): un solo tono. «Sin motivo» va en gris porque no es un motivo. */
const TONO_MOTIVO = "#eb6834";
const TONO_SIN_MOTIVO = "#c2cad6";

function porcentaje(valor: number): string {
  return `${Math.round(valor * 100)} %`;
}

/**
 * Pareto de «¿Por qué se perdió la venta?»: de las conversaciones del periodo que hoy están en «No vendido», cuántas
 * por cada motivo, de mayor a menor, con su parte y la parte acumulada (los primeros motivos explican la mayoría).
 */
export default function VentasPerdidas({ metricas }: { metricas: Metricas }) {
  const { perdidas, cierres } = metricas;
  const maximo = Math.max(1, ...perdidas.map((p) => p.total));
  const sinMotivo = perdidas.find((p) => p.motivo === null)?.total ?? 0;

  return (
    <Tarjeta
      titulo="¿Por qué se perdió la venta?"
      nota="Conversaciones del periodo que hoy están en «No vendido», por motivo y de mayor a menor. «Acumulado»: qué parte de las ventas perdidas explican ese motivo y los de arriba."
    >
      {cierres.noVendidas === 0 ? (
        <SinDatos alto={140}>Ninguna venta perdida en este periodo.</SinDatos>
      ) : (
        <>
          <div className="t-mono mb-2 hidden grid-cols-[minmax(0,15rem)_1fr_3rem_3.5rem_5rem] items-baseline gap-3 text-[10.5px] uppercase tracking-[0.12em] text-muted sm:grid">
            <span>Motivo</span>
            <span />
            <span className="text-right">Leads</span>
            <span className="text-right">Parte</span>
            <span className="text-right">Acumulado</span>
          </div>
          <ul className="flex flex-col gap-2.5" aria-label={`${cierres.noVendidas} ventas perdidas por motivo`}>
            {perdidas.map((p) => {
              const nombre = p.motivo ? MOTIVO_PERDIDA_LABEL[p.motivo] : "Sin motivo registrado";
              return (
                <li
                  key={p.motivo ?? "sin_motivo"}
                  title={`${nombre}: ${p.total} (${porcentaje(p.parte)}${p.motivo ? `, acumulado ${porcentaje(p.acumulado)}` : ""})`}
                  className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[12.5px] sm:grid-cols-[minmax(0,15rem)_1fr_3rem_3.5rem_5rem]"
                >
                  <span className={`truncate group-hover:text-ink ${p.motivo ? "text-ink-soft" : "text-muted"}`}>{nombre}</span>
                  <span className="t-mono text-right font-semibold tabular-nums text-ink sm:order-3">{p.total}</span>
                  <div className="col-span-2 h-2.5 overflow-hidden rounded-full bg-bg-soft sm:order-2 sm:col-span-1">
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{
                        width: p.total ? `${Math.max(2, (p.total / maximo) * 100)}%` : 0,
                        background: p.motivo ? TONO_MOTIVO : TONO_SIN_MOTIVO,
                      }}
                    />
                  </div>
                  <span className="t-mono hidden text-right tabular-nums text-ink-soft sm:order-4 sm:block">{porcentaje(p.parte)}</span>
                  <span className="t-mono hidden text-right tabular-nums text-muted sm:order-5 sm:block">{p.motivo ? porcentaje(p.acumulado) : "—"}</span>
                </li>
              );
            })}
          </ul>
          {sinMotivo > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">
              {sinMotivo === 1 ? "1 venta perdida no tiene" : `${sinMotivo} ventas perdidas no tienen`} motivo: se elige en la ficha del chat,
              en «¿Por qué se perdió la venta?».
            </p>
          )}
        </>
      )}
    </Tarjeta>
  );
}
