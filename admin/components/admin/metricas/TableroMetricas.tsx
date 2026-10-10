"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  CircleCheck,
  Clock3,
  Equal,
  Inbox,
  Megaphone,
  RefreshCw,
  Timer,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { Menu, MenuOpcion, MenuTitulo, CLASE_DISPARADOR } from "@/components/admin/Menu";
import { ZONA_NEGOCIO } from "@/lib/admin/rango";
import { PERIODOS, duracionCorta, type Metricas, type PeriodoId } from "@/lib/admin/metricas";
import Etapas from "./Etapas";
import GraficaEntradas from "./GraficaEntradas";
import MapaCalor from "./MapaCalor";
import Tacometro, { META_RESPUESTA_MIN } from "./Tacometro";
import { TablaOrigen, TablaVendedores } from "./Tablas";

/* ---------- Encabezado ---------- */

function fechaLarga(iso: string, conAnio = false): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    timeZone: ZONA_NEGOCIO,
    day: "numeric",
    month: "long",
    ...(conAnio ? { year: "numeric" } : {}),
  });
}

function textoRango(m: Metricas): string {
  if (m.periodo === "hoy") {
    return `Hoy, ${new Date(m.fin).toLocaleDateString("es-MX", { timeZone: ZONA_NEGOCIO, weekday: "long", day: "numeric", month: "long" })}`;
  }
  return `Del ${fechaLarga(m.inicio)} al ${fechaLarga(m.fin, true)}`;
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { timeZone: ZONA_NEGOCIO, hour: "2-digit", minute: "2-digit", hour12: false });
}

/* ---------- Indicadores ---------- */

function Indicador({
  etiqueta,
  icono,
  valor,
  className = "",
  children,
}: {
  etiqueta: string;
  icono: ReactNode;
  valor: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`admin-card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <p className="flex items-center gap-2 text-[12.5px] text-muted">
        <span aria-hidden className="flex size-6 items-center justify-center rounded-md bg-bg text-ink-soft">
          {icono}
        </span>
        {etiqueta}
      </p>
      <p className="mt-3 text-[clamp(26px,2.6vw,34px)] font-semibold leading-none tracking-[-0.02em] text-ink">{valor}</p>
      {children}
    </div>
  );
}

/** Cambio contra el tramo anterior: la flecha dice hacia dónde, el color si es bueno. */
function Cambio({
  actual,
  previo,
  comparado,
  subirEsBueno = true,
}: {
  actual: number | null;
  previo: number | null;
  comparado: string;
  subirEsBueno?: boolean;
}) {
  if (actual === null || previo === null) return <p className="mt-2 text-[12px] text-muted">Sin datos de {comparado} para comparar</p>;
  if (previo === 0) {
    return <p className="mt-2 text-[12px] text-muted">{actual === 0 ? `Igual que ${comparado}` : `En ${comparado} no hubo`}</p>;
  }
  const cambio = (actual - previo) / previo;
  const porcentaje = Math.round(Math.abs(cambio) * 100);
  if (porcentaje === 0) {
    return (
      <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-muted">
        <Equal size={13} aria-hidden /> Igual que {comparado}
      </p>
    );
  }
  const sube = cambio > 0;
  const bueno = sube === subirEsBueno;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1 text-[12px]">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${bueno ? "text-signal-ink" : "text-redline"}`}>
        {sube ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
        <span className="sr-only">{sube ? "Subió" : "Bajó"}</span>
        {porcentaje} %
      </span>
      <span className="text-muted">vs. {comparado}</span>
    </p>
  );
}

/* ---------- Tablero ---------- */

export default function TableroMetricas({ metricas }: { metricas: Metricas }) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const { kpis } = metricas;
  const periodo = PERIODOS.find((p) => p.id === metricas.periodo) ?? PERIODOS[0];
  const parteCampana = kpis.entradas ? Math.round((kpis.deCampana / kpis.entradas) * 100) : 0;

  function cambiarPeriodo(id: PeriodoId) {
    iniciar(() => router.push(`/admin/metricas?periodo=${id}`, { scroll: false }));
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <span className="t-brace">Rendimiento</span>
          <h1 className="t-titulo mt-2.5 text-[clamp(30px,3.4vw,42px)]">Métricas de chats</h1>
          <p className="mt-2 text-sm text-ink-soft first-letter:uppercase">
            {textoRango(metricas)} <span className="text-muted">· hora de Cancún</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-mono text-[11px] text-muted" aria-live="polite">
            {cargando ? "Actualizando…" : `Actualizado ${horaCorta(metricas.generadoEn)}`}
          </span>
          <button
            type="button"
            onClick={() => iniciar(() => router.refresh())}
            aria-label="Actualizar las métricas"
            title="Actualizar"
            className="inline-flex size-9 items-center justify-center border border-line bg-porcelain text-ink-soft transition-colors hover:border-line-strong hover:text-ink max-lg:size-11"
          >
            <RefreshCw size={15} aria-hidden className={cargando ? "animate-spin" : ""} />
          </button>
          <Menu
            etiqueta="Periodo"
            alinear="fin"
            ancho={230}
            claseBoton={CLASE_DISPARADOR}
            boton={
              <>
                <CalendarRange size={15} aria-hidden className="text-muted" />
                <span className="sr-only">Periodo:</span>
                <span className="font-medium">{periodo.label}</span>
                <ChevronDown size={14} aria-hidden className="text-muted" />
              </>
            }
          >
            <MenuTitulo>Periodo</MenuTitulo>
            {PERIODOS.map((p) => (
              <MenuOpcion key={p.id} elegida={p.id === metricas.periodo} onElegir={() => cambiarPeriodo(p.id)}>
                {p.label}
              </MenuOpcion>
            ))}
          </Menu>
        </div>
      </header>

      {metricas.truncado && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber/50 bg-[rgba(242,165,22,0.10)] px-4 py-2.5 text-[13px] text-amber-ink">
          <TriangleAlert size={16} aria-hidden />
          Hay demasiadas conversaciones en este periodo y algunas quedaron fuera de la cuenta. Elige un periodo más corto.
        </p>
      )}

      {/* Mientras llega el periodo nuevo se queda el anterior, atenuado: sin saltos ni esqueletos. */}
      <div aria-busy={cargando} className={`flex flex-col gap-3 transition-opacity duration-200 ${cargando ? "opacity-55" : ""}`}>
        <div className="grid grid-flow-dense grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Indicador etiqueta="Entradas" icono={<Inbox size={14} />} valor={kpis.entradas}>
            <Cambio actual={kpis.entradas} previo={kpis.entradasPrevias} comparado={periodo.comparado} />
          </Indicador>

          <Indicador etiqueta="De campañas" icono={<Megaphone size={14} />} valor={kpis.deCampana}>
            <div className="mt-2.5 flex items-center gap-2" title={`${parteCampana} % de las entradas`}>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent-soft">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${parteCampana}%` }} />
              </span>
              <span className="t-mono text-[11px] tabular-nums text-muted">{parteCampana}%</span>
            </div>
            <p className="mt-1.5 text-[12px] text-muted">de las entradas</p>
          </Indicador>

          <Indicador
            etiqueta="Sin responder ahora"
            icono={<Clock3 size={14} />}
            valor={<span className={kpis.sinResponderAhora > 0 ? "text-redline" : ""}>{kpis.sinResponderAhora}</span>}
          >
            {kpis.sinResponderAhora > 0 ? (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-redline">
                <span aria-hidden className="punto-vivo" />
                Esperando respuesta
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-signal-ink">
                <CircleCheck size={14} aria-hidden /> Nadie está esperando
              </p>
            )}
            <p className="mt-1 text-[12px] text-muted">de {kpis.abiertasAhora} abiertas</p>
            {kpis.sinResponderAhora > 0 && (
              <Link href="/admin/chats" className="mt-auto inline-flex items-center gap-1 pt-2 text-[12px] font-medium text-accent hover:text-accent-deep">
                Abrir Chats <ArrowUpRight size={13} aria-hidden />
              </Link>
            )}
          </Indicador>

          <div className="admin-card col-span-2 flex min-w-0 flex-col p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-2 text-[12.5px] text-muted">
                <span aria-hidden className="flex size-6 items-center justify-center rounded-md bg-bg text-ink-soft">
                  <Timer size={14} />
                </span>
                1ª respuesta de una persona
              </p>
              <span className="t-mono shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent-deep">
                meta {META_RESPUESTA_MIN} min
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-[clamp(26px,2.6vw,34px)] font-semibold leading-none tracking-[-0.02em] text-ink">
                {duracionCorta(kpis.respuestaHumanaMin)}
              </p>
              {kpis.respuestaHumanaMin !== null && (
                <Cambio
                  actual={kpis.respuestaHumanaMin}
                  previo={kpis.respuestaHumanaPreviaMin}
                  comparado={periodo.comparado}
                  subirEsBueno={false}
                />
              )}
            </div>
            <div className="mt-4">
              <Tacometro minutos={kpis.respuestaHumanaMin} />
            </div>
            <p className="mt-2 text-[12px] text-muted">
              {kpis.respondidasPorPersona === 0
                ? "Todavía nadie del equipo respondió una conversación de este periodo."
                : `Mediana de ${kpis.respondidasPorPersona} ${kpis.respondidasPorPersona === 1 ? "conversación respondida" : "conversaciones respondidas"} por el equipo.`}
              {kpis.respuestaCualquieraMin !== null && ` Contando al bot: ${duracionCorta(kpis.respuestaCualquieraMin)}.`}
            </p>
          </div>

          <Indicador etiqueta="Ganadas" icono={<Trophy size={14} />} valor={kpis.ganadas}>
            <p className="mt-2 text-[12px] text-muted">
              {kpis.cerradas === 0
                ? "Ninguna cerrada todavía"
                : `${Math.round((kpis.ganadas / kpis.cerradas) * 100)} % de ${kpis.cerradas} ${kpis.cerradas === 1 ? "cerrada" : "cerradas"}`}
            </p>
          </Indicador>
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <GraficaEntradas metricas={metricas} />
          </div>
          <Etapas metricas={metricas} />
        </div>

        <TablaOrigen metricas={metricas} />
        <TablaVendedores metricas={metricas} />
        <MapaCalor metricas={metricas} />
      </div>
    </div>
  );
}
