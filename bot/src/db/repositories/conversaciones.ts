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
 * Solo avanza (lo garantizan triggers de Postgres): nuevo < en_atencion <
 * calificado < agendado < propuesta < cerrado. `propuesta` la pone el staff a
 * mano cuando manda una cotización formal; el bot no la toca.
 */
export type EtapaConversacion = "nuevo" | "en_atencion" | "calificado" | "agendado" | "propuesta" | "cerrado";
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
  /** Solo con etapa 'cerrado'. Cerrar como 'ganado' pasa al contacto a `clientes.tipo = 'cliente'` (trigger). */
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
