"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleX, Ellipsis, GripVertical, Inbox, Layers, Megaphone, MessageSquareText, Minus, Search, Users, X } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useAvisos } from "@/components/admin/chats/Avisos";
import CanalIcono from "@/components/admin/chats/CanalIcono";
import { ETAPA_TONO, ETIQUETA_TONO } from "@/components/admin/chats/ListaConversaciones";
import DialogShell from "@/components/admin/DialogShell";
import FiltroDesplegable from "@/components/admin/FiltroDesplegable";
import { Menu, MenuAccion, MenuOpcion, MenuSeparador, MenuTitulo } from "@/components/admin/Menu";
import {
  CANAL_LABEL,
  ETAPAS,
  ETAPA_LABEL,
  HILO_LEAD_ADS,
  INTERES_LABEL,
  MOTIVOS_CIERRE,
  MOTIVO_CIERRE_LABEL,
  campanaCorta,
  describirIdentidad,
  esperaRespuesta,
  iniciales,
  primerNombre,
  telefonoBonito,
  tiempoRelativo,
  type Canal,
  type ConversacionResumen,
  type Etapa,
  type Etiqueta,
  type Interes,
  type MotivoCierre,
} from "@/lib/admin/chats-tipos";
import { armarColumnas, FILTROS_VACIOS, origenesDisponibles, patchParaMover, type FiltrosEmbudo } from "@/lib/admin/embudo";
import { leerEmbudo, type DatosEmbudo } from "@/lib/admin/embudo-consulta";

const sinSuscripcion = () => () => {};

/** La hora relativa depende del reloj: se pinta ya hidratado para que no haya diferencia con el servidor. */
function useHidratado(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
}

const CANALES_FILTRO: { id: string; label: string }[] = [
  { id: "", label: "Todos" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "messenger", label: "Messenger" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "web", label: "Formularios y web" },
  { id: "comentarios", label: "Comentarios" },
];

function lineaInteres(c: ConversacionResumen): string | null {
  const p = c.cliente_perfil;
  const concreto = p?.moto ?? p?.vehiculo ?? p?.solicitud;
  if (concreto) return concreto;
  const interes = c.cliente_interes as Interes | null;
  return interes && interes in INTERES_LABEL ? INTERES_LABEL[interes] : null;
}

function vistaPrevia(c: ConversacionResumen): string {
  const t = (c.ultimo_contenido ?? "").replace(/\s+/g, " ").trim();
  return t || "Sin mensajes";
}

/* ---------- Tarjeta ---------- */

function Tarjeta({
  c,
  etiquetas,
  hidratado,
  arrastrando,
  onAbrir,
  onMover,
  onSoltar,
  onArrastrar,
}: {
  c: ConversacionResumen;
  etiquetas: Etiqueta[];
  hidratado: boolean;
  arrastrando: boolean;
  onAbrir: () => void;
  onMover: (destino: Etapa) => void;
  onArrastrar: (e: DragEvent<HTMLElement>) => void;
  onSoltar: () => void;
}) {
  const pendiente = esperaRespuesta(c) && c.estado !== "cerrada";
  const campana = campanaCorta(c.fuente);
  const interes = lineaInteres(c);
  const cerrada = c.etapa === "cerrado";
  return (
    <article
      draggable
      onDragStart={onArrastrar}
      onDragEnd={onSoltar}
      className={`group relative rounded-xl border bg-porcelain p-3 shadow-[0_1px_2px_rgba(10,15,26,0.04)] transition-[box-shadow,opacity,border-color] hover:border-line-strong hover:shadow-[0_6px_18px_-8px_rgba(10,15,26,0.25)] ${
        arrastrando ? "opacity-40" : ""
      } ${pendiente ? "border-redline/35" : "border-line"}`}
    >
      {pendiente && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-redline" />}
      <div className="flex items-start gap-2">
        <GripVertical size={14} aria-hidden className="mt-1 hidden shrink-0 cursor-grab text-line-strong group-hover:text-muted lg:block" />
        <CanalIcono canal={c.canal} leadAds={c.hilo_externo === HILO_LEAD_ADS} size={22} className="mt-0.5" />
        <button type="button" onClick={onAbrir} className="min-w-0 flex-1 rounded-md text-left">
          <span className={`block truncate text-[13.5px] ${pendiente ? "font-semibold" : "font-medium"}`}>{describirIdentidad(c)}</span>
          <span className="t-mono block truncate text-[10.5px] text-muted">
            {c.cliente_telefono ? telefonoBonito(c.cliente_telefono) : CANAL_LABEL[c.canal]}
          </span>
        </button>
        <span className={`t-mono mt-0.5 shrink-0 text-[10.5px] tabular-nums ${pendiente ? "text-redline" : "text-muted"}`}>
          {hidratado ? tiempoRelativo(c.actividad_at) : ""}
        </span>
        <Menu
          etiqueta={`Opciones de ${describirIdentidad(c)}`}
          soloIcono
          alinear="fin"
          ancho={230}
          claseBoton="-mr-1 -mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg-soft hover:text-ink aria-expanded:bg-bg-soft max-lg:size-10"
          boton={<Ellipsis size={16} aria-hidden />}
        >
          <MenuTitulo>Mover a</MenuTitulo>
          {ETAPAS.map((e) => (
            <MenuOpcion
              key={e}
              elegida={c.etapa === e}
              onElegir={() => onMover(e)}
              icono={<span aria-hidden className="size-2 rounded-full" style={{ background: ETAPA_TONO[e].punto }} />}
            >
              {ETAPA_LABEL[e]}
            </MenuOpcion>
          ))}
          <MenuSeparador />
          <MenuAccion icono={MessageSquareText} onElegir={onAbrir}>
            Abrir el chat
          </MenuAccion>
        </Menu>
      </div>

      <p className={`mt-2 line-clamp-2 text-xs leading-snug ${pendiente ? "text-ink" : "text-ink-soft"}`}>{vistaPrevia(c)}</p>

      {(interes || campana || etiquetas.length > 0 || (cerrada && c.motivo_cierre)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {cerrada && c.motivo_cierre && <MotivoInsignia motivo={c.motivo_cierre} />}
          {interes && <span className="max-w-full truncate rounded-full bg-bg-soft px-2 py-px text-[10.5px] font-medium text-ink-soft">{interes}</span>}
          {campana && (
            <span
              title={c.fuente ?? undefined}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/25 bg-accent-soft/60 px-2 py-px text-[10.5px] font-medium text-accent-deep"
            >
              <Megaphone size={10} aria-hidden className="shrink-0" />
              <span className="truncate">{campana}</span>
            </span>
          )}
          {etiquetas.slice(0, 2).map((e) => {
            const t = ETIQUETA_TONO[e.color] ?? ETIQUETA_TONO.slate;
            return (
              <span key={e.id} className="rounded-full px-2 py-px text-[10.5px] font-medium" style={{ background: t.fondo, color: t.texto }}>
                {e.nombre}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2">
        {c.asignada_nombre ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-soft" title={`Asignada a ${c.asignada_nombre}`}>
            <span aria-hidden className="t-display flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] text-white">
              {iniciales(c.asignada_nombre)}
            </span>
            <span className="truncate">{primerNombre(c.asignada_nombre)}</span>
          </span>
        ) : (
          <span className="text-[11.5px] text-muted">Sin asignar</span>
        )}
        <span className="t-mono shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted">
          {c.estado === "escalada" ? "Persona" : c.estado === "cerrada" ? "Cerrada" : "Bot"}
        </span>
      </div>
    </article>
  );
}

function MotivoInsignia({ motivo }: { motivo: MotivoCierre }) {
  const Icono = motivo === "ganado" ? CircleCheck : motivo === "perdido" ? CircleX : Minus;
  const clase =
    motivo === "ganado" ? "bg-signal/10 text-signal-ink" : motivo === "perdido" ? "bg-redline/10 text-redline" : "bg-bg-soft text-ink-soft";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[10.5px] font-medium ${clase}`}>
      <Icono size={11} aria-hidden />
      {MOTIVO_CIERRE_LABEL[motivo]}
    </span>
  );
}

/* ---------- Tablero ---------- */

export default function Embudo({
  usuarioId,
  inicial,
  soloMias = false,
}: {
  usuarioId: string;
  inicial: DatosEmbudo;
  /** Un vendedor entra viendo sus propias conversaciones. */
  soloMias?: boolean;
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const { abrirConversacion } = useAvisos();
  const hidratado = useHidratado();

  const [datos, setDatos] = useState<DatosEmbudo>(inicial);
  const [filtros, setFiltros] = useState<FiltrosEmbudo>(soloMias ? { ...FILTROS_VACIOS, vendedor: "mias" } : FILTROS_VACIOS);
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [columnaSobre, setColumnaSobre] = useState<Etapa | null>(null);
  const [cierre, setCierre] = useState<{ id: string; motivo: MotivoCierre } | null>(null);
  const [guardando, setGuardando] = useState(false);

  /* --- Tiempo real: cualquier cambio vuelve a leer el tablero, con 400 ms de espera --- */
  const montada = useRef(false);
  const turno = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moviendo = useRef(0);

  const recargar = useCallback(async () => {
    const mio = ++turno.current;
    const { datos: nuevos, error } = await leerEmbudo(supabase);
    if (!montada.current || mio !== turno.current) return;
    // No pisar una tarjeta que se está moviendo: el guardado en curso termina con su propia recarga.
    if (moviendo.current > 0) return;
    if (error) {
      toast.error("No se pudo actualizar el embudo.", { id: "embudo-recarga" });
      return;
    }
    setDatos(nuevos);
  }, [supabase]);

  useEffect(() => {
    montada.current = true;
    const programar = () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        temporizador.current = null;
        void recargar();
      }, 400);
    };
    const sufijo = Math.random().toString(36).slice(2, 8);
    const canal = supabase
      .channel(`embudo-${sufijo}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversaciones" }, programar)
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes" }, programar)
      .on("postgres_changes", { event: "*", schema: "public", table: "cliente_etiquetas" }, programar)
      .subscribe((estado) => {
        if (estado === "SUBSCRIBED") programar();
      });
    const alVolver = () => {
      if (document.visibilityState === "visible") programar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      montada.current = false;
      document.removeEventListener("visibilitychange", alVolver);
      void supabase.removeChannel(canal);
    };
  }, [supabase, recargar]);

  /* --- Derivados --- */
  const etiquetasPorCliente = useMemo(() => {
    const porId = new Map(datos.etiquetas.map((e) => [e.id, e]));
    const mapa = new Map<string, Etiqueta[]>();
    for (const rel of datos.clienteEtiquetas) {
      const e = porId.get(rel.etiqueta_id);
      if (!e) continue;
      const lista = mapa.get(rel.cliente_id);
      if (lista) lista.push(e);
      else mapa.set(rel.cliente_id, [e]);
    }
    return mapa;
  }, [datos.etiquetas, datos.clienteEtiquetas]);

  const columnas = useMemo(() => armarColumnas(datos.conversaciones, filtros, usuarioId), [datos.conversaciones, filtros, usuarioId]);
  const origenes = useMemo(() => origenesDisponibles(datos.conversaciones), [datos.conversaciones]);
  const abiertas = columnas.filter((c) => c.etapa !== "cerrado").reduce((n, c) => n + c.conversaciones.length, 0);
  const sinResponder = columnas.reduce((n, c) => n + c.sinResponder, 0);
  const hayFiltros = filtros.vendedor !== "" || filtros.canal !== "" || filtros.origen !== "" || filtros.busqueda.trim() !== "";

  /* --- Mover una tarjeta --- */
  const guardarMovimiento = useCallback(
    async (id: string, destino: Etapa, motivo?: MotivoCierre) => {
      const actual = datos.conversaciones.find((c) => c.id === id);
      if (!actual) return;
      const patch = patchParaMover(actual, destino, motivo);
      if (!patch) return;

      // Se pinta al instante; si la base lo rechaza, vuelve a como estaba.
      const antes = actual;
      setDatos((d) => ({
        ...d,
        conversaciones: d.conversaciones.map((c) => (c.id === id ? { ...c, ...patch, motivo_cierre: patch.motivo_cierre ?? null } : c)),
      }));
      moviendo.current += 1;
      setGuardando(true);
      // RLS no lanza error: si no devuelve filas, no se actualizó nada.
      const { data, error } = await supabase.from("conversaciones").update(patch).eq("id", id).select("id");
      moviendo.current -= 1;
      setGuardando(false);
      if (error?.code === "23505") {
        setDatos((d) => ({ ...d, conversaciones: d.conversaciones.map((c) => (c.id === id ? antes : c)) }));
        toast.error("Este contacto ya tiene otra conversación abierta.");
        return;
      }
      if (error || !data?.length) {
        setDatos((d) => ({ ...d, conversaciones: d.conversaciones.map((c) => (c.id === id ? antes : c)) }));
        toast.error("No se pudo mover la conversación.");
        return;
      }
      toast.success(destino === "cerrado" ? "Conversación cerrada" : `Movida a «${ETAPA_LABEL[destino]}»`);
      void recargar();
    },
    [datos.conversaciones, supabase, recargar],
  );

  const pedirMover = useCallback(
    (id: string, destino: Etapa) => {
      const c = datos.conversaciones.find((x) => x.id === id);
      if (!c || c.etapa === destino) return;
      // Cerrar pide el motivo: es lo que después alimenta «ganadas» y «perdidas».
      if (destino === "cerrado") setCierre({ id, motivo: "otro" });
      else void guardarMovimiento(id, destino);
    },
    [datos.conversaciones, guardarMovimiento],
  );

  function soltarEn(e: DragEvent<HTMLElement>, etapa: Etapa) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || arrastrandoId;
    setColumnaSobre(null);
    setArrastrandoId(null);
    if (id) pedirMover(id, etapa);
  }

  const vendedores = [
    { id: "", label: "Todos", icono: <Users size={16} strokeWidth={1.9} aria-hidden /> },
    { id: "mias", label: "Mías" },
    { id: "sin_asignar", label: "Sin asignar" },
    ...datos.staff.filter((s) => s.user_id !== usuarioId).map((s) => ({ id: s.user_id, label: s.nombre })),
  ];
  const opcionesOrigen = [
    { id: "", label: "Todos", icono: <Layers size={16} strokeWidth={1.9} aria-hidden /> },
    { id: "campana", label: "Solo campañas", icono: <Megaphone size={16} strokeWidth={1.9} aria-hidden /> },
    ...origenes.map((o) => ({ id: o, label: o })),
  ];
  const opcionesCanal = CANALES_FILTRO.map((o) => ({
    ...o,
    icono:
      o.id === "" ? (
        <Layers size={16} strokeWidth={1.9} aria-hidden />
      ) : o.id === "comentarios" ? (
        <MessageSquareText size={16} strokeWidth={1.9} aria-hidden />
      ) : (
        <CanalIcono canal={o.id as Canal} size={16} />
      ),
  }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            aria-label="Buscar en el embudo"
            value={filtros.busqueda}
            onChange={(e) => setFiltros((f) => ({ ...f, busqueda: e.target.value }))}
            placeholder="Buscar nombre, teléfono o mensaje…"
            className="admin-input h-9 !py-0 !pl-9 max-lg:h-11 max-lg:!text-base"
          />
        </div>
        <FiltroDesplegable
          nombre="Vendedor"
          icono={<Users size={15} aria-hidden />}
          opciones={vendedores}
          valor={filtros.vendedor}
          onCambiar={(id) => setFiltros((f) => ({ ...f, vendedor: id }))}
        />
        <FiltroDesplegable
          nombre="Origen"
          icono={<Megaphone size={15} aria-hidden />}
          opciones={opcionesOrigen}
          valor={filtros.origen}
          onCambiar={(id) => setFiltros((f) => ({ ...f, origen: id }))}
        />
        <FiltroDesplegable
          nombre="Canal"
          icono={<Layers size={15} aria-hidden />}
          opciones={opcionesCanal}
          valor={filtros.canal}
          onCambiar={(id) => setFiltros((f) => ({ ...f, canal: id }))}
        />
        {hayFiltros && (
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_VACIOS)}
            className="inline-flex h-9 items-center gap-1.5 px-2.5 text-[13px] text-muted transition-colors hover:text-ink max-lg:h-11"
          >
            <X size={14} aria-hidden />
            Limpiar
          </button>
        )}
        <p className="t-mono ml-auto text-[11.5px] text-muted" aria-live="polite">
          {abiertas} abiertas · <span className={sinResponder > 0 ? "font-semibold text-redline" : ""}>{sinResponder} sin responder</span>
          {guardando ? " · guardando…" : ""}
        </p>
      </div>

      {/* El tablero se desliza de lado; en celular cada columna se «engancha» al deslizar. */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8 max-lg:snap-x max-lg:snap-mandatory" role="group" aria-label="Embudo comercial">
        {columnas.map((col) => {
          const tono = ETAPA_TONO[col.etapa];
          const sobre = columnaSobre === col.etapa && arrastrandoId !== null;
          return (
            <section
              key={col.etapa}
              aria-label={`${ETAPA_LABEL[col.etapa]}, ${col.conversaciones.length} conversaciones`}
              onDragOver={(e) => {
                if (!arrastrandoId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (columnaSobre !== col.etapa) setColumnaSobre(col.etapa);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setColumnaSobre((s) => (s === col.etapa ? null : s));
              }}
              onDrop={(e) => soltarEn(e, col.etapa)}
              className={`flex w-[min(300px,82vw)] shrink-0 flex-col rounded-2xl border bg-bg-soft/50 transition-colors max-lg:snap-start ${
                sobre ? "border-accent bg-accent-soft/60" : "border-line"
              }`}
            >
              <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: tono.punto }} />
                <h2 className="t-display min-w-0 flex-1 truncate text-[17px] font-bold uppercase leading-none">{ETAPA_LABEL[col.etapa]}</h2>
                {col.sinResponder > 0 && (
                  <span
                    title={`${col.sinResponder} esperando respuesta`}
                    className="t-mono rounded-full bg-redline px-1.5 text-[10.5px] font-semibold leading-[18px] text-white tabular-nums"
                  >
                    {col.sinResponder}
                  </span>
                )}
                <span className="t-mono rounded-full bg-porcelain px-2 text-[11px] font-medium leading-[20px] text-ink-soft tabular-nums">
                  {col.conversaciones.length}
                </span>
              </header>
              <div className="flex max-h-[calc(100dvh-16.5rem)] min-h-[160px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 max-lg:max-h-[calc(100dvh-14rem)]">
                {col.conversaciones.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong px-3 py-8 text-center text-xs text-muted">
                    <Inbox size={18} strokeWidth={1.6} aria-hidden />
                    {arrastrandoId ? "Suelta aquí" : col.etapa === "cerrado" ? "Sin cierres en los últimos 30 días" : "Sin conversaciones"}
                  </div>
                ) : (
                  col.conversaciones.map((c) => (
                    <Tarjeta
                      key={c.id}
                      c={c}
                      etiquetas={etiquetasPorCliente.get(c.cliente_id) ?? []}
                      hidratado={hidratado}
                      arrastrando={arrastrandoId === c.id}
                      onAbrir={() => abrirConversacion(c.id)}
                      onMover={(destino) => pedirMover(c.id, destino)}
                      onArrastrar={(e) => {
                        e.dataTransfer.setData("text/plain", c.id);
                        e.dataTransfer.effectAllowed = "move";
                        setArrastrandoId(c.id);
                      }}
                      onSoltar={() => {
                        setArrastrandoId(null);
                        setColumnaSobre(null);
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <CierreDialogo
        cierre={cierre}
        onCambiarMotivo={(motivo) => setCierre((c) => (c ? { ...c, motivo } : c))}
        onCerrar={() => setCierre(null)}
        onConfirmar={() => {
          if (!cierre) return;
          const { id, motivo } = cierre;
          setCierre(null);
          void guardarMovimiento(id, "cerrado", motivo);
        }}
      />
    </div>
  );
}

function CierreDialogo({
  cierre,
  onCambiarMotivo,
  onCerrar,
  onConfirmar,
}: {
  cierre: { id: string; motivo: MotivoCierre } | null;
  onCambiarMotivo: (m: MotivoCierre) => void;
  onCerrar: () => void;
  onConfirmar: () => void;
}): ReactNode {
  return (
    <DialogShell
      abierto={cierre !== null}
      onCerrar={onCerrar}
      titulo="Cerrar la conversación"
      descripcion="El bot deja de responder aquí. Si el contacto vuelve a escribir, se abre una conversación nueva."
      ancho="460px"
      pie={
        <>
          <button type="button" onClick={onCerrar} className="admin-btn ghost min-h-11">
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} className="admin-btn min-h-11">
            Cerrar conversación
          </button>
        </>
      }
    >
      <span className="admin-label">Motivo del cierre</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivo del cierre">
        {MOTIVOS_CIERRE.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={cierre?.motivo === m}
            onClick={() => onCambiarMotivo(m)}
            className={`min-h-11 rounded-full border px-4 text-[13px] font-medium transition-colors ${
              cierre?.motivo === m ? "border-ink bg-ink text-white" : "border-line bg-porcelain text-ink-soft hover:border-line-strong hover:text-ink"
            }`}
          >
            {MOTIVO_CIERRE_LABEL[m]}
          </button>
        ))}
      </div>
    </DialogShell>
  );
}
