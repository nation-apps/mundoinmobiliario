"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  BellOff,
  BellRing,
  ChevronDown,
  CircleCheck,
  Clock3,
  Hand,
  Inbox,
  Layers,
  ListFilter,
  MessageCircleReply,
  Radio,
  Search,
  UserRound,
  UserRoundX,
  X,
  type LucideIcon,
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { estadoCanales } from "@/lib/admin/bot-api";
import {
  BANDEJA_STORAGE_KEY,
  CANALES,
  CANAL_LABEL,
  CHAT_QUERY_PARAM,
  ETAPAS,
  ETAPA_LABEL,
  FILTROS_CANAL_BANDEJA,
  FILTROS_ESTADO_BANDEJA,
  LIMITE_BANDEJA,
  esperaRespuesta,
  type BandejaProps,
  type Canal,
  type ClienteEtiqueta,
  type ConversacionResumen,
  type EstadoCanales,
  type Etiqueta,
  type FiltroCanalBandeja,
  type FiltroEstadoBandeja,
  type FiltroEtapaBandeja,
  type FiltrosBandejaGuardados,
} from "@/lib/admin/chats-tipos";
import { Chip } from "@/components/admin/ui";
import { Menu, MenuOpcion, MenuTitulo } from "@/components/admin/Menu";
import { useAvisos } from "./Avisos";
import CanalIcono from "./CanalIcono";
import ClientPanel from "./ClientPanel";
import Hilo from "./Hilo";
import ListaConversaciones, { ETAPA_TONO } from "./ListaConversaciones";

/* ---------- Vista: filtros, selección y pantalla ---------- */

type Pantalla = "lista" | "hilo" | "ficha";

type Vista = {
  filtroCanal: FiltroCanalBandeja;
  filtroEstado: FiltroEstadoBandeja;
  filtroEtapa: FiltroEtapaBandeja;
  /** No se guarda: una búsqueda vieja dejaría la lista vacía sin explicación. */
  busqueda: string;
  seleccionadaId: string | null;
  /** Solo manda en modo apilado (y para la ficha lateral entre lg y xl). */
  pantalla: Pantalla;
  /** Ya se leyó localStorage: recién entonces se puede empezar a guardar. */
  restaurada: boolean;
};

type CambioFiltros = Partial<Pick<Vista, "filtroCanal" | "filtroEstado" | "filtroEtapa" | "busqueda">>;

type Accion =
  | { tipo: "restaurar"; guardados: FiltrosBandejaGuardados }
  | { tipo: "filtrar"; cambio: CambioFiltros; soltar: boolean }
  | { tipo: "seleccionar"; id: string }
  | { tipo: "abrir"; id: string }
  | { tipo: "pantalla"; pantalla: Pantalla }
  | { tipo: "descartar"; id: string };

const VISTA_INICIAL: Vista = {
  filtroCanal: "todas",
  filtroEstado: "todas",
  filtroEtapa: "todas",
  busqueda: "",
  seleccionadaId: null,
  pantalla: "lista",
  restaurada: false,
};

function reducirVista(vista: Vista, accion: Accion): Vista {
  switch (accion.tipo) {
    case "restaurar":
      // Una sola vez: en desarrollo los efectos de montaje corren dos veces.
      if (vista.restaurada) return vista;
      return {
        ...vista,
        filtroCanal: accion.guardados.canal,
        filtroEstado: accion.guardados.estado,
        filtroEtapa: accion.guardados.etapa,
        seleccionadaId: accion.guardados.seleccionadaId,
        restaurada: true,
      };
    case "filtrar":
      return accion.soltar
        ? { ...vista, ...accion.cambio, seleccionadaId: null, pantalla: "lista" }
        : { ...vista, ...accion.cambio };
    case "seleccionar":
      return { ...vista, seleccionadaId: accion.id, pantalla: "hilo" };
    case "abrir":
      // Saltar a otra conversación (aviso, lead web → su WhatsApp, fusión):
      // la de destino suele ser de otro canal o estado, así que sin filtros.
      return {
        ...vista,
        filtroCanal: "todas",
        filtroEstado: "todas",
        filtroEtapa: "todas",
        busqueda: "",
        seleccionadaId: accion.id,
        pantalla: "hilo",
      };
    case "pantalla":
      return { ...vista, pantalla: accion.pantalla };
    case "descartar":
      // La conversación elegida ya no existe (o no se pudo traer).
      if (vista.seleccionadaId !== accion.id) return vista;
      return { ...vista, seleccionadaId: null, pantalla: "lista" };
  }
}

/**
 * Filtros + selección guardados: solo comodidad, así que un storage roto no
 * debe tumbar la bandeja. Un valor que ya no existe cae a "todas".
 * Se llama SOLO desde un efecto: en el servidor no hay localStorage y leerlo
 * en el primer render daría un mismatch de hidratación.
 */
function cargarFiltrosGuardados(estadoPorDefecto: FiltroEstadoBandeja): FiltrosBandejaGuardados {
  const porDefecto: FiltrosBandejaGuardados = { canal: "todas", estado: estadoPorDefecto, etapa: "todas", seleccionadaId: null };
  try {
    const crudo = localStorage.getItem(BANDEJA_STORAGE_KEY);
    if (!crudo) return porDefecto;
    const datos: unknown = JSON.parse(crudo);
    if (!datos || typeof datos !== "object") return porDefecto;
    const d = datos as Record<string, unknown>;
    return {
      canal: FILTROS_CANAL_BANDEJA.find((f) => f.id === d.canal)?.id ?? "todas",
      estado: FILTROS_ESTADO_BANDEJA.find((f) => f.id === d.estado)?.id ?? "todas",
      etapa: ETAPAS.find((e) => e === d.etapa) ?? "todas",
      seleccionadaId: typeof d.seleccionadaId === "string" ? d.seleccionadaId : null,
    };
  } catch {
    return porDefecto;
  }
}

/* ---------- Filtrado ---------- */

type Filtros = {
  canal: FiltroCanalBandeja;
  estado: FiltroEstadoBandeja;
  etapa: FiltroEtapaBandeja;
  busqueda: string;
};

function coincide(c: ConversacionResumen, filtros: Filtros, usuarioId: string): boolean {
  if (filtros.canal === "comentarios") {
    if (c.origen !== "comentario") return false;
  } else if (filtros.canal !== "todas" && c.canal !== filtros.canal) {
    return false;
  }

  const cerrada = c.estado === "cerrada";
  switch (filtros.estado) {
    case "todas":
      // Las cerradas solo se ven en su filtro… salvo que se pida la etapa
      // "Cerrada": ahí esconderlas dejaría la lista vacía sin explicación.
      if (cerrada && filtros.etapa !== "cerrado") return false;
      break;
    case "sin_responder":
      if (cerrada || !esperaRespuesta(c)) return false;
      break;
    case "mias":
      if (c.asignada_a !== usuarioId) return false;
      break;
    case "sin_asignar":
      if (cerrada || c.asignada_a !== null) return false;
      break;
    case "escaladas":
      if (c.estado !== "escalada") return false;
      break;
    case "cerradas":
      if (!cerrada) return false;
      break;
  }

  if (filtros.etapa !== "todas" && c.etapa !== filtros.etapa) return false;

  const termino = filtros.busqueda.trim().toLowerCase();
  if (!termino) return true;
  // "987 654 321" debe encontrar "51987654321".
  const digitos = termino.replace(/\D/g, "");
  if (digitos.length >= 3 && (c.cliente_telefono ?? "").includes(digitos)) return true;
  return [c.cliente_nombre, c.cliente_telefono, c.cliente_email, c.identidad_nombre, c.identidad_username, c.ultimo_contenido].some(
    (valor) => (valor ?? "").toLowerCase().includes(termino),
  );
}

/** Agrega una conversación que quedó fuera de las LIMITE_BANDEJA, respetando el orden por actividad. */
function conExtra(lista: ConversacionResumen[], extra: ConversacionResumen): ConversacionResumen[] {
  if (lista.some((c) => c.id === extra.id)) return lista;
  return [...lista, extra].sort((a, b) => Date.parse(b.actividad_at) - Date.parse(a.actividad_at));
}

function idDeFila(fila: unknown): string | null {
  if (!fila || typeof fila !== "object" || !("id" in fila)) return null;
  const id = (fila as { id: unknown }).id;
  return typeof id === "string" ? id : null;
}

/* ---------- Escritorio o apilado ---------- */

const MEDIA_ESCRITORIO = "(min-width: 1024px)";
const MEDIA_XL = "(min-width: 1280px)";

function suscribirMedia(query: string) {
  return (alCambiar: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", alCambiar);
    return () => mql.removeEventListener("change", alCambiar);
  };
}

// Funciones estables (no tocan `window` hasta que React las llama en el navegador).
const suscribirEscritorio = suscribirMedia(MEDIA_ESCRITORIO);
const suscribirXl = suscribirMedia(MEDIA_XL);

/* ---------- Piezas de la cabecera ---------- */

const CLASES_CHIP_ACTIVO = "border-ink bg-ink text-white";
const CLASES_CHIP_INACTIVO = "border-line bg-porcelain text-ink-soft hover:border-line-strong";

/** `Chip` de ui.tsx mide ~32 px y no acepta className: en táctil va esta versión de 44 px. */
function ChipTactil({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors ${
        activo ? CLASES_CHIP_ACTIVO : CLASES_CHIP_INACTIVO
      }`}
    >
      {children}
    </button>
  );
}

function FilaChips<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  tactil,
  className,
}: {
  etiqueta: string;
  opciones: { id: T; label: string }[];
  valor: T;
  onCambiar: (id: T) => void;
  tactil: boolean;
  className: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className={className}>
      {opciones.map((o) =>
        tactil ? (
          <ChipTactil key={o.id} activo={o.id === valor} onClick={() => onCambiar(o.id)}>
            {o.label}
          </ChipTactil>
        ) : (
          <Chip key={o.id} activo={o.id === valor} onClick={() => onCambiar(o.id)}>
            {o.label}
          </Chip>
        ),
      )}
    </div>
  );
}

function BotonAvisos({ tactil }: { tactil: boolean }) {
  const { avisosActivos, activar, desactivar } = useAvisos();
  return (
    <button
      type="button"
      aria-pressed={avisosActivos}
      onClick={() => (avisosActivos ? desactivar() : activar())}
      title={avisosActivos ? "Dejar de avisar cuando llega un mensaje" : "Avisar con sonido cuando llega un mensaje"}
      className={`inline-flex h-9 shrink-0 items-center gap-2 border px-3 text-[13px] font-medium transition-colors ${tactil ? "min-h-11" : ""} ${
        avisosActivos
          ? "border-accent/45 bg-accent-soft text-accent-deep hover:border-accent"
          : "border-line bg-porcelain text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {avisosActivos ? <BellRing size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
      {avisosActivos ? "Avisos activados" : "Activar avisos"}
    </button>
  );
}

/* ---------- Filtros desplegables ---------- */

const OPCIONES_ETAPA: { id: FiltroEtapaBandeja; label: string }[] = [
  { id: "todas", label: "Todas" },
  ...ETAPAS.map((e) => ({ id: e, label: ETAPA_LABEL[e] })),
];

const ICONO_ESTADO: Record<FiltroEstadoBandeja, LucideIcon> = {
  todas: Inbox,
  sin_responder: Clock3,
  mias: UserRound,
  sin_asignar: UserRoundX,
  escaladas: Hand,
  cerradas: CircleCheck,
};

function iconoFiltroCanal(id: FiltroCanalBandeja): ReactNode {
  if (id === "todas") return <Layers size={16} strokeWidth={1.9} aria-hidden />;
  if (id === "comentarios") return <MessageCircleReply size={16} strokeWidth={1.9} aria-hidden />;
  return <CanalIcono canal={id} size={16} />;
}

const CLASE_FILTRO =
  "inline-flex h-9 shrink-0 items-center gap-2 border px-3 text-[13px] transition-colors aria-expanded:ring-3 aria-expanded:ring-accent-soft max-lg:h-11";

/** Un filtro de la bandeja como menú: muestra lo elegido y, en cada opción, cuántas conversaciones quedarían. */
function FiltroDesplegable<T extends string>({
  nombre,
  icono,
  opciones,
  valor,
  conteos,
  onCambiar,
}: {
  nombre: string;
  icono: ReactNode;
  opciones: { id: T; label: string; icono?: ReactNode }[];
  valor: T;
  conteos: Record<T, number>;
  onCambiar: (id: T) => void;
}) {
  const elegida = opciones.find((o) => o.id === valor) ?? opciones[0];
  const activo = valor !== opciones[0]?.id;
  return (
    <Menu
      etiqueta={`Filtrar por ${nombre.toLowerCase()}`}
      ancho={250}
      claseBoton={`${CLASE_FILTRO} ${
        activo ? "border-accent/45 bg-accent-soft text-accent-deep" : "border-line bg-porcelain text-ink hover:border-line-strong"
      }`}
      boton={
        <>
          <span className={activo ? "text-accent" : "text-muted"}>{icono}</span>
          <span className={activo ? "text-accent-deep/80" : "text-muted"}>{nombre}</span>
          <span className="font-medium">{elegida?.label}</span>
          <ChevronDown size={14} aria-hidden className={activo ? "text-accent" : "text-muted"} />
        </>
      }
    >
      <MenuTitulo>{nombre}</MenuTitulo>
      {opciones.map((o) => (
        <MenuOpcion key={o.id} elegida={o.id === valor} onElegir={() => onCambiar(o.id)} icono={o.icono} detalle={conteos[o.id] ?? 0}>
          {o.label}
        </MenuOpcion>
      ))}
    </Menu>
  );
}

/** En la app móvil solo van a la vista los tres estados que se usan de pie; el resto, en "Más filtros". */
const ESTADOS_APP: FiltroEstadoBandeja[] = ["sin_responder", "escaladas", "todas"];
const FILTROS_ESTADO_APP = ESTADOS_APP.flatMap((id) => FILTROS_ESTADO_BANDEJA.filter((f) => f.id === id));
const FILTROS_ESTADO_APP_EXTRA = FILTROS_ESTADO_BANDEJA.filter((f) => !ESTADOS_APP.includes(f.id));

const FILA_ENVUELTA = "flex flex-wrap items-center gap-2";
/** Una sola línea que se desliza con el dedo: siete chips de 44 px envueltos se comerían media pantalla. */
const FILA_DESLIZABLE = "-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Franja superior en tinta: con `black-translucent` iOS dibuja la hora y la batería en blanco. */
const CAPA_COMPLETA = "fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-ink pt-[env(safe-area-inset-top)]";

/* ---------- Bandeja ---------- */

/**
 * La bandeja de chats. Modo "panel" (/admin/chats): tres columnas en ≥lg
 * (lista | hilo | ficha) y apilado por debajo. Modo "app" (/app/chats):
 * siempre apilado, lista → hilo → ficha a pantalla completa.
 */
export default function Bandeja({ usuarioId, modo, inicial, estadoPorDefecto = "todas" }: BandejaProps) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();
  const pathname = usePathname();
  const pedida = useSearchParams().get(CHAT_QUERY_PARAM);

  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>(inicial.conversaciones);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>(inicial.etiquetas);
  const [clienteEtiquetas, setClienteEtiquetas] = useState<ClienteEtiqueta[]>(inicial.clienteEtiquetas);
  // Estos tres no se recargan: cambian rara vez y vienen frescos con cada carga de la página.
  const { staff, respuestasRapidas, plantillas } = inicial;
  // Se llama `canales` y no `estadoCanales`: ese nombre es la función de bot-api.
  const [canales, setCanales] = useState<EstadoCanales | null>(null);
  // La carga inicial ya viene del servidor: solo se enciende al recargar una lista vacía.
  const [cargando, setCargando] = useState(false);

  const [vista, despachar] = useReducer(reducirVista, VISTA_INICIAL);
  const { filtroCanal, filtroEstado, filtroEtapa, busqueda, seleccionadaId, pantalla, restaurada } = vista;

  // El servidor no tiene matchMedia: allí se asume escritorio en el panel y
  // apilado en la app; React corrige con el valor real al hidratar.
  const esEscritorio = useSyncExternalStore(
    suscribirEscritorio,
    () => window.matchMedia(MEDIA_ESCRITORIO).matches,
    () => modo === "panel",
  );
  const esXl = useSyncExternalStore(
    suscribirXl,
    () => window.matchMedia(MEDIA_XL).matches,
    () => false,
  );
  const apilado = modo === "app" || !esEscritorio;

  /* --- Lo que necesitan ver los callbacks de realtime, que se arman una sola vez --- */
  const conversacionesRef = useRef(conversaciones);
  const seleccionadaIdRef = useRef(seleccionadaId);
  const turnoRef = useRef(0);
  const montadaRef = useRef(false);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    conversacionesRef.current = conversaciones;
  }, [conversaciones]);
  useEffect(() => {
    seleccionadaIdRef.current = seleccionadaId;
  }, [seleccionadaId]);

  /* --- Consultas --- */

  const traerUna = useCallback(
    async (id: string) => {
      const { data, error } = await supabase.from("conversaciones_resumen").select("*").eq("id", id).maybeSingle();
      if (error) toast.error("No se pudo abrir la conversación.");
      if (error || !data) {
        despachar({ tipo: "descartar", id });
        return;
      }
      setConversaciones((previas) => conExtra(previas, data as ConversacionResumen));
    },
    [supabase],
  );

  const recargar = useCallback(async () => {
    const turno = ++turnoRef.current;
    if (conversacionesRef.current.length === 0) setCargando(true);

    const [conv, rel, etq] = await Promise.all([
      supabase.from("conversaciones_resumen").select("*").order("actividad_at", { ascending: false }).limit(LIMITE_BANDEJA),
      supabase.from("cliente_etiquetas").select("cliente_id, etiqueta_id"),
      // El catálogo también: la ficha crea etiquetas y `etiquetas` no está en la publicación de realtime.
      supabase.from("etiquetas").select("id, nombre, color").order("nombre"),
    ]);
    // Llegó tarde: ya hay una recarga más nueva en camino, o la bandeja se desmontó.
    const vencida = () => turno !== turnoRef.current || !montadaRef.current;
    if (vencida()) return;

    if (conv.error) {
      toast.error("No se pudieron actualizar las conversaciones.", { id: "bandeja-recarga" });
    } else {
      let lista = (conv.data ?? []) as ConversacionResumen[];
      // La conversación abierta puede ser más vieja que las últimas
      // LIMITE_BANDEJA: se trae aparte para que no se cierre sola.
      const elegida = seleccionadaIdRef.current;
      if (elegida && !lista.some((c) => c.id === elegida)) {
        const extra = await supabase.from("conversaciones_resumen").select("*").eq("id", elegida).maybeSingle();
        if (vencida()) return;
        if (extra.data) {
          lista = conExtra(lista, extra.data as ConversacionResumen);
        } else if (extra.error) {
          const previa = conversacionesRef.current.find((c) => c.id === elegida);
          if (previa) lista = conExtra(lista, previa);
        } else {
          despachar({ tipo: "descartar", id: elegida });
        }
      }
      setConversaciones(lista);
    }
    if (!rel.error) setClienteEtiquetas((rel.data ?? []) as ClienteEtiqueta[]);
    if (!etq.error) setEtiquetas((etq.data ?? []) as Etiqueta[]);
    setCargando(false);
  }, [supabase]);

  /**
   * Un cambio que el hilo acaba de guardar (quién atiende, etapa, asignación) se pinta al instante y se confirma con el
   * servidor un poco después. Antes dependía solo del aviso de tiempo real y, si no llegaba, el interruptor Bot / Yo se
   * quedaba como estaba aunque el cambio sí se había guardado.
   */
  const aplicarCambio = useCallback(
    (id: string, parche: Partial<ConversacionResumen>) => {
      setConversaciones((previas) => previas.map((c) => (c.id === id ? { ...c, ...parche } : c)));
      setTimeout(() => {
        if (montadaRef.current) void recargar();
      }, 800);
    },
    [recargar],
  );

  /* --- Realtime: cualquier cambio recarga el resumen, con 300 ms de espera --- */
  useEffect(() => {
    montadaRef.current = true;
    const programarRecarga = () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        void recargar();
      }, 300);
    };

    // Sufijo propio de cada suscripción: el cliente de tiempo real devuelve el
    // canal anterior (que aún se está cerrando) si el nombre coincide, y la
    // bandeja se quedaría sin eventos al remontarse (pasa en desarrollo y al
    // salir y volver rápido a la página).
    const sufijo = Math.random().toString(36).slice(2, 8);
    const canalRt = supabase
      .channel(`bandeja-${modo}-${sufijo}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversaciones" }, programarRecarga)
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes" }, (payload) => {
        // Cada contacto nuevo toca `clientes`: solo importa si ese contacto
        // está en la bandeja (uno nuevo llega además con su fila en `conversaciones`).
        const id = idDeFila(payload.new) ?? idDeFila(payload.old);
        if (id && !conversacionesRef.current.some((c) => c.cliente_id === id)) return;
        programarRecarga();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cliente_etiquetas" }, programarRecarga)
      .subscribe((estado) => {
        // Al quedar suscrito (y al reconectar): cubre lo que llegó entre la
        // carga del servidor y la suscripción, o mientras el socket estuvo caído.
        if (estado === "SUBSCRIBED") programarRecarga();
      });

    // El celular corta el socket con la app en segundo plano: al volver, ponerse al día.
    const alVolver = () => {
      if (document.visibilityState === "visible") programarRecarga();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
      montadaRef.current = false;
      document.removeEventListener("visibilitychange", alVolver);
      void supabase.removeChannel(canalRt);
    };
  }, [supabase, modo, recargar]);

  /* --- Estado de los canales (lo pide el navegador; el bot puede estar apagado) --- */
  useEffect(() => {
    let activo = true;
    estadoCanales()
      .then((estado) => {
        if (activo) setCanales(estado);
      })
      .catch(() => {
        // Bot sin conexión: se queda en null, sin toast. El hilo ya lo tolera.
      });
    return () => {
      activo = false;
    };
  }, []);

  /* --- Persistencia de filtros y selección --- */
  useEffect(() => {
    despachar({ tipo: "restaurar", guardados: cargarFiltrosGuardados(estadoPorDefecto) });
  }, [estadoPorDefecto]);

  // En apilado, con la lista a la vista, no hay ningún chat "abierto": se
  // guarda null para que los avisos no callen los mensajes de ese contacto.
  const idGuardado = apilado && pantalla === "lista" ? null : seleccionadaId;
  useEffect(() => {
    if (!restaurada) return;
    const datos: FiltrosBandejaGuardados = { canal: filtroCanal, estado: filtroEstado, etapa: filtroEtapa, seleccionadaId: idGuardado };
    try {
      localStorage.setItem(BANDEJA_STORAGE_KEY, JSON.stringify(datos));
    } catch {
      // Modo privado o cuota llena: perder el filtro guardado no es grave.
    }
  }, [restaurada, filtroCanal, filtroEstado, filtroEtapa, idGuardado]);

  /* --- ?c=<id>: "Abrir" en un aviso. Va DESPUÉS de restaurar para ganarle a lo guardado --- */
  useEffect(() => {
    if (!pedida) return;
    despachar({ tipo: "abrir", id: pedida });
    // Se limpia la URL: un refresco no debe volver a forzar esta conversación.
    router.replace(pathname, { scroll: false });
  }, [pedida, pathname, router]);

  /* --- La elegida puede no estar entre las cargadas (vieja, o recién creada) --- */
  useEffect(() => {
    if (!seleccionadaId) return;
    if (conversacionesRef.current.some((c) => c.id === seleccionadaId)) return;
    void traerUna(seleccionadaId);
  }, [seleccionadaId, traerUna]);

  /* --- Derivados --- */

  const etiquetasPorCliente = useMemo(() => {
    const porId = new Map(etiquetas.map((e) => [e.id, e]));
    const mapa = new Map<string, Etiqueta[]>();
    for (const rel of clienteEtiquetas) {
      const etiqueta = porId.get(rel.etiqueta_id);
      if (!etiqueta) continue;
      const actuales = mapa.get(rel.cliente_id) ?? [];
      actuales.push(etiqueta);
      mapa.set(rel.cliente_id, actuales);
    }
    return mapa;
  }, [etiquetas, clienteEtiquetas]);

  const filtradas = useMemo(() => {
    const filtros: Filtros = { canal: filtroCanal, estado: filtroEstado, etapa: filtroEtapa, busqueda };
    return conversaciones.filter((c) => coincide(c, filtros, usuarioId));
  }, [conversaciones, filtroCanal, filtroEstado, filtroEtapa, busqueda, usuarioId]);

  // Se busca en TODAS, no en las filtradas: si no, con el filtro "Sin
  // responder" el hilo se cerraría solo apenas el staff contesta. Cuando es
  // el staff quien cambia un filtro, `filtrar` suelta la selección que ya no calza.
  const seleccionada = useMemo(
    () => (seleccionadaId ? (conversaciones.find((c) => c.id === seleccionadaId) ?? null) : null),
    [conversaciones, seleccionadaId],
  );

  const resumen = useMemo(() => {
    const porCanal: Record<Canal, number> = { whatsapp: 0, messenger: 0, instagram: 0, tiktok: 0, web: 0 };
    let sinResponder = 0;
    let conPersona = 0;
    for (const c of conversaciones) {
      if (c.estado === "cerrada") continue;
      porCanal[c.canal]++;
      if (esperaRespuesta(c)) sinResponder++;
      if (c.estado === "escalada") conPersona++;
    }
    return { porCanal, sinResponder, conPersona };
  }, [conversaciones]);

  /* --- Acciones --- */

  function filtrar(cambio: CambioFiltros) {
    const siguientes: Filtros = {
      canal: cambio.filtroCanal ?? filtroCanal,
      estado: cambio.filtroEstado ?? filtroEstado,
      etapa: cambio.filtroEtapa ?? filtroEtapa,
      busqueda: cambio.busqueda ?? busqueda,
    };
    const soltar = seleccionada !== null && !coincide(seleccionada, siguientes, usuarioId);
    despachar({ tipo: "filtrar", cambio, soltar });
  }

  const seleccionar = useCallback((id: string) => despachar({ tipo: "seleccionar", id }), []);
  // Además de cambiar la vista se relee la bandeja: tras fusionar contactos la
  // conversación conserva su id pero cambia de cliente, y no conviene depender
  // solo de que llegue el evento de tiempo real.
  const abrirConversacion = useCallback(
    (id: string) => {
      despachar({ tipo: "abrir", id });
      void recargar();
    },
    [recargar],
  );
  const verLista = useCallback(() => despachar({ tipo: "pantalla", pantalla: "lista" }), []);
  const verHilo = useCallback(() => despachar({ tipo: "pantalla", pantalla: "hilo" }), []);
  const verFicha = useCallback(() => despachar({ tipo: "pantalla", pantalla: "ficha" }), []);

  /* --- Con una capa a pantalla completa encima, la página de atrás no debe moverse --- */
  const capaAbierta = apilado && pantalla !== "lista" && seleccionada !== null;
  useEffect(() => {
    if (!capaAbierta) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [capaAbierta]);

  /* --- Piezas compartidas por las cabeceras --- */

  const conteos = useMemo(() => {
    // Cuántas quedarían con cada opción, sin tocar los demás filtros (sobre las LIMITE_BANDEJA cargadas).
    const base: Filtros = { canal: filtroCanal, estado: filtroEstado, etapa: filtroEtapa, busqueda };
    const contar = (cambio: Partial<Filtros>) =>
      conversaciones.reduce((n, c) => n + (coincide(c, { ...base, ...cambio }, usuarioId) ? 1 : 0), 0);
    return {
      canal: Object.fromEntries(FILTROS_CANAL_BANDEJA.map((f) => [f.id, contar({ canal: f.id })])) as Record<FiltroCanalBandeja, number>,
      estado: Object.fromEntries(FILTROS_ESTADO_BANDEJA.map((f) => [f.id, contar({ estado: f.id })])) as Record<FiltroEstadoBandeja, number>,
      etapa: Object.fromEntries(OPCIONES_ETAPA.map((f) => [f.id, contar({ etapa: f.id })])) as Record<FiltroEtapaBandeja, number>,
    };
  }, [conversaciones, filtroCanal, filtroEstado, filtroEtapa, busqueda, usuarioId]);

  const hayFiltros = filtroCanal !== "todas" || filtroEstado !== "todas" || filtroEtapa !== "todas" || busqueda.trim() !== "";

  const selectorEtapa = (
    <FiltroDesplegable
      nombre="Etapa"
      icono={<Layers size={15} aria-hidden />}
      opciones={OPCIONES_ETAPA.map((o) => ({
        ...o,
        icono: <span aria-hidden className="size-2 rounded-full" style={{ background: o.id === "todas" ? "var(--line-strong)" : ETAPA_TONO[o.id].punto }} />,
      }))}
      valor={filtroEtapa}
      conteos={conteos.etapa}
      onCambiar={(id) => filtrar({ filtroEtapa: id })}
    />
  );

  const filtrosDesplegables = (
    <div role="group" aria-label="Filtros de la bandeja" className={apilado ? FILA_DESLIZABLE : FILA_ENVUELTA}>
      <FiltroDesplegable
        nombre="Canal"
        icono={<Radio size={15} aria-hidden />}
        opciones={FILTROS_CANAL_BANDEJA.map((o) => ({ ...o, icono: iconoFiltroCanal(o.id) }))}
        valor={filtroCanal}
        conteos={conteos.canal}
        onCambiar={(id) => filtrar({ filtroCanal: id })}
      />
      <FiltroDesplegable
        nombre="Estado"
        icono={<ListFilter size={15} aria-hidden />}
        opciones={FILTROS_ESTADO_BANDEJA.map((o) => {
          const Icono = ICONO_ESTADO[o.id];
          return { ...o, icono: <Icono size={16} strokeWidth={1.9} aria-hidden /> };
        })}
        valor={filtroEstado}
        conteos={conteos.estado}
        onCambiar={(id) => filtrar({ filtroEstado: id })}
      />
      {selectorEtapa}
      {hayFiltros && (
        <button
          type="button"
          onClick={() => filtrar({ filtroCanal: "todas", filtroEstado: "todas", filtroEtapa: "todas", busqueda: "" })}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 px-2.5 text-[13px] text-muted transition-colors hover:text-ink max-lg:h-11"
        >
          <X size={14} aria-hidden />
          Limpiar
        </button>
      )}
    </div>
  );

  const campoBusqueda = (
    <div className={`relative ${apilado ? "w-full" : "w-full max-w-sm lg:ml-auto"}`}>
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        aria-label="Buscar conversaciones"
        value={busqueda}
        onChange={(e) => filtrar({ busqueda: e.target.value })}
        placeholder={apilado ? "Buscar nombre, teléfono o mensaje…" : "Buscar por nombre, teléfono, @usuario o mensaje…"}
        // `.admin-input` no está en una capa de Tailwind: su padding solo cede con `!`.
        // En táctil, 16 px de letra para que iOS no haga zoom al enfocar.
        className={`admin-input !pl-9 ${apilado ? "h-11 !text-base" : "h-9 !py-0"}`}
      />
    </div>
  );

  const CLASE_LECTURA = "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px]";
  const lecturas = (
    <ul aria-label="Resumen de la bandeja" className={`flex items-center gap-1.5 ${apilado ? FILA_DESLIZABLE : "flex-wrap"}`}>
      <li
        className={`${CLASE_LECTURA} shrink-0 ${
          resumen.sinResponder > 0 ? "border-redline/30 bg-redline/[0.06] text-redline" : "border-line bg-porcelain text-ink-soft"
        }`}
      >
        <span aria-hidden className={resumen.sinResponder > 0 ? "punto-vivo" : "size-1.5 rounded-full bg-current"} />
        <span className="t-mono font-semibold tabular-nums">{resumen.sinResponder}</span> sin responder
      </li>
      <li className={`${CLASE_LECTURA} shrink-0 border-line bg-porcelain text-ink-soft`}>
        <Hand size={13} aria-hidden />
        <span className="t-mono font-semibold tabular-nums text-ink">{resumen.conPersona}</span> con una persona
      </li>
      {CANALES.filter((canal) => resumen.porCanal[canal] > 0).map((canal) => (
        <li key={canal} title={`${resumen.porCanal[canal]} abiertas en ${CANAL_LABEL[canal]}`} className={`${CLASE_LECTURA} shrink-0 border-line bg-porcelain text-ink`}>
          <CanalIcono canal={canal} size={15} />
          <span className="t-mono font-semibold tabular-nums">{resumen.porCanal[canal]}</span>
          <span className="sr-only">abiertas en {CANAL_LABEL[canal]}</span>
        </li>
      ))}
    </ul>
  );

  const cabeceraPanel = (
    <header className={`shrink-0 ${apilado ? "mb-4" : "pb-4"}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <span className="t-brace">Operación</span>
          <h1 className="t-titulo mt-2.5 text-[clamp(28px,3vw,38px)]">Conversaciones</h1>
        </div>
        <BotonAvisos tactil={apilado} />
      </div>
      <div className="mt-3">{lecturas}</div>
      {apilado ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {campoBusqueda}
          {filtrosDesplegables}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {filtrosDesplegables}
          {campoBusqueda}
        </div>
      )}
    </header>
  );

  const filtrosExtraActivos =
    (filtroCanal !== "todas" ? 1 : 0) + (filtroEtapa !== "todas" ? 1 : 0) + (ESTADOS_APP.includes(filtroEstado) ? 0 : 1);

  const cabeceraApp = (
    <header className="mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-display text-2xl leading-tight">Chats</h1>
          <p className="mt-0.5 text-xs text-muted">
            {resumen.sinResponder} sin responder · {resumen.conPersona} con una persona
          </p>
        </div>
        <BotonAvisos tactil />
      </div>

      <FilaChips
        etiqueta="Filtrar por estado"
        opciones={FILTROS_ESTADO_APP}
        valor={filtroEstado}
        onCambiar={(id) => filtrar({ filtroEstado: id })}
        tactil
        className={FILA_ENVUELTA}
      />

      {campoBusqueda}

      <details className="group border-y border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft [&::-webkit-details-marker]:hidden">
          <span>
            Más filtros
            {filtrosExtraActivos > 0 && (
              <span className="text-accent">
                {" · "}
                {filtrosExtraActivos} {filtrosExtraActivos === 1 ? "activo" : "activos"}
              </span>
            )}
          </span>
          <span aria-hidden className="text-lg leading-none transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <div className="flex flex-col gap-3 pb-3 pt-1">
          <FilaChips
            etiqueta="Más estados"
            opciones={FILTROS_ESTADO_APP_EXTRA}
            valor={filtroEstado}
            onCambiar={(id) => filtrar({ filtroEstado: id })}
            tactil
            className={FILA_ENVUELTA}
          />
          <FilaChips
            etiqueta="Filtrar por canal"
            opciones={FILTROS_CANAL_BANDEJA}
            valor={filtroCanal}
            onCambiar={(id) => filtrar({ filtroCanal: id })}
            tactil
            className={FILA_ENVUELTA}
          />
          <div className="flex">{selectorEtapa}</div>
        </div>
      </details>
    </header>
  );

  /* --- Render --- */

  return (
    <>
      {apilado ? (
        <div>
          {modo === "app" ? cabeceraApp : cabeceraPanel}
          <div className="admin-card overflow-hidden">
            <ListaConversaciones
              conversaciones={filtradas}
              etiquetasPorCliente={etiquetasPorCliente}
              seleccionadaId={null}
              onSeleccionar={seleccionar}
              cargando={cargando}
              className="flex w-full flex-col"
            />
          </div>
        </div>
      ) : (
        // El layout del panel ya gasta pt-8 + pb-16 = 6rem: la columna ocupa el
        // resto y solo scrollean lista, hilo y ficha (el compositor queda a la vista).
        <div className="flex h-[calc(100dvh-6rem)] min-h-[560px] flex-col">
          {cabeceraPanel}
          <div className="admin-card flex min-h-0 flex-1 overflow-hidden">
            <ListaConversaciones
              conversaciones={filtradas}
              etiquetasPorCliente={etiquetasPorCliente}
              seleccionadaId={seleccionadaId}
              onSeleccionar={seleccionar}
              cargando={cargando}
              className="w-[340px] shrink-0 overflow-y-auto border-r border-line"
            />
            <Hilo
              conversacion={seleccionada}
              staff={staff}
              usuarioId={usuarioId}
              estadoCanales={canales}
              respuestasRapidas={respuestasRapidas}
              plantillas={plantillas}
              onAbrirConversacion={abrirConversacion}
              // En xl la ficha ya está a la derecha: el nombre deja de ser botón.
              onAbrirContacto={esXl ? undefined : verFicha}
              onCambio={aplicarCambio}
            />
            {esXl && seleccionada && (
              <ClientPanel
                conversacion={seleccionada}
                etiquetas={etiquetas}
                etiquetasCliente={etiquetasPorCliente.get(seleccionada.cliente_id) ?? []}
                staff={staff}
                usuarioId={usuarioId}
                onAbrirConversacion={abrirConversacion}
                className="w-[320px] shrink-0 border-l border-line"
              />
            )}
          </div>
        </div>
      )}

      {/* Entre lg y xl la ficha no cabe como columna: se abre como panel lateral. */}
      {!apilado && !esXl && pantalla === "ficha" && seleccionada && (
        <>
          <button type="button" aria-label="Cerrar la ficha del contacto" onClick={verHilo} className="fixed inset-0 z-40 cursor-default bg-ink/30" />
          <div className="fixed inset-y-0 right-0 z-50 flex w-[360px] max-w-full flex-col overflow-hidden bg-porcelain shadow-xl">
            <ClientPanel
              conversacion={seleccionada}
              etiquetas={etiquetas}
              etiquetasCliente={etiquetasPorCliente.get(seleccionada.cliente_id) ?? []}
              staff={staff}
              usuarioId={usuarioId}
              onAbrirConversacion={abrirConversacion}
              onVolver={verHilo}
              className="flex-1"
            />
          </div>
        </>
      )}

      {/* Apilado: hilo y ficha como capas a pantalla completa. Se desmontan al
          volver, y con eso el hilo corta su suscripción de realtime. El
          overflow-hidden evita que el menú de atajos empuje el compositor fuera. */}
      {capaAbierta && seleccionada && (
        <div className={`${CAPA_COMPLETA} z-50`}>
          <div className="flex min-h-0 flex-1 flex-col bg-porcelain">
            <Hilo
              conversacion={seleccionada}
              staff={staff}
              usuarioId={usuarioId}
              estadoCanales={canales}
              respuestasRapidas={respuestasRapidas}
              plantillas={plantillas}
              onAbrirConversacion={abrirConversacion}
              onVolver={verLista}
              onAbrirContacto={verFicha}
              onCambio={aplicarCambio}
            />
          </div>
        </div>
      )}
      {capaAbierta && pantalla === "ficha" && seleccionada && (
        <div className={`${CAPA_COMPLETA} z-[55]`}>
          <div className="flex min-h-0 flex-1 flex-col bg-porcelain">
            <ClientPanel
              conversacion={seleccionada}
              etiquetas={etiquetas}
              etiquetasCliente={etiquetasPorCliente.get(seleccionada.cliente_id) ?? []}
              staff={staff}
              usuarioId={usuarioId}
              onAbrirConversacion={abrirConversacion}
              onVolver={verHilo}
              className="flex-1"
            />
          </div>
        </div>
      )}
    </>
  );
}
