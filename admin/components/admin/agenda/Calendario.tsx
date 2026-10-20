"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BellRing, CalendarPlus, Check, ChevronLeft, ChevronRight, MessageSquareText, Pencil, Users } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import FiltroDesplegable from "@/components/admin/FiltroDesplegable";
import EventoDialogo from "@/components/admin/agenda/EventoDialogo";
import {
  COLUMNAS_AGENDA,
  TIPOS_AGENDA,
  TIPO_AGENDA_LABEL,
  alertaDe,
  diaCancun,
  eventosDelDia,
  fechaLargaCancun,
  horaCancun,
  moverMes,
  nombreMes,
  rangoDelMes,
  semanasDelMes,
  type EventoAgenda,
  type TipoAgenda,
} from "@/lib/admin/agenda";
import { CHAT_QUERY_PARAM, RUTA_CHATS_PANEL, nombreCorto, type StaffMiembro } from "@/lib/admin/chats-tipos";

type EventoConCliente = EventoAgenda & { clientes: { nombre: string | null; telefono: string | null } | null };

const SELECCION = `${COLUMNAS_AGENDA}, clientes(nombre, telefono)`;
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const TONO_TIPO: Record<TipoAgenda, { fondo: string; texto: string; punto: string }> = {
  apartado: { fondo: "rgba(8,145,178,0.14)", texto: "#0e5f75", punto: "#0891b2" },
  visita: { fondo: "rgba(124,58,237,0.12)", texto: "#5b21b6", punto: "#7c3aed" },
  llamada: { fondo: "rgba(43,80,236,0.11)", texto: "#1b37b3", punto: "#2b50ec" },
  otro: { fondo: "rgba(10,15,26,0.07)", texto: "#364152", punto: "#8a96a8" },
};

const TONO_ALERTA = {
  vencido: "border-redline/40 bg-redline/[0.06] text-redline",
  hoy: "border-amber/60 bg-[rgba(242,165,22,0.14)] text-amber-ink",
  manana: "border-amber/40 bg-[rgba(242,165,22,0.09)] text-amber-ink",
  pronto: "border-line bg-bg-soft text-ink-soft",
} as const;

function nombreDelCliente(e: EventoConCliente): string | null {
  return e.clientes?.nombre?.trim() || null;
}

export default function Calendario({
  usuarioId,
  rol,
  staff,
}: {
  usuarioId: string;
  rol: string;
  staff: StaffMiembro[];
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [hoy] = useState(() => diaCancun(Date.now()));
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [dia, setDia] = useState(hoy);
  const [eventos, setEventos] = useState<EventoConCliente[]>([]);
  const [alertas, setAlertas] = useState<EventoConCliente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vendedor, setVendedor] = useState(rol === "vendedor" ? "mios" : "");
  const [tipos, setTipos] = useState<TipoAgenda[]>([]);
  const [dialogo, setDialogo] = useState<{ evento: EventoConCliente | null; fecha?: string } | null>(null);

  const nombrePorId = useMemo(() => new Map(staff.map((s) => [s.user_id, s.nombre])), [staff]);

  const cargar = useCallback(async () => {
    const { desde, hasta } = rangoDelMes(mes);
    const limite = new Date(Date.now() + 4 * 86_400_000).toISOString();
    const [rango, urgentes] = await Promise.all([
      supabase.from("agenda").select(SELECCION).gte("fecha_hora", desde).lte("fecha_hora", hasta).order("fecha_hora").limit(600),
      supabase.from("agenda").select(SELECCION).eq("estado", "pendiente").lte("fecha_hora", limite).order("fecha_hora").limit(100),
    ]);
    if (rango.error || urgentes.error) {
      setError("No se pudo leer la agenda. ¿Ya corriste la migración 0011 en Supabase?");
      return;
    }
    setError(null);
    setEventos((rango.data ?? []) as unknown as EventoConCliente[]);
    setAlertas((urgentes.data ?? []) as unknown as EventoConCliente[]);
  }, [supabase, mes]);

  useEffect(() => {
    const primera = setTimeout(() => void cargar(), 0);
    const sufijo = Math.random().toString(36).slice(2, 8);
    const canal = supabase
      .channel(`agenda-${sufijo}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda" }, () => void cargar())
      .subscribe();
    return () => {
      clearTimeout(primera);
      void supabase.removeChannel(canal);
    };
  }, [supabase, cargar]);

  const pasaFiltros = useCallback(
    (e: EventoConCliente) => {
      if (vendedor === "mios" && e.asignada_a !== usuarioId && e.asignada_a !== null) return false;
      if (vendedor && vendedor !== "mios" && e.asignada_a !== vendedor) return false;
      if (tipos.length > 0 && !tipos.includes(e.tipo)) return false;
      return true;
    },
    [vendedor, tipos, usuarioId],
  );
  const visibles = useMemo(() => eventos.filter(pasaFiltros), [eventos, pasaFiltros]);
  const alertasVisibles = useMemo(() => alertas.filter(pasaFiltros).filter((e) => alertaDe(e).nivel !== "ninguna"), [alertas, pasaFiltros]);
  const semanas = useMemo(() => semanasDelMes(mes), [mes]);
  const delDia = eventosDelDia(visibles, dia);

  async function marcarHecho(e: EventoConCliente) {
    const { data, error: err } = await supabase.from("agenda").update({ estado: "hecho" }).eq("id", e.id).select("id");
    if (err || !data?.length) {
      toast.error("No se pudo marcar como hecho.");
      return;
    }
    toast.success("Hecho");
    void cargar();
  }

  const opcionesVendedor = [
    { id: "", label: "Todo el equipo", icono: <Users size={16} strokeWidth={1.9} aria-hidden /> },
    { id: "mios", label: "Míos y sin dueño" },
    ...staff.filter((s) => s.user_id !== usuarioId).map((s) => ({ id: s.user_id, label: nombreCorto(s.nombre) || s.nombre })),
  ];

  const tarjetaEvento = (e: EventoConCliente) => {
    const t = TONO_TIPO[e.tipo];
    const alerta = alertaDe(e);
    const cliente = nombreDelCliente(e);
    return (
      <li key={e.id} className="rounded-xl border border-line bg-porcelain p-3">
        <div className="flex items-start gap-2.5">
          <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: t.punto }} />
          <div className="min-w-0 flex-1">
            <p className={`text-[13.5px] font-medium ${e.estado === "pendiente" ? "text-ink" : "text-muted line-through"}`}>{e.titulo}</p>
            <p className="t-mono mt-0.5 text-[11px] text-muted">
              {horaCancun(e.fecha_hora)} · {TIPO_AGENDA_LABEL[e.tipo]}
              {e.estado !== "pendiente" ? ` · ${e.estado === "hecho" ? "hecho" : "cancelado"}` : ""}
            </p>
            {(cliente || e.asignada_a) && (
              <p className="mt-1 text-[12px] text-ink-soft">
                {cliente && <span>{cliente}</span>}
                {cliente && e.asignada_a && " · "}
                {e.asignada_a && <span>Le toca a {nombreCorto(nombrePorId.get(e.asignada_a)) || "—"}</span>}
              </p>
            )}
            {e.notas && <p className="mt-1 text-[12px] text-muted">{e.notas}</p>}
            {alerta.nivel !== "ninguna" && (
              <span className={`mt-1.5 inline-flex rounded-full border px-2 py-px text-[10.5px] font-semibold ${TONO_ALERTA[alerta.nivel]}`}>{alerta.texto}</span>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {e.estado === "pendiente" && (
            <button type="button" onClick={() => void marcarHecho(e)} className="admin-btn ghost inline-flex min-h-9 items-center gap-1.5 !px-3 text-[12px]">
              <Check size={13} aria-hidden /> Hecho
            </button>
          )}
          <button type="button" onClick={() => setDialogo({ evento: e })} className="admin-btn ghost inline-flex min-h-9 items-center gap-1.5 !px-3 text-[12px]">
            <Pencil size={13} aria-hidden /> Editar
          </button>
          {e.conversacion_id && (
            <Link
              href={`${RUTA_CHATS_PANEL}?${CHAT_QUERY_PARAM}=${e.conversacion_id}`}
              className="admin-btn ghost inline-flex min-h-9 items-center gap-1.5 !px-3 text-[12px]"
            >
              <MessageSquareText size={13} aria-hidden /> Abrir el chat
            </Link>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-xl border border-redline/30 bg-redline/[0.05] px-4 py-3 text-[13px] text-redline">{error}</p>}

      {alertasVisibles.length > 0 && (
        <section aria-label="Alertas de la agenda" className="admin-card p-4">
          <h2 className="t-display mb-3 flex items-center gap-2 text-[17px] leading-none">
            <BellRing size={17} aria-hidden className="text-amber" />
            Alertas
            <span className="t-mono rounded-full bg-amber px-1.5 text-[11px] font-semibold leading-[18px] text-pit tabular-nums">{alertasVisibles.length}</span>
          </h2>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {alertasVisibles.slice(0, 9).map((e) => {
              const alerta = alertaDe(e);
              return (
                <li key={e.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${alerta.nivel === "ninguna" ? "" : TONO_ALERTA[alerta.nivel]}`}>
                  <div className="min-w-0 flex-1">
                    <p className="t-mono text-[10.5px] font-semibold uppercase tracking-[0.1em]">{alerta.texto}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setMes(diaCancun(e.fecha_hora).slice(0, 7));
                        setDia(diaCancun(e.fecha_hora));
                      }}
                      className="mt-0.5 block max-w-full truncate text-left text-[13px] font-medium text-ink hover:underline"
                    >
                      {e.titulo}
                    </button>
                    <p className="text-[11.5px] text-ink-soft">
                      {horaCancun(e.fecha_hora)}
                      {nombreDelCliente(e) ? ` · ${nombreDelCliente(e)}` : ""}
                    </p>
                  </div>
                  <button type="button" onClick={() => void marcarHecho(e)} title="Marcar como hecho" className="admin-btn ghost !min-h-8 !px-2.5 text-[12px]">
                    <Check size={13} aria-hidden />
                    <span className="sr-only">Marcar como hecho</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))} className="admin-btn ghost !min-h-9 !px-2.5">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <h2 className="t-display min-w-[10.5rem] text-center text-[19px] capitalize leading-none">{nombreMes(mes)}</h2>
          <button type="button" aria-label="Mes siguiente" onClick={() => setMes(moverMes(mes, 1))} className="admin-btn ghost !min-h-9 !px-2.5">
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setMes(hoy.slice(0, 7));
            setDia(hoy);
          }}
          className="admin-btn ghost !min-h-9 !px-3 text-[13px]"
        >
          Hoy
        </button>
        <FiltroDesplegable nombre="Equipo" icono={<Users size={15} aria-hidden />} opciones={opcionesVendedor} valor={vendedor} onCambiar={setVendedor} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
          {TIPOS_AGENDA.map((t) => {
            const activo = tipos.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={activo}
                onClick={() => setTipos((previos) => (activo ? previos.filter((x) => x !== t) : [...previos, t]))}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors ${
                  activo ? "border-ink bg-ink text-white" : "border-line bg-porcelain text-ink-soft hover:border-line-strong hover:text-ink"
                }`}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: TONO_TIPO[t].punto }} />
                {TIPO_AGENDA_LABEL[t]}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setDialogo({ evento: null, fecha: `${dia}T10:00` })} className="admin-btn ml-auto inline-flex items-center gap-2">
          <CalendarPlus size={16} aria-hidden />
          Agendar
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <section aria-label={`Calendario de ${nombreMes(mes)}`} className="admin-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-[#f7f9fb]">
            {DIAS_CORTOS.map((d) => (
              <div key={d} className="t-mono px-2 py-2 text-center text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {semanas.flat().map(({ dia: d, delMes }) => {
              const lista = eventosDelDia(visibles, d);
              const esHoy = d === hoy;
              const elegido = d === dia;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDia(d)}
                  aria-label={`${fechaLargaCancun(`${d}T12:00:00-05:00`)}, ${lista.length} ${lista.length === 1 ? "evento" : "eventos"}`}
                  aria-pressed={elegido}
                  className={`flex min-h-[92px] flex-col items-stretch gap-1 border-b border-r border-line p-1.5 text-left transition-colors max-sm:min-h-[64px] ${
                    elegido ? "bg-accent-soft/60" : delMes ? "hover:bg-bg/60" : "bg-bg-soft/40 hover:bg-bg/60"
                  }`}
                >
                  <span
                    className={`t-mono flex size-6 items-center justify-center self-end rounded-full text-[11.5px] tabular-nums ${
                      esHoy ? "bg-accent font-semibold text-white" : delMes ? "text-ink-soft" : "text-muted/60"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {lista.slice(0, 3).map((e) => {
                    const t = TONO_TIPO[e.tipo];
                    const vencido = alertaDe(e).nivel === "vencido";
                    return (
                      <span
                        key={e.id}
                        className={`truncate rounded px-1.5 py-px text-[10.5px] font-medium max-sm:hidden ${e.estado !== "pendiente" ? "line-through opacity-50" : ""}`}
                        style={{ background: vencido ? "rgba(225,29,72,0.10)" : t.fondo, color: vencido ? "#9f1239" : t.texto }}
                      >
                        {horaCancun(e.fecha_hora).replace(/\s?(a\. m\.|p\. m\.)/i, (m) => (/a/i.test(m) ? "a" : "p"))} {e.titulo}
                      </span>
                    );
                  })}
                  {lista.length > 3 && <span className="px-1.5 text-[10.5px] text-muted max-sm:hidden">+{lista.length - 3} más</span>}
                  {lista.length > 0 && (
                    <span className="flex gap-0.5 sm:hidden" aria-hidden>
                      {lista.slice(0, 4).map((e) => (
                        <span key={e.id} className="size-1.5 rounded-full" style={{ background: TONO_TIPO[e.tipo].punto }} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <aside aria-label="Eventos del día" className="admin-card flex flex-col gap-3 p-4">
          <header className="flex items-start justify-between gap-2">
            <div>
              <span className="t-brace">{dia === hoy ? "Hoy" : "Día elegido"}</span>
              <h3 className="t-display mt-1 text-[17px] capitalize leading-tight">{fechaLargaCancun(`${dia}T12:00:00-05:00`)}</h3>
            </div>
            <button type="button" onClick={() => setDialogo({ evento: null, fecha: `${dia}T10:00` })} className="admin-btn ghost !min-h-9 !px-3 text-[12px]">
              <CalendarPlus size={14} aria-hidden /> Agendar
            </button>
          </header>
          {delDia.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-3 py-8 text-center text-[13px] text-muted">Nada agendado este día.</p>
          ) : (
            <ul className="flex flex-col gap-2">{delDia.map(tarjetaEvento)}</ul>
          )}
        </aside>
      </div>

      <EventoDialogo
        abierto={dialogo !== null}
        onCerrar={() => setDialogo(null)}
        evento={dialogo?.evento ?? null}
        inicial={dialogo?.fecha ? { fecha: dialogo.fecha } : undefined}
        staff={staff}
        usuarioId={usuarioId}
        onGuardado={() => void cargar()}
        onEliminado={() => void cargar()}
      />
    </div>
  );
}
