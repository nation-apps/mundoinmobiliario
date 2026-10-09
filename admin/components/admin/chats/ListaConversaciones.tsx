"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ETAPA_LABEL,
  HILO_LEAD_ADS,
  campanaCorta,
  describirIdentidad,
  esperaRespuesta,
  iniciales,
  tiempoRelativo,
  type ConversacionResumen,
  type Etiqueta,
} from "@/lib/admin/chats-tipos";
import CanalIcono from "./CanalIcono";

const ETAPA_TONO: Record<string, { fondo: string; texto: string }> = {
  nuevo: { fondo: "rgba(29,19,21,0.06)", texto: "#4a3a3c" },
  en_atencion: { fondo: "rgba(176,141,87,0.18)", texto: "#6e5630" },
  calificado: { fondo: "rgba(166,57,80,0.12)", texto: "#7c2438" },
  agendado: { fondo: "rgba(12,163,12,0.10)", texto: "#0a7d0a" },
  propuesta: { fondo: "rgba(250,178,25,0.16)", texto: "#8a6200" },
  cerrado: { fondo: "rgba(29,19,21,0.05)", texto: "#8d7b76" },
};

export const ETIQUETA_TONO: Record<string, { fondo: string; texto: string }> = {
  slate: { fondo: "rgba(29,19,21,0.06)", texto: "#4a3a3c" },
  rose: { fondo: "rgba(166,57,80,0.12)", texto: "#7c2438" },
  amber: { fondo: "rgba(250,178,25,0.16)", texto: "#8a6200" },
  emerald: { fondo: "rgba(12,163,12,0.10)", texto: "#0a7d0a" },
  sky: { fondo: "rgba(0,132,255,0.10)", texto: "#0b5aa8" },
  violet: { fondo: "rgba(124,36,56,0.10)", texto: "#5a2a4a" },
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
        <div className="t-display flex size-10 items-center justify-center rounded-full bg-bg-soft text-sm text-ink-soft">
          {iniciales(nombre)}
        </div>
      )}
      <CanalIcono canal={conv.canal} size={15} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-porcelain" />
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
          <div key={i} className="h-16 animate-pulse bg-bg-soft" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    );
  }
  if (conversaciones.length === 0) {
    return <p className={`px-5 py-16 text-center text-sm text-muted ${className}`}>No hay conversaciones en este filtro.</p>;
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
              className={`flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-bg-soft/60 ${
                activa ? "bg-bg-soft" : ""
              }`}
            >
              <Avatar conv={c} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${pendiente ? "font-semibold text-ink" : "text-ink"}`}>{describirIdentidad(c)}</span>
                  <span className="shrink-0 text-[11px] text-muted">{hidratado ? tiempoRelativo(c.actividad_at) : ""}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted">{quienAtiende(c)}</span>
                  <p className={`truncate text-xs ${pendiente ? "text-ink" : "text-ink-soft"}`}>{previewTexto(c)}</p>
                  {pendiente && <span aria-label="Sin responder" className="ml-auto size-2 shrink-0 rounded-full bg-accent" />}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span
                    className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                    style={{ background: tono.fondo, color: tono.texto }}
                  >
                    {ETAPA_LABEL[c.etapa]}
                  </span>
                  {campana && (
                    <span title={c.fuente ?? undefined} className="border border-accent/40 px-1.5 py-0.5 text-[10px] font-medium text-accent">
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
                      <span key={e.id} className="px-1.5 py-0.5 text-[10px] font-medium" style={{ background: t.fondo, color: t.texto }}>
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
