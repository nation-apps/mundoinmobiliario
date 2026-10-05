"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  AVISOS_STORAGE_KEY,
  BANDEJA_STORAGE_KEY,
  CANAL_LABEL,
  CHAT_QUERY_PARAM,
  RUTA_CHATS_APP,
  RUTA_CHATS_PANEL,
  telefonoBonito,
  type AvisosApi,
  type ConversacionResumen,
  type DestinoAvisos,
  type EventoConversacion,
  type Mensaje,
} from "@/lib/admin/chats-tipos";

/* ---------------------------------------------------------------------
   Preferencia "avisos activados" (localStorage)

   Se lee con useSyncExternalStore: el servidor y la hidratación ven
   `false` y recién después el navegador entrega el valor guardado, así
   no hay mismatch de hidratación. De paso, si el staff tiene el panel en
   dos pestañas, prender los avisos en una se refleja en la otra.
   --------------------------------------------------------------------- */

const oyentesAvisos = new Set<() => void>();
/** Lo que vale la preferencia cuando localStorage no está disponible (modo privado, etc.). */
let respaldoAvisos = false;

function leerAvisosActivos(): boolean {
  try {
    const guardado = localStorage.getItem(AVISOS_STORAGE_KEY);
    return guardado === null ? respaldoAvisos : guardado === "1";
  } catch {
    return respaldoAvisos;
  }
}

function guardarAvisosActivos(activos: boolean) {
  respaldoAvisos = activos;
  try {
    localStorage.setItem(AVISOS_STORAGE_KEY, activos ? "1" : "0");
  } catch {
    // Sin localStorage la preferencia no sobrevive a una recarga, pero la sesión actual sigue funcionando.
  }
  oyentesAvisos.forEach((avisar) => avisar());
}

function suscribirAvisosActivos(avisar: () => void) {
  oyentesAvisos.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    oyentesAvisos.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

function avisosActivosEnServidor(): boolean {
  return false;
}

/* ---------------------------------------------------------------------
   Utilidades
   --------------------------------------------------------------------- */

/**
 * Mismo storage que la bandeja: así el aviso sabe si el mensaje que acaba
 * de llegar es justo el de la conversación que el staff ya tiene abierta.
 */
function conversacionAbiertaId(): string | null {
  try {
    const crudo = localStorage.getItem(BANDEJA_STORAGE_KEY);
    if (!crudo) return null;
    const guardado = JSON.parse(crudo) as { seleccionadaId?: unknown };
    return typeof guardado.seleccionadaId === "string" ? guardado.seleccionadaId : null;
  } catch {
    return null;
  }
}

/** Beep corto de dos tonos con Web Audio: sin archivos de audio que mantener. */
function reproducirSonido() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const ahora = ctx.currentTime;
    for (const [inicio, freq] of [
      [0, 740],
      [0.09, 990],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, ahora + inicio);
      gain.gain.exponentialRampToValueAtTime(0.15, ahora + inicio + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ahora + inicio + 0.08);
      osc.start(ahora + inicio);
      osc.stop(ahora + inicio + 0.09);
    }
    setTimeout(() => void ctx.close(), 400);
  } catch {
    // Web Audio puede fallar (política de autoplay, navegador viejo): un aviso sin sonido no es grave.
  }
}

type DatosAviso = Pick<
  ConversacionResumen,
  "canal" | "origen" | "cliente_nombre" | "identidad_nombre" | "identidad_username" | "cliente_telefono"
>;

/** Mismo orden que `describirIdentidad`, pero tolera que la consulta no haya traído nada. */
function nombreParaAviso(datos: DatosAviso | null): string {
  if (!datos) return "Alguien";
  if (datos.cliente_nombre?.trim()) return datos.cliente_nombre.trim();
  if (datos.identidad_nombre?.trim()) return datos.identidad_nombre.trim();
  if (datos.identidad_username) return `@${datos.identidad_username}`;
  if (datos.cliente_telefono) return telefonoBonito(datos.cliente_telefono);
  return "Alguien";
}

const MEDIA_TEXTO: Record<NonNullable<Mensaje["media_type"]>, string> = {
  image: "Envió una imagen",
  video: "Envió un video",
  audio: "Envió un audio",
  document: "Envió un documento",
};

function recortar(texto: string, max = 140): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

function vistaPrevia(mensaje: Mensaje, datos: DatosAviso | null): string {
  const contenido = recortar(mensaje.contenido ?? "");
  if (!contenido) return mensaje.media_type ? MEDIA_TEXTO[mensaje.media_type] : "Mensaje nuevo";
  if (mensaje.tipo === "comentario") return `Comentó: ${contenido}`;
  if (datos?.origen === "formulario") return `Dejó el formulario: ${contenido}`;
  return contenido;
}

/* ---------------------------------------------------------------------
   Provider
   --------------------------------------------------------------------- */

const AvisosContext = createContext<AvisosApi | null>(null);

/**
 * Se monta una sola vez por layout (`/admin` con destino "panel", `/app`
 * con destino "app"). El contador de "sin responder" siempre está activo
 * (es solo informativo); toast + Notification + sonido requieren que el
 * staff los prenda con "Activar avisos": pedir permiso de notificaciones
 * sin que lo pidan primero suele terminar bloqueado por el navegador.
 *
 * No toca `document.title`: lo administra la Metadata API de Next.
 */
export function AvisosProvider({
  children,
  usuarioId,
  destino,
}: {
  children: ReactNode;
  usuarioId: string;
  destino: DestinoAvisos;
}) {
  const router = useRouter();
  const [sinResponder, setSinResponder] = useState(0);
  const avisosActivos = useSyncExternalStore(
    suscribirAvisosActivos,
    leerAvisosActivos,
    avisosActivosEnServidor,
  );

  const rutaChats = destino === "app" ? RUTA_CHATS_APP : RUTA_CHATS_PANEL;

  const abrirConversacion = useCallback(
    (conversacionId: string) => {
      router.push(`${rutaChats}?${CHAT_QUERY_PARAM}=${encodeURIComponent(conversacionId)}`);
    },
    [router, rutaChats],
  );

  // El canal de realtime se arma una sola vez: lo que cambia entre renders
  // (quién soy, a dónde navegar) se lee de refs al momento del evento.
  const usuarioIdRef = useRef(usuarioId);
  const rutaChatsRef = useRef(rutaChats);
  const abrirRef = useRef(abrirConversacion);
  useEffect(() => {
    usuarioIdRef.current = usuarioId;
    rutaChatsRef.current = rutaChats;
    abrirRef.current = abrirConversacion;
  }, [usuarioId, rutaChats, abrirConversacion]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let activo = true;

    async function recalcular() {
      const { count, error } = await supabase
        .from("conversaciones_resumen")
        .select("id", { count: "exact", head: true })
        .eq("ultimo_rol", "user")
        .neq("estado", "cerrada");
      if (activo && !error) setSinResponder(count ?? 0);
    }
    void recalcular();

    function enRutaDeChats(): boolean {
      return window.location.pathname === rutaChatsRef.current;
    }

    async function avisarMensaje(mensaje: Mensaje) {
      if (mensaje.rol !== "user" || mensaje.tipo === "nota") return;

      // El staff ya tiene esta conversación abierta y la pestaña está a la
      // vista: no hace falta interrumpir, el mensaje ya aparece en el hilo.
      if (
        document.visibilityState === "visible" &&
        enRutaDeChats() &&
        conversacionAbiertaId() === mensaje.conversacion_id
      ) {
        return;
      }

      const { data } = await supabase
        .from("conversaciones_resumen")
        .select("canal, origen, cliente_nombre, identidad_nombre, identidad_username, cliente_telefono")
        .eq("id", mensaje.conversacion_id)
        .maybeSingle<DatosAviso>();
      if (!activo) return;

      const nombre = nombreParaAviso(data);
      const canalTexto = data ? CANAL_LABEL[data.canal] : "un canal";
      const preview = vistaPrevia(mensaje, data);
      const abrir = () => abrirRef.current(mensaje.conversacion_id);

      toast.message(`${nombre} · ${canalTexto}`, {
        description: preview,
        action: { label: "Abrir", onClick: abrir },
      });
      reproducirSonido();

      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        (document.visibilityState === "hidden" || !enRutaDeChats())
      ) {
        try {
          const notif = new Notification(`${nombre} (${canalTexto})`, { body: preview });
          notif.onclick = () => {
            window.focus();
            abrir();
          };
        } catch {
          // Chrome en Android solo permite notificaciones desde un service worker: el toast ya avisó.
        }
      }
    }

    // El evento "documento" no avisa por su cuenta: el bot guarda cada foto o
    // archivo como un mensaje del contacto ("[Imagen]", "[Documento: …]") y
    // ese INSERT ya pasó por avisarMensaje, con nombre, canal y el filtro de
    // conversación abierta. Avisar también aquí duplicaba toast y sonido.
    function avisarEvento(evento: EventoConversacion) {
      const mio = usuarioIdRef.current;
      const accion = { label: "Abrir", onClick: () => abrirRef.current(evento.conversacion_id) };

      if (evento.tipo === "asignacion") {
        // El trigger de auditoría guarda como actor a quien hizo el cambio:
        // asignarse a uno mismo desde la ficha no debe avisar "te asignaron".
        const detalle = evento.detalle as { a?: string | null } | null;
        if (!mio || detalle?.a !== mio || evento.actor_id === mio) return;
        toast.message("Te asignaron una conversación", { action: accion });
        reproducirSonido();
      } else if (evento.tipo === "escalada") {
        // Relevante para cualquiera en línea: todavía no tiene dueño.
        toast.message("Un contacto pidió hablar con una persona", { action: accion });
        reproducirSonido();
      }
    }

    // Sufijo propio de cada suscripción: el cliente de tiempo real devuelve el
    // canal anterior (que aún se está cerrando) si el nombre coincide, y los
    // avisos se quedarían mudos al remontar el layout (pasa en desarrollo y
    // al pasar del panel a la app).
    const sufijo = Math.random().toString(36).slice(2, 8);
    const canal = supabase
      .channel(`avisos-bandeja-${sufijo}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes" }, (payload) => {
        void recalcular();
        if (leerAvisosActivos()) void avisarMensaje(payload.new as Mensaje);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversaciones" }, () => {
        void recalcular();
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "eventos_conversacion" },
        (payload) => {
          if (leerAvisosActivos()) avisarEvento(payload.new as EventoConversacion);
        },
      )
      .subscribe();

    // Si el socket se durmió con la pestaña en segundo plano (celular
    // bloqueado, laptop cerrada), al volver se recuenta por si se perdió algo.
    function alVolver() {
      if (document.visibilityState === "visible") void recalcular();
    }
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      activo = false;
      document.removeEventListener("visibilitychange", alVolver);
      void supabase.removeChannel(canal);
    };
  }, []);

  const activar = useCallback(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        // Safari viejo usa callback y no devuelve promesa: Promise.resolve cubre ambos casos.
        void Promise.resolve(Notification.requestPermission()).catch(() => undefined);
      } catch {
        // Sin permiso de notificaciones quedan el toast y el sonido.
      }
    }
    guardarAvisosActivos(true);
    toast.success("Avisos activados.");
  }, []);

  const desactivar = useCallback(() => {
    guardarAvisosActivos(false);
  }, []);

  const valor = useMemo<AvisosApi>(
    () => ({ sinResponder, avisosActivos, activar, desactivar, abrirConversacion }),
    [sinResponder, avisosActivos, activar, desactivar, abrirConversacion],
  );

  return <AvisosContext.Provider value={valor}>{children}</AvisosContext.Provider>;
}

/**
 * Un segundo provider en la misma pantalla abriría otro canal de realtime y
 * duplicaría cada toast y sonido: se usa siempre el del layout.
 */
export function useAvisos(): AvisosApi {
  const ctx = useContext(AvisosContext);
  if (!ctx) throw new Error("useAvisos debe usarse dentro de AvisosProvider");
  return ctx;
}
