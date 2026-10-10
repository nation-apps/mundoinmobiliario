"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Inbox } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useAvisos } from "@/components/admin/chats/Avisos";
import CanalIcono from "@/components/admin/chats/CanalIcono";
import { Menu, MenuAccion, MenuSeparador, MenuTitulo, useCerrarMenu } from "@/components/admin/Menu";
import {
  HILO_LEAD_ADS,
  RUTA_CHATS_PANEL,
  describirIdentidad,
  tiempoRelativo,
  type ConversacionResumen,
} from "@/lib/admin/chats-tipos";

/** Cuántas conversaciones en espera muestra el menú (las más recientes). */
const MAXIMO = 8;

/**
 * Campana del menú lateral: cuántos chats esperan respuesta y, al abrirla,
 * cuáles son. La lista se pide recién al abrir; el número viene de los avisos
 * en vivo (mismo criterio: lo último lo escribió el cliente y no está cerrada).
 */
export default function Pendientes({ claro = false }: { claro?: boolean }) {
  const { sinResponder } = useAvisos();
  const etiqueta = sinResponder === 1 ? "1 chat sin responder" : `${sinResponder} chats sin responder`;
  return (
    <Menu
      etiqueta={etiqueta}
      soloIcono
      titulo={etiqueta}
      alinear="inicio"
      ancho={340}
      claseBoton={`relative inline-flex size-9 shrink-0 items-center justify-center transition-colors max-lg:size-11 ${
        claro
          ? "text-ink-soft hover:bg-bg-soft hover:text-ink aria-expanded:bg-bg-soft"
          : "text-white/65 hover:bg-white/[0.07] hover:text-white aria-expanded:bg-white/[0.09] aria-expanded:text-white"
      }`}
      boton={
        <>
          <Bell size={18} strokeWidth={1.9} aria-hidden />
          {sinResponder > 0 && (
            <span
              aria-hidden
              className="t-mono absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-redline px-1 text-[10px] font-semibold leading-none text-white tabular-nums"
            >
              {sinResponder > 99 ? "99+" : sinResponder}
            </span>
          )}
        </>
      }
    >
      <ListaPendientes total={sinResponder} />
    </Menu>
  );
}

function ListaPendientes({ total }: { total: number }) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();
  const cerrar = useCerrarMenu();
  const { abrirConversacion } = useAvisos();
  const [filas, setFilas] = useState<ConversacionResumen[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vigente = true;
    supabase
      .from("conversaciones_resumen")
      .select("*")
      .eq("ultimo_rol", "user")
      .neq("estado", "cerrada")
      .order("ultimo_mensaje_at", { ascending: false })
      .limit(MAXIMO)
      .then(({ data, error: err }) => {
        if (!vigente) return;
        if (err) setError(true);
        setFilas((data ?? []) as ConversacionResumen[]);
      });
    return () => {
      vigente = false;
    };
  }, [supabase]);

  return (
    <>
      <MenuTitulo>Sin responder · {total}</MenuTitulo>
      {filas === null ? (
        <div className="flex flex-col gap-1.5 p-1.5" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-md bg-bg-soft" />
          ))}
        </div>
      ) : error ? (
        <p className="px-2.5 py-3 text-[13px] text-muted">No se pudo leer la lista. Ábrela desde Chats.</p>
      ) : filas.length === 0 ? (
        <p className="flex items-center gap-2 px-2.5 py-3 text-[13px] text-muted">
          <Inbox size={16} aria-hidden /> Nadie está esperando respuesta.
        </p>
      ) : (
        filas.map((c) => (
          <button
            key={c.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              cerrar();
              abrirConversacion(c.id);
            }}
            className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left outline-none transition-colors hover:bg-bg-soft focus-visible:bg-bg-soft focus-visible:outline-none"
          >
            <CanalIcono canal={c.canal} leadAds={c.hilo_externo === HILO_LEAD_ADS} size={22} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-ink">{describirIdentidad(c)}</span>
                <span className="t-mono shrink-0 text-[10.5px] text-muted">{tiempoRelativo(c.ultimo_mensaje_at)}</span>
              </span>
              <span className="block truncate text-xs text-ink-soft">{c.ultimo_contenido ?? "Sin mensajes"}</span>
            </span>
          </button>
        ))
      )}
      <MenuSeparador />
      <MenuAccion icono={Inbox} onElegir={() => router.push(RUTA_CHATS_PANEL)}>
        Abrir la bandeja de chats
      </MenuAccion>
    </>
  );
}
