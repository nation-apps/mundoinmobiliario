import type { ReactNode } from "react";
import { CircleAlert, Megaphone, UserRoundX } from "lucide-react";
import { iniciales } from "@/lib/admin/chats-tipos";
import { duracionCorta, type Metricas } from "@/lib/admin/metricas";
import Tacometro from "./Tacometro";
import { SinDatos, Tarjeta } from "./Tarjeta";

const ROL_LABEL: Record<string, string> = { admin: "Administración", asistente: "Asistente", vendedor: "Ventas" };

function Th({ children, derecha = false }: { children: ReactNode; derecha?: boolean }) {
  return (
    <th
      scope="col"
      className={`t-mono whitespace-nowrap border-b border-line bg-[#f7f9fb] px-3 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted first:pl-4 last:pr-4 ${
        derecha ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, derecha = false, className = "" }: { children: ReactNode; derecha?: boolean; className?: string }) {
  return (
    <td className={`whitespace-nowrap border-b border-line px-3 py-2.5 align-middle first:pl-4 last:pr-4 ${derecha ? "text-right tabular-nums" : ""} ${className}`}>
      {children}
    </td>
  );
}

/** Parte del total, como medidor: pista clara y relleno del mismo tono. */
function Medidor({ valor, total }: { valor: number; total: number }) {
  const parte = total > 0 ? valor / total : 0;
  return (
    <span className="ml-auto flex w-[96px] items-center gap-2" title={`${Math.round(parte * 100)} % del total`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent-soft">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(parte > 0 ? 3 : 0, parte * 100)}%` }} />
      </span>
      <span className="t-mono w-9 text-right text-[11px] tabular-nums text-muted">{Math.round(parte * 100)}%</span>
    </span>
  );
}

function Cero() {
  return <span className="text-line-strong">0</span>;
}

/** Cuánto tardó una persona: el tacómetro chico y la cifra. */
function Respuesta({ minutos }: { minutos: number | null }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Tacometro minutos={minutos} tamano="mini" />
      <span className={`t-mono w-[66px] text-right text-[12px] tabular-nums ${minutos === null ? "text-muted" : "text-ink"}`}>{duracionCorta(minutos)}</span>
    </span>
  );
}

export function TablaOrigen({ metricas }: { metricas: Metricas }) {
  const { porOrigen, kpis } = metricas;
  return (
    <Tarjeta
      titulo="Por origen"
      nota="De qué campaña o canal vino cada conversación del periodo. «Sin atender»: siguen en «Nueva» y nadie del equipo les respondió."
    >
      {porOrigen.length === 0 ? (
        <SinDatos alto={120}>Sin conversaciones en este periodo.</SinDatos>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[700px] text-[13px]">
            <caption className="sr-only">Conversaciones del periodo por origen</caption>
            <thead>
              <tr>
                <Th>Origen</Th>
                <Th derecha>Entradas</Th>
                <Th derecha>Parte</Th>
                <Th derecha>Sin atender</Th>
                <Th derecha>Con visita</Th>
                <Th derecha>Ganadas</Th>
                <Th derecha>1ª respuesta de una persona</Th>
              </tr>
            </thead>
            <tbody>
              {porOrigen.map((o) => (
                <tr key={o.origen} className="transition-colors hover:bg-bg/60">
                  <Td>
                    <span className="flex items-center gap-2">
                      {o.campana ? (
                        <span title="Campaña de Meta" className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent">
                          <Megaphone size={13} aria-hidden />
                        </span>
                      ) : (
                        <span aria-hidden className="size-6" />
                      )}
                      <span className="font-medium text-ink">{o.origen}</span>
                      {o.campana && <span className="sr-only">(campaña)</span>}
                    </span>
                  </Td>
                  <Td derecha>
                    <span className="t-mono font-semibold">{o.entradas}</span>
                  </Td>
                  <Td derecha>
                    <Medidor valor={o.entradas} total={kpis.entradas} />
                  </Td>
                  <Td derecha>
                    {o.sinAtender > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(242,165,22,0.16)] px-2 py-0.5 text-[12px] font-semibold text-amber-ink">
                        <CircleAlert size={12} aria-hidden />
                        {o.sinAtender}
                      </span>
                    ) : (
                      <Cero />
                    )}
                  </Td>
                  <Td derecha>{o.conVisita || <Cero />}</Td>
                  <Td derecha>{o.ganadas ? <span className="font-semibold text-signal-ink">{o.ganadas}</span> : <Cero />}</Td>
                  <Td derecha>
                    <Respuesta minutos={o.respuestaHumanaMin} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

export function TablaVendedores({ metricas }: { metricas: Metricas }) {
  const { porVendedor, kpis } = metricas;
  const asignadasTotal = porVendedor.reduce((n, v) => n + v.asignadas, 0);
  return (
    <Tarjeta
      titulo="Por vendedor"
      nota="Conversaciones del periodo según a quién están asignadas hoy. «Abiertas» y «sin responder» son en este momento."
    >
      {porVendedor.length === 0 ? (
        <SinDatos alto={120}>Todavía no hay personas en el equipo.</SinDatos>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[760px] text-[13px]">
            <caption className="sr-only">Conversaciones por vendedor</caption>
            <thead>
              <tr>
                <Th>Persona</Th>
                <Th derecha>Asignadas</Th>
                <Th derecha>Parte</Th>
                <Th derecha>Abiertas</Th>
                <Th derecha>Sin responder</Th>
                <Th derecha>Ganadas</Th>
                <Th derecha>Perdidas</Th>
                <Th derecha>1ª respuesta</Th>
              </tr>
            </thead>
            <tbody>
              {porVendedor.map((v) => (
                <tr key={v.userId ?? "sin-asignar"} className={`transition-colors hover:bg-bg/60 ${v.userId ? "" : "bg-bg/40"}`}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      {v.userId ? (
                        <span aria-hidden className="t-display flex size-7 items-center justify-center rounded-full bg-ink text-[12px] text-white">
                          {iniciales(v.nombre)}
                        </span>
                      ) : (
                        <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-bg-soft text-muted">
                          <UserRoundX size={14} />
                        </span>
                      )}
                      <span className="flex flex-col leading-tight">
                        <span className={`font-medium ${v.userId ? "text-ink" : "text-ink-soft"}`}>{v.nombre}</span>
                        {v.rol && <span className="t-mono text-[10px] uppercase tracking-[0.1em] text-muted">{ROL_LABEL[v.rol] ?? v.rol}</span>}
                      </span>
                    </span>
                  </Td>
                  <Td derecha>
                    <span className="t-mono font-semibold">{v.asignadas}</span>
                  </Td>
                  <Td derecha>
                    <Medidor valor={v.asignadas} total={asignadasTotal || kpis.entradas} />
                  </Td>
                  <Td derecha>{v.abiertasAhora || <Cero />}</Td>
                  <Td derecha>
                    {v.sinResponderAhora > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-redline/[0.08] px-2 py-0.5 text-[12px] font-semibold text-redline">
                        <span aria-hidden className="size-1.5 rounded-full bg-current" />
                        {v.sinResponderAhora}
                      </span>
                    ) : (
                      <Cero />
                    )}
                  </Td>
                  <Td derecha>{v.ganadas ? <span className="font-semibold text-signal-ink">{v.ganadas}</span> : <Cero />}</Td>
                  <Td derecha>{v.perdidas || <Cero />}</Td>
                  <Td derecha>
                    <Respuesta minutos={v.respuestaHumanaMin} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
