"use client";

import { useState, useSyncExternalStore } from "react";
import { Inbox, Megaphone } from "lucide-react";
import {
  ETAPA_LABEL,
  HILO_LEAD_ADS,
  campanaCorta,
  describirIdentidad,
  esperaRespuesta,
  iniciales,
  tiempoRelativo,
  type ConversacionResumen,
  type Etapa,
  type Etiqueta,
} from "@/lib/admin/chats-tipos";
import CanalIcono from "./CanalIcono";

/** Tono de cada etapa: fondo y texto de la insignia, y el punto que la acompaña en menús y métricas. */
export const ETAPA_TONO: Record<Etapa, { fondo: string; texto: string; punto: string }> = {
  nuevo: { fondo: "rgba(10,15,26,0.06)", texto: "#364152", punto: "#8a96a8" },
  en_atencion: { fondo: "rgba(43,80,236,0.10)", texto: "#1b37b3", punto: "#2b50ec" },
  calificado: { fondo: "rgba(124,58,237,0.10)", texto: "#5b21b6", punto: "#7c3aed" },
  agendado: { fondo: "rgba(14,159,90,0.12)", texto: "#0a6b3d", punto: "#0e9f5a" },
  propuesta: { fondo: "rgba(242,165,22,0.18)", texto: "#8a5a00", punto: "#f2a516" },
  cerrado: { fondo: "rgba(10,15,26,0.05)", texto: "#5f6b7d", punto: "#c2cad6" },
};

export const ETIQUETA_TONO: Record<string, { fondo: string; texto: string }> = {
  slate: { fondo: "rgba(10,15,26,0.06)", texto: "#364152" },
  rose: { fondo: "rgba(225,29,72,0.10)", texto: "#9f1239" },
  amber: { fondo: "rgba(242,165,22,0.18)", texto: "#8a5a00" },
  emerald: { fondo: "rgba(14,159,90,0.12)", texto: "#0a6b3d" },
  sky: { fondo: "rgba(14,116,224,0.10)", texto: "#0b5aa8" },
  violet: { fondo: "rgba(124,58,237,0.10)", texto: "#5b21b6" },
};

function Avatar({ conv }: { conv: ConversacionResumen }) {
  const [fallo, setFallo] = useState(false);
  const nombre = describirIdentidad(conv);
  return (
    <div className="relative size-10 shrink-0">
      {conv.identidad_foto && !fallo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={conv.identidad_foto} alt="" className="size-10 rounded-full object-cover" onError={() => setFallo(true)} />
      ) : (
        <div className="t-display flex size-10 items-center justify-center rounded-full bg-bg-soft text-[15px] text-ink-soft">
          {iniciales(nombre)}
        </div>
      )}
      <CanalIcono
        canal={conv.canal}
        leadAds={conv.hilo_externo === HILO_LEAD_ADS}
        size={17}
        className="absolute -bottom-1 -right-1 ring-2 ring-porcelain"
      />
    </div>
  );
}

const sinSuscripcion = () => () => {};

/**
 * La hora relativa ("4 min") depende del reloj: entre el render del servidor
 * y la hidratación puede cruzarse un minuto y el texto ya no coincide. Se
 * pinta recién con la lista hidratada.
 */
function useHidratado(): boolean {
  return useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
}

function previewTexto(c: ConversacionResumen): string {
  const contenido = c.ultimo_contenido ?? "Sin mensajes";
  if (c.origen === "comentario" && c.ultimo_tipo === "comentario") return `comentó: ${contenido}`;
  return contenido;
}

function quienAtiende(c: ConversacionResumen): string {
  if (c.origen === "comentario") return "Comentario";
  if (c.origen === "formulario") return c.hilo_externo === HILO_LEAD_ADS ? "Formulario de anuncio" : "Formulario web";
  if (c.estado === "cerrada") return "Cerrada";
  return c.estado === "escalada" ? "Persona" : "Bot";
}

export default function ListaConversaciones({
  conversaciones,
  etiquetasPorCliente,
  seleccionadaId,
  onSeleccionar,
  cargando,
  className = "",
}: {
  conversaciones: ConversacionResumen[];
  etiquetasPorCliente: Map<string, Etiqueta[]>;
  seleccionadaId: string | null;
  onSeleccionar: (id: string) => void;
  cargando: boolean;
  className?: string;
}) {
  const hidratado = useHidratado();
  if (cargando) {
    return (
      <div className={`flex flex-col gap-2 p-4 ${className}`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-bg-soft" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    );
  }
  if (conversaciones.length === 0) {
    return (
      <div className={`flex flex-col items-center gap-2 px-5 py-16 text-center text-sm text-muted ${className}`}>
        <Inbox size={22} strokeWidth={1.6} aria-hidden />
        No hay conversaciones en este filtro.
      </div>
    );
  }

  return (
    <ul className={className}>
      {conversaciones.map((c) => {
        const activa = c.id === seleccionadaId;
        const pendiente = esperaRespuesta(c);
        const etiquetas = etiquetasPorCliente.get(c.cliente_id) ?? [];
        const tono = ETAPA_TONO[c.etapa] ?? ETAPA_TONO.nuevo;
        const campana = campanaCorta(c.fuente);
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSeleccionar(c.id)}
              aria-current={activa ? "true" : undefined}
              className={`flex w-full gap-3 rounded-none border-b border-line px-4 py-3 text-left transition-colors ${
                activa ? "bg-accent-soft/70 shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-bg-soft/60"
              }`}
            >
              <Avatar conv={c} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[13.5px] ${pendiente ? "font-semibold text-ink" : "text-ink"}`}>{describirIdentidad(c)}</span>
                  <span className={`t-mono shrink-0 text-[10.5px] tabular-nums ${pendiente ? "text-redline" : "text-muted"}`}>
                    {hidratado ? tiempoRelativo(c.actividad_at) : ""}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="t-mono shrink-0 text-[9.5px] uppercase tracking-[0.12em] text-muted">{quienAtiende(c)}</span>
                  <p className={`truncate text-xs ${pendiente ? "text-ink" : "text-ink-soft"}`}>{previewTexto(c)}</p>
                  {pendiente && <span aria-label="Sin responder" className="ml-auto size-2 shrink-0 rounded-full bg-redline" />}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-px text-[10.5px] font-medium"
                    style={{ background: tono.fondo, color: tono.texto }}
                  >
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: tono.punto }} />
                    {ETAPA_LABEL[c.etapa]}
                  </span>
                  {campana && (
                    <span
                      title={c.fuente ?? undefined}
                      className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-soft/60 px-2 py-px text-[10.5px] font-medium text-accent-deep"
                    >
                      <Megaphone size={11} aria-hidden />
                      {campana}
                    </span>
                  )}
                  {c.asignada_nombre && (
                    <span
                      title={`Asignada a ${c.asignada_nombre}`}
                      className="flex size-4 items-center justify-center rounded-full bg-ink text-[9px] font-semibold text-porcelain"
                    >
                      {iniciales(c.asignada_nombre)}
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
                  {etiquetas.length > 2 && <span className="text-[10px] text-muted">+{etiquetas.length - 2}</span>}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
