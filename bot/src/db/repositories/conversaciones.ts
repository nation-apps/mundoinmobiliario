import { env } from "../../config/env.js";
import { supabase } from "../client.js";
import { fuentePorCanal } from "../../lib/fuente.js";

/**
 * `web` es el formulario de contacto del sitio (POST /public/leads): llega a la
 * bandeja como cualquier otra conversación, pero no admite respuesta directa
 * — el staff le escribe por WhatsApp (ver canales/sinRespuesta.ts).
 */
export type CanalConversacion = "whatsapp" | "messenger" | "instagram" | "tiktok" | "web";
/** `formulario` solo existe en el canal `web`. */
export type OrigenConversacion = "dm" | "comentario" | "formulario";
export type EstadoConversacion = "activa" | "escalada" | "cerrada";
/**
 * Proceso comercial (supabase/migrations/0009_proceso_comercial.sql). La mueve el equipo desde el panel; los triggers
 * solo pasan Prospección → Seguimiento cuando responde una persona y No contesta → Seguimiento cuando el cliente
 * vuelve a escribir. `vendido` y `no_vendido` van siempre con `estado = 'cerrada'`.
 */
export type EtapaConversacion = "prospeccion" | "no_contesta" | "seguimiento" | "oportunidad" | "por_apartar" | "vendido" | "no_vendido";
export type MotivoCierre = "ganado" | "perdido" | "spam" | "sin_respuesta" | "otro";

export type Conversacion = {
  id: string;
  cliente_id: string;
  canal: CanalConversacion;
  origen: OrigenConversacion;
  identidad_id: string | null;
  hilo_externo: string | null;
  cuenta_id: string | null;
  ultimo_mensaje_at: string;
  ultimo_comentario_at: string | null;
  /** Quién responde: 'activa' el bot, 'escalada' una persona, 'cerrada' nadie. */
  estado: EstadoConversacion;
  /** En qué punto va el lead. Lo mueven triggers de Postgres, no este código. */
  etapa: EtapaConversacion;
  /** Solo con etapa 'vendido' o 'no_vendido'. Cerrar como 'ganado' pasa al contacto a `clientes.tipo = 'cliente'` (trigger). */
  motivo_cierre: MotivoCierre | null;
  asignada_a: string | null;
  /** De dónde vino («Campaña Formulario Meta TVS», «WhatsApp directo»…): lib/fuente.ts. */
  fuente: string | null;
  created_at: string;
};

/** Una conversación sigue "abierta" mientras no se archive, la atienda el bot o una persona. */
const ESTADOS_ABIERTOS: EstadoConversacion[] = ["activa", "escalada"];

/**
 * Reutiliza la conversación ABIERTA del cliente en ese canal e hilo; solo crea
 * una nueva si la última quedó cerrada.
 *
 * Antes buscaba únicamente estado='activa', y ese detalle anulaba por completo
 * la intervención humana: en cuanto una conversación pasaba a 'escalada', el
 * siguiente mensaje del cliente no la encontraba, se creaba una conversación
 * nueva en 'activa', y el bot volvía a responder por encima de la persona que
 * ya estaba atendiendo. El `if (conversacion.estado === "escalada")` de
 * handleMessage.ts nunca llegaba a cumplirse.
 *
 * El hilo distingue los comentarios: los de una misma persona sobre una misma
 * publicación son una conversación, y sus DMs son otra.
 */
export async function getOrCreateConversacionAbierta(params: {
  clienteId: string;
  canal?: CanalConversacion;
  origen?: OrigenConversacion;
  identidadId?: string | null;
  hiloExterno?: string | null;
  cuentaId?: string | null;
  /**
   * Solo al CREAR. La columna vale now() por defecto, que es correcto cuando
   * la conversación nace de un mensaje entrante; pero si la abre el equipo
   * (primer contacto por WhatsApp a un lead web), "now" haría creer que la
   * ventana de 24h está abierta y el siguiente texto libre rebotaría en Meta.
   */
  ultimoMensajeAt?: string;
  /** Solo al CREAR: el «origen» del lead. Sin él se deduce del canal (lib/fuente.ts → fuentePorCanal). */
  fuente?: string | null;
}): Promise<Conversacion> {
  const canal = params.canal ?? "whatsapp";
  const origen = params.origen ?? "dm";
  const hiloExterno = params.hiloExterno ?? null;

  const buscar = () => {
    const query = supabase
      .from("conversaciones")
      .select("*")
      .eq("cliente_id", params.clienteId)
      .eq("canal", canal)
      .eq("origen", origen)
      .in("estado", ESTADOS_ABIERTOS)
      .order("ultimo_mensaje_at", { ascending: false })
      .limit(1);
    return hiloExterno === null ? query.is("hilo_externo", null) : query.eq("hilo_externo", hiloExterno);
  };

  const { data: existente, error: findError } = await buscar().maybeSingle();
  if (findError) throw findError;
  if (existente) return existente as Conversacion;

  const { data: creada, error: insertError } = await supabase
    .from("conversaciones")
    .insert({
      cliente_id: params.clienteId,
      canal,
      origen,
      identidad_id: params.identidadId ?? null,
      hilo_externo: hiloExterno,
      cuenta_id: params.cuentaId ?? null,
      fuente: params.fuente ?? fuentePorCanal(canal, origen, hiloExterno),
      // Por defecto la atiende una persona; el bot solo entra si alguien mueve el interruptor Bot/Yo (o BOT_ACTIVO_POR_DEFECTO=true).
      estado: env.BOT_ACTIVO_POR_DEFECTO ? "activa" : "escalada",
      ...(params.ultimoMensajeAt ? { ultimo_mensaje_at: params.ultimoMensajeAt } : {}),
    })
    .select("*")
    .single();

  if (insertError) {
    // 23505 = unique_violation contra el índice parcial (identidad, hilo) de
    // 0002_omnicanal.sql: dos mensajes de la misma persona llegaron casi a la
    // vez y ambos intentaron abrir la conversación. El que perdió la carrera
    // relee la que acaba de crear el otro, igual que findOrCreateByPhone().
    if (insertError.code === "23505") {
      const { data: reintento, error: retryError } = await buscar().maybeSingle();
      if (retryError) throw retryError;
      if (reintento) return reintento as Conversacion;
    }
    throw insertError;
  }
  return creada as Conversacion;
}

/**
 * Una persona del equipo respondió a mano (desde el panel o desde Meta Business Suite): el chat pasa a «Yo»
 * (`escalada`) para que el bot no le hable encima. Solo si lo tenía el bot; una cerrada no se reabre.
 */
export async function pasarAPersona(conversacionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversaciones")
    .update({ estado: "escalada" })
    .eq("id", conversacionId)
    .eq("estado", "activa")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Cambia el «origen» de una conversación ya abierta: alguien que escribía directo y ahora llega por un anuncio de
 * WhatsApp pasa a contar para esa campaña. El primer contacto del cliente (`clientes.fuente`) no cambia.
 */
export async function actualizarFuenteConversacion(conversacionId: string, fuente: string): Promise<void> {
  const { error } = await supabase.from("conversaciones").update({ fuente }).eq("id", conversacionId);
  if (error) throw error;
}

/**
 * Marca la conversación como escalada y devuelve el nombre de quien la tiene
 * asignada (lo pone el reparto automático de 0004_reparto_leads.sql), para
 * que el aviso al equipo diga a quién le toca.
 */
export async function escalarConversacion(conversacionId: string): Promise<{ asignadaNombre: string | null }> {
  const { data, error } = await supabase
    .from("conversaciones")
    .update({ estado: "escalada" })
    .eq("id", conversacionId)
    .select("asignada_a")
    .maybeSingle();
  if (error) throw error;
  const asignadaA = (data as { asignada_a: string | null } | null)?.asignada_a ?? null;
  if (!asignadaA) return { asignadaNombre: null };
  const { data: staff } = await supabase.from("staff").select("nombre").eq("user_id", asignadaA).maybeSingle();
  return { asignadaNombre: (staff as { nombre: string } | null)?.nombre ?? null };
}

export type ConversacionConDestino = {
  conversacion: Conversacion;
  /** El id al que hay que mandarle el mensaje: teléfono en WhatsApp, PSID/IGSID en Meta. */
  destinatarioId: string | null;
  clienteId: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
};

/**
 * Conversación + a quién hay que escribirle, en una sola consulta — la usa
 * `/admin/mensajes` (multicanal) para no tener que resolver el destinatario
 * distinto según el canal en cada llamada. En Messenger/Instagram/TikTok la
 * fuente es `cliente_identidades.external_id`; en WhatsApp y en `web` la
 * conversación no suele tener `identidad_id` y el destinatario es el teléfono
 * del cliente (el `?? clienteTelefono`).
 */
export async function getConversacionConDestino(conversacionId: string): Promise<ConversacionConDestino | null> {
  const { data, error } = await supabase
    .from("conversaciones")
    .select("*, clientes!inner(id, nombre, telefono), cliente_identidades(external_id)")
    .eq("id", conversacionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as Conversacion & {
    clientes: { id: string; nombre: string | null; telefono: string | null };
    cliente_identidades: { external_id: string } | null;
  };
  const { clientes, cliente_identidades, ...conversacion } = row;

  return {
    conversacion: conversacion as Conversacion,
    destinatarioId: cliente_identidades?.external_id ?? clientes.telefono,
    clienteId: clientes.id,
    clienteNombre: clientes.nombre,
    clienteTelefono: clientes.telefono,
  };
}

/** Una conversación por su id, sin juntar nada más. Null si ya no existe. */
export async function leerConversacion(conversacionId: string): Promise<Conversacion | null> {
  const { data, error } = await supabase.from("conversaciones").select("*").eq("id", conversacionId).maybeSingle();
  if (error) throw error;
  return (data as Conversacion | null) ?? null;
}

/** ¿Este cliente ya tiene una conversación de WhatsApp abierta? (ya está hablando con nosotros por ahí) */
export async function tieneConversacionWhatsappAbierta(clienteId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("canal", "whatsapp")
    .in("estado", ESTADOS_ABIERTOS)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Un lead de formulario al que se le acaba de escribir por WhatsApp deja de ser una conversación «web» y pasa a ser la
 * conversación de WhatsApp de esa persona: así sus respuestas caen en el mismo hilo, el asesor ve las respuestas del
 * formulario y el primer mensaje juntos, y no hay dos tarjetas por lead. Conserva su origen («Campaña Formulario Meta …»).
 * Devuelve false si no se pudo (p. ej. si la persona ya tenía otra conversación de WhatsApp abierta).
 */
export async function convertirEnWhatsapp(conversacionId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversaciones")
    .update({ canal: "whatsapp", origen: "dm", hilo_externo: null, cuenta_id: null })
    .eq("id", conversacionId)
    .eq("canal", "web")
    .select("id");
  if (error) {
    if (error.code === "23505") return false;
    throw error;
  }
  return (data ?? []).length > 0;
}

/** La conversación de WhatsApp abierta de este cliente, si la hay (la más reciente). */
export async function conversacionWhatsappAbierta(clienteId: string): Promise<Conversacion | null> {
  const { data, error } = await supabase
    .from("conversaciones")
    .select("*")
    .eq("cliente_id", clienteId)
    .eq("canal", "whatsapp")
    .in("estado", ESTADOS_ABIERTOS)
    .order("ultimo_mensaje_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as Conversacion | undefined) ?? null;
}

/**
 * Quien llenó un formulario (de anuncios o del sitio) y luego le escribe a la línea de WhatsApp —o a quien el equipo le
 * escribe primero— es UN lead, no dos: el registro del formulario se convierte en su conversación de WhatsApp y conserva
 * su origen de campaña. Solo si no tiene ya otra conversación de WhatsApp abierta. Devuelve el id de la convertida.
 */
export async function unirFormularioConWhatsapp(clienteId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("canal", "web")
    .eq("origen", "formulario")
    .in("estado", ESTADOS_ABIERTOS)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const formulario = (data ?? [])[0] as { id: string } | undefined;
  if (!formulario) return null;
  if (await tieneConversacionWhatsappAbierta(clienteId)) return null;
  return (await convertirEnWhatsapp(formulario.id)) ? formulario.id : null;
}
