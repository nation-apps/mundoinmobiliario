import { ZONA_NEGOCIO } from "@/lib/admin/rango";
/**
 * Vocabulario de la bandeja de chats (bot de WhatsApp / Messenger /
 * Instagram). Sin "use client": lo importan Server Components y componentes
 * de cliente. Las formas calzan con `conversaciones_resumen` y `mensajes`
 * de supabase/migrations/0006_bot_omnicanal.sql.
 */

export type Canal = "whatsapp" | "messenger" | "instagram" | "tiktok" | "web";
export type OrigenConversacion = "dm" | "comentario" | "formulario";
export type EstadoConversacion = "activa" | "escalada" | "cerrada";
export type Etapa = "nuevo" | "en_atencion" | "calificado" | "agendado" | "propuesta" | "cerrado";
export type MotivoCierre = "ganado" | "perdido" | "spam" | "sin_respuesta" | "otro";
export type RolMensaje = "user" | "assistant" | "humano";
export type TipoMensaje = "mensaje" | "comentario" | "nota" | "sistema";

export const CANALES: Canal[] = ["whatsapp", "messenger", "instagram", "tiktok", "web"];

/**
 * `hilo_externo` de los leads de formularios de anuncios de Meta (Lead Ads):
 * entran como canal `web` / origen `formulario`, igual que el formulario del
 * sitio, y esto los distingue. Mismo valor que HILO_LEAD_ADS en bot/src/meta/leadAds.ts.
 */
export const HILO_LEAD_ADS = "facebook_lead_ads";

export const CANAL_LABEL: Record<Canal, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  tiktok: "TikTok",
  web: "Web",
};

export const ETAPAS: Etapa[] = ["nuevo", "en_atencion", "calificado", "agendado", "propuesta", "cerrado"];

export const ETAPA_LABEL: Record<Etapa, string> = {
  nuevo: "Nueva",
  en_atencion: "En atención",
  calificado: "Con teléfono",
  agendado: "Con visita",
  propuesta: "Propuesta",
  cerrado: "Cerrada",
};

export const MOTIVO_CIERRE_LABEL: Record<MotivoCierre, string> = {
  ganado: "Ganada (compró / rentó)",
  perdido: "Perdida",
  spam: "Spam",
  sin_respuesta: "Sin respuesta",
  otro: "Otro",
};

export type ConversacionResumen = {
  id: string;
  cliente_id: string;
  estado: EstadoConversacion;
  created_at: string;
  canal: Canal;
  origen: OrigenConversacion;
  hilo_externo: string | null;
  cuenta_id: string | null;
  identidad_id: string | null;
  etapa: Etapa;
  motivo_cierre: MotivoCierre | null;
  asignada_a: string | null;
  asignada_nombre: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_tipo: "prospecto" | "cliente" | "ex_cliente";
  cliente_interes: string | null;
  /** Lo que busca, ordenado (lo llena el bot con guardar_perfil_busqueda). */
  cliente_perfil: PerfilCompra | null;
  cliente_canal_origen: string;
  identidad_nombre: string | null;
  identidad_username: string | null;
  identidad_foto: string | null;
  ultimo_contenido: string | null;
  ultimo_rol: RolMensaje | null;
  ultimo_tipo: TipoMensaje | null;
  ultimo_mensaje_at: string;
  ultimo_comentario_at: string | null;
  ultima_respuesta_at: string | null;
  primera_respuesta_at: string | null;
  primera_respuesta_humana_at: string | null;
  actividad_at: string;
};

export type Mensaje = {
  id: string;
  conversacion_id: string;
  rol: RolMensaje;
  tipo: TipoMensaje;
  contenido: string;
  external_id: string | null;
  wa_message_id: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | "document" | null;
  media_path: string | null;
  error_entrega: string | null;
  autor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type StaffMiembro = { user_id: string; nombre: string; rol: string };

export type Etiqueta = { id: string; nombre: string; color: EtiquetaColor };
export type EtiquetaColor = "slate" | "rose" | "amber" | "emerald" | "sky" | "violet";
/** Colores que se reparten al crear una etiqueta (check de etiquetas.color en 0006). */
export const COLORES_ETIQUETA: EtiquetaColor[] = ["slate", "rose", "amber", "emerald", "sky", "violet"];
export type ClienteEtiqueta = { cliente_id: string; etiqueta_id: string };

export type RespuestaRapida = {
  id: string;
  atajo: string;
  titulo: string;
  contenido: string;
  canal: Canal | null;
  activa: boolean;
  sort_order: number;
};

export type PlantillaMedia = {
  id: string;
  nombre: string;
  tipo: "image" | "video" | "audio" | "document";
  storage_path: string;
  descripcion_uso: string;
  caption: string | null;
  activo: boolean;
};

export type CanalConfig = {
  canal: "whatsapp" | "messenger" | "instagram" | "tiktok";
  activo: boolean;
  ia_activa: boolean;
  ia_comentarios_activa: boolean;
  texto_respuesta_privada: string | null;
  cuenta_id: string | null;
  cuenta_nombre: string | null;
  ultimo_webhook_at: string | null;
};

/** Lo que devuelve GET /admin/canales/estado del bot (nunca trae secretos). */
export type EstadoCanales = {
  whatsapp: { configurado: boolean; numero: string | null; plantillasDisponibles: boolean };
  messenger: { configurado: boolean; pagina: string | null; suscrito: boolean; tokenVence: string | null };
  instagram: { configurado: boolean; cuenta: string | null; username: string | null };
  tiktok: { configurado: boolean; mensajesDirectos: boolean };
  web: { protegido: boolean };
  /** Opcional: un bot anterior a los formularios de anuncios no lo manda. */
  formulariosAnuncios?: { suscrito: boolean; permiso: boolean };
  ia: { configurada: boolean };
  metaHumanAgentAprobado: boolean;
  /**
   * URLs de webhook y verify token para el bloque "copiar" de /admin/canales.
   * Opcional: un bot viejo no lo manda y la página muestra las URLs fijas.
   * El verify token es el único "secreto" que se expone (solo sirve para el
   * handshake de Meta); access token, app secret y PIN NUNCA viajan aquí.
   */
  webhooks?: WebhooksInfo;
};

export type WebhooksInfo = {
  /** `${PUBLIC_BASE_URL}/webhook` */
  whatsapp: string;
  /** `${PUBLIC_BASE_URL}/webhook/meta` */
  meta: string;
  /** WHATSAPP_VERIFY_TOKEN, o null si no está cargado. */
  verifyToken: string | null;
  /** META_VERIFY_TOKEN (cae al de WhatsApp si no está cargado), o null. */
  verifyTokenMeta: string | null;
};

const VENTANA_MS = 24 * 60 * 60_000;
const VENTANA_HUMAN_AGENT_MS = 7 * 24 * 60 * 60_000;
const SIETE_DIAS_MS = 7 * 24 * 60 * 60_000;

/** Una conversación espera respuesta si lo último que llegó fue del cliente. */
export function esperaRespuesta(c: ConversacionResumen): boolean {
  return c.ultimo_rol === "user";
}

/** Meta solo permite texto libre dentro de las 24 h posteriores al último mensaje del cliente. */
export function ventanaAbierta(c: ConversacionResumen, ahora = Date.now()): boolean {
  return ahora - new Date(c.ultimo_mensaje_at).getTime() < VENTANA_MS;
}

export function horasRestantesVentana(c: ConversacionResumen, ahora = Date.now()): number {
  const restante = VENTANA_MS - (ahora - new Date(c.ultimo_mensaje_at).getTime());
  return Math.max(0, Math.floor(restante / 3_600_000));
}

export type EstadoVentana = { abierta: true; modo: "RESPONSE" | "HUMAN_AGENT" } | { abierta: false; motivo: string };

/** Mismo cálculo que `meta/window.ts` del bot: aviso correcto ANTES de intentar enviar. */
export function ventanaMeta(c: ConversacionResumen, humanAgentAprobado: boolean, ahora = Date.now()): EstadoVentana {
  const transcurrido = ahora - new Date(c.ultimo_mensaje_at).getTime();
  if (transcurrido < VENTANA_MS) return { abierta: true, modo: "RESPONSE" };
  if (transcurrido < VENTANA_HUMAN_AGENT_MS) {
    if (humanAgentAprobado) return { abierta: true, modo: "HUMAN_AGENT" };
    return {
      abierta: false,
      motivo:
        "Pasaron más de 24 horas. Se podría responder con la etiqueta Human Agent, pero Meta todavía no aprobó esa función para la app.",
    };
  }
  return { abierta: false, motivo: "Pasaron más de 7 días desde el último mensaje. Ya no se puede retomar por este canal." };
}

/** Meta permite UNA respuesta privada por comentario, hasta 7 días después de creado. */
export function puedeRespuestaPrivada(m: Pick<Mensaje, "created_at" | "metadata">, ahora = Date.now()): boolean {
  if (m.metadata?.respondido_privado) return false;
  return ahora - new Date(m.created_at).getTime() < SIETE_DIAS_MS;
}

/** Cómo llamar a alguien que todavía no dio su nombre. */
export function describirIdentidad(c: ConversacionResumen): string {
  if (c.cliente_nombre?.trim()) return c.cliente_nombre.trim();
  if (c.identidad_nombre?.trim()) return c.identidad_nombre.trim();
  if (c.identidad_username) return `@${c.identidad_username}`;
  if (c.cliente_telefono) return telefonoBonito(c.cliente_telefono);
  return `Contacto de ${CANAL_LABEL[c.canal]}`;
}

/** "525512345678" → "+52 55 1234 5678" */
export function telefonoBonito(telefono: string): string {
  if (/^52\d{10}$/.test(telefono)) {
    const n = telefono.slice(2);
    return `+52 ${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
  }
  return telefono;
}

export function primerNombre(nombre: string | null | undefined): string {
  return nombre?.trim().split(/\s+/)[0] ?? "";
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** "ahora", "5 min", "14:30", "12 sep" — según qué tan vieja sea la actividad. Hora del negocio (Ciudad de México). */
export function tiempoRelativo(iso: string, ahora = Date.now()): string {
  const fecha = new Date(iso);
  const minutos = Math.floor((ahora - fecha.getTime()) / 60_000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `${minutos} min`;
  const hoy = new Date(ahora).toLocaleDateString("en-CA", { timeZone: ZONA_NEGOCIO });
  const dia = fecha.toLocaleDateString("en-CA", { timeZone: ZONA_NEGOCIO });
  if (hoy === dia) return fecha.toLocaleTimeString("es-MX", { timeZone: ZONA_NEGOCIO, hour: "2-digit", minute: "2-digit", hour12: false });
  return fecha.toLocaleDateString("es-MX", { timeZone: ZONA_NEGOCIO, day: "numeric", month: "short" });
}

export function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", { timeZone: ZONA_NEGOCIO, hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Mismo formato que las fichas y el bot: "52" + 10 dígitos. Acepta "55 1234 5678", "+52 55 1234 5678" y el "521" antiguo. */
export function normalizarTelefonoMx(crudo: string): string | null {
  const digitos = crudo.replace(/\D/g, "");
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length === 12 && digitos.startsWith("52")) return digitos;
  if (digitos.length === 13 && digitos.startsWith("521")) return `52${digitos.slice(3)}`;
  return null;
}

/** Clave de localStorage para recordar filtros y conversación abierta. */
export const BANDEJA_STORAGE_KEY = "mm-bandeja-filtros";

/* =====================================================================
   CONTRATOS COMPARTIDOS ENTRE FRENTES (ver _claude-tmp/DISENO-ADMIN-CHATS.md)

   Este es el ÚNICO archivo que importan varios frentes a la vez. Lo
   escribió el diseño de una sola vez: NINGÚN frente lo edita. Si a un
   frente le falta algo, lo define localmente en su propio archivo y lo
   anota en su informe para que el integrador lo suba aquí al final.
   ===================================================================== */

/* ---------- Catálogos que faltaban ---------- */

/** Canales con fila en public.canales (interruptores). "web" no tiene fila. */
export type CanalConfigurable = CanalConfig["canal"];
export const CANALES_CONFIGURABLES: CanalConfigurable[] = ["whatsapp", "messenger", "instagram", "tiktok"];

export const MOTIVOS_CIERRE: MotivoCierre[] = ["ganado", "perdido", "spam", "sin_respuesta", "otro"];

/** En el orden en que se ofrecen en la ficha del contacto. */
export const ESTADOS_CONVERSACION: EstadoConversacion[] = ["activa", "escalada", "cerrada"];
export const ESTADO_CONVERSACION_LABEL: Record<EstadoConversacion, string> = {
  activa: "Atiende el bot",
  escalada: "Atiende una persona",
  cerrada: "Cerrada",
};

export type ClienteTipo = ConversacionResumen["cliente_tipo"];
export const TIPOS_CLIENTE: ClienteTipo[] = ["prospecto", "cliente", "ex_cliente"];
export const TIPO_CLIENTE_LABEL: Record<ClienteTipo, string> = {
  prospecto: "Prospecto",
  cliente: "Cliente",
  ex_cliente: "Ex cliente",
};

/** clientes.interes (check de 0001_nucleo.sql). */
/** Mismo check que `clientes.interes` (supabase/migrations/0005_datos_negocio.sql) y que INTERESES del bot. */
export type Interes = "moto_nueva" | "refacciones" | "accesorios" | "taller" | "otro";
export const INTERESES: Interes[] = ["moto_nueva", "refacciones", "accesorios", "taller", "otro"];
export const INTERES_LABEL: Record<Interes, string> = {
  moto_nueva: "Comprar moto TVS",
  refacciones: "Refacciones",
  accesorios: "Accesorios",
  taller: "Taller / servicio",
  otro: "Otro",
};

/** Lo que cuenta el cliente: compra, refacciones o taller (clientes.perfil, lo escribe guardar_perfil_compra). Todo opcional. */
export type PerfilCompra = {
  moto?: string;
  uso?: string;
  presupuesto?: string;
  enganche?: string;
  pago?: string;
  plazo?: string;
  ubicacion?: string;
  vehiculo?: string;
  solicitud?: string;
  kilometraje?: string;
  horario_visita?: string;
  notas?: string;
};

/* ---------- Filas que lee la ficha del contacto (frente B) ---------- */

/** public.cliente_identidades */
export type ClienteIdentidad = {
  id: string;
  cliente_id: string;
  canal: CanalConfigurable;
  tipo: "wa_id" | "psid" | "igsid" | "fb_comment_user" | "ig_comment_user" | "tt_user" | "tt_comment_user";
  external_id: string;
  cuenta_id: string | null;
  nombre_perfil: string | null;
  username: string | null;
  foto_url: string | null;
  created_at: string;
  updated_at: string;
};

/** public.eventos_conversacion */
export type TipoEventoConversacion =
  | "asignacion"
  | "etapa"
  | "estado"
  | "cierre"
  | "fusion"
  | "respuesta_privada"
  | "escalada"
  | "documento"
  | "visita";

export type EventoConversacion = {
  id: string;
  conversacion_id: string;
  tipo: TipoEventoConversacion;
  actor_id: string | null;
  detalle: Record<string, unknown>;
  created_at: string;
};

/** Columnas de public.clientes que la ficha lee y edita (select explícito). */
export type ClienteFicha = {
  id: string;
  telefono: string | null;
  nombre: string | null;
  email: string | null;
  notas: string | null;
  perfil: PerfilCompra;
  canal_origen: string;
  tipo: ClienteTipo;
  interes: Interes | null;
  created_at: string;
};

/* ---------- Bandeja (frentes A, C y F) ---------- */

/** Cuántas conversaciones trae la carga inicial y cada recarga: las más recientes por actividad. */
export const LIMITE_BANDEJA = 200;

/** Lo que la página servidor carga de una vez y le pasa a <Bandeja inicial={…}>. */
export type DatosBandeja = {
  conversaciones: ConversacionResumen[];
  etiquetas: Etiqueta[];
  clienteEtiquetas: ClienteEtiqueta[];
  staff: StaffMiembro[];
  respuestasRapidas: RespuestaRapida[];
  plantillas: PlantillaMedia[];
};

/**
 * "panel": /admin/chats — tres columnas en ≥lg (lista | hilo | ficha), apilado en móvil.
 * "app":   /app/chats — siempre apilado (lista → hilo → ficha a pantalla completa).
 */
export type ModoBandeja = "panel" | "app";

export type BandejaProps = {
  usuarioId: string;
  modo: ModoBandeja;
  inicial: DatosBandeja;
  /** Filtro de estado la primera vez (sin filtros guardados): un vendedor entra viendo sus chats («Mías»). */
  estadoPorDefecto?: FiltroEstadoBandeja;
};

export type FiltroCanalBandeja = "todas" | Canal | "comentarios";
export type FiltroEstadoBandeja = "todas" | "sin_responder" | "mias" | "sin_asignar" | "escaladas" | "cerradas";
export type FiltroEtapaBandeja = "todas" | Etapa;

export const FILTROS_CANAL_BANDEJA: { id: FiltroCanalBandeja; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "messenger", label: "Messenger" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "web", label: "Web" },
  { id: "comentarios", label: "Comentarios" },
];

export const FILTROS_ESTADO_BANDEJA: { id: FiltroEstadoBandeja; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "sin_responder", label: "Sin responder" },
  { id: "mias", label: "Mías" },
  { id: "sin_asignar", label: "Sin asignar" },
  { id: "escaladas", label: "Con persona" },
  { id: "cerradas", label: "Cerradas" },
];

/** Lo que se guarda en localStorage bajo BANDEJA_STORAGE_KEY. */
export type FiltrosBandejaGuardados = {
  canal: FiltroCanalBandeja;
  estado: FiltroEstadoBandeja;
  etapa: FiltroEtapaBandeja;
  seleccionadaId: string | null;
};

/** Props de la ficha del contacto (components/admin/chats/ClientPanel.tsx). */
export type ClientPanelProps = {
  conversacion: ConversacionResumen;
  etiquetas: Etiqueta[];
  etiquetasCliente: Etiqueta[];
  staff: StaffMiembro[];
  usuarioId: string;
  /** Saltar a otra conversación (p. ej. el chat de WhatsApp del mismo contacto). */
  onAbrirConversacion: (id: string) => void;
  /** Si viene, la ficha se muestra como pantalla propia (móvil) con flecha para volver. */
  onVolver?: () => void;
  className?: string;
};

/* ---------- Avisos (frente E) y navegación hacia un chat ---------- */

/** Parámetro de URL con el que un aviso abre un chat: /admin/chats?c=<id> y /app/chats?c=<id>. */
export const CHAT_QUERY_PARAM = "c";
export const RUTA_CHATS_PANEL = "/admin/chats";
export const RUTA_CHATS_APP = "/app/chats";

/** localStorage: "1" = toasts + Notification + sonido activados por el staff. */
export const AVISOS_STORAGE_KEY = "mm-avisos-activos";

export type DestinoAvisos = "panel" | "app";

/** Lo que devuelve useAvisos() (components/admin/chats/Avisos.tsx). */
export type AvisosApi = {
  /** Conversaciones con ultimo_rol = 'user' y estado <> 'cerrada'. Siempre se calcula. */
  sinResponder: number;
  /** Si el staff prendió toasts + Notification + sonido (persistido en AVISOS_STORAGE_KEY). */
  avisosActivos: boolean;
  activar: () => void;
  desactivar: () => void;
  /** Navega a RUTA_CHATS_PANEL o RUTA_CHATS_APP (según `destino` del provider) con ?c=<id>. */
  abrirConversacion: (conversacionId: string) => void;
};

/* ---------- Canales (frente D) ---------- */

/** URL pública del bot: se usa en el bloque "copiar" cuando el bot no responde. */
export const BOT_PUBLIC_URL = process.env.NEXT_PUBLIC_BOT_API_URL ?? "https://TU-BOT.up.railway.app";

export type CanalesProps = {
  /** Filas de public.canales en el orden de CANALES_CONFIGURABLES. */
  inicial: CanalConfig[];
};

