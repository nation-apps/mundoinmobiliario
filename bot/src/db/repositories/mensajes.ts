import { supabase } from "../client.js";

/**
 * 'humano' es un mensaje escrito por el staff desde el panel admin. Para
 * Claude cuenta como turno de assistant (ver mapRolParaClaude): desde la
 * perspectiva del cliente ambos son "el negocio respondiendo".
 */
export type RolMensaje = "user" | "assistant" | "humano";

/**
 * 'nota' es interna del staff: nunca se envía y nunca la ve Claude. 'sistema'
 * es un evento legible dentro del hilo (p. ej. "Respuesta privada enviada").
 * 'mensaje' y 'comentario' son lo que llega o sale por un canal real.
 */
export type TipoMensaje = "mensaje" | "comentario" | "nota" | "sistema";

export type TipoMediaMensaje = "image" | "video" | "audio" | "document";

export type MensajeMetadata = Record<string, unknown>;

export type Mensaje = {
  id: string;
  conversacion_id: string;
  rol: RolMensaje;
  tipo: TipoMensaje;
  contenido: string;
  /** mid de Messenger/Instagram, id del comentario, o el wa_message_id de WhatsApp. */
  external_id: string | null;
  /** Se conserva por compatibilidad; el código nuevo lee external_id. */
  wa_message_id: string | null;
  /** Quién lo escribió desde el panel. Null si lo escribió el bot o llegó del cliente. */
  autor_id: string | null;
  media_url: string | null;
  /**
   * Ruta DENTRO del bucket privado `adjuntos` ("{conversacion_id}/{timestamp}.{ext}"):
   * archivos que mandó el cliente por WhatsApp, Messenger o Instagram. El
   * panel los abre con una URL firmada, nunca pública.
   */
  media_path: string | null;
  media_type: TipoMediaMensaje | null;
  metadata: MensajeMetadata;
  error_entrega: string | null;
  created_at: string;
};

/**
 * ¿La persona llegó a recibir este mensaje? Los del bot o del equipo que fallaron al enviarse (error_entrega) no se
 * los vio nadie: no deben contarse como dichos cuando el modelo repasa la conversación.
 */
export function fueEntregado(m: Pick<Mensaje, "rol" | "error_entrega">): boolean {
  return m.rol === "user" || !m.error_entrega;
}

export function mapRolParaClaude(rol: RolMensaje): "user" | "assistant" {
  return rol === "user" ? "user" : "assistant";
}

export async function guardarMensaje(params: {
  conversacionId: string;
  rol: RolMensaje;
  contenido: string;
  tipo?: TipoMensaje;
  externalId?: string;
  waMessageId?: string;
  autorId?: string;
  mediaUrl?: string;
  mediaPath?: string;
  mediaType?: TipoMediaMensaje;
  metadata?: MensajeMetadata;
  /** Se guarda junto con el mensaje cuando ya se sabe, al momento de insertarlo, que el envío falló o no se intentó. */
  errorEntrega?: string;
}): Promise<Mensaje> {
  const { data, error } = await supabase
    .from("mensajes")
    .insert({
      conversacion_id: params.conversacionId,
      rol: params.rol,
      tipo: params.tipo ?? "mensaje",
      contenido: params.contenido,
      // El de WhatsApp escribe las dos columnas; los canales nuevos solo external_id.
      external_id: params.externalId ?? params.waMessageId ?? null,
      wa_message_id: params.waMessageId ?? null,
      autor_id: params.autorId ?? null,
      media_url: params.mediaUrl ?? null,
      media_path: params.mediaPath ?? null,
      media_type: params.mediaType ?? null,
      error_entrega: params.errorEntrega?.slice(0, 500) ?? null,
      ...(params.metadata ? { metadata: params.metadata } : {}),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Mensaje;
}

/**
 * Une el mensaje ya guardado con el id que Meta asignó al aceptar el envío
 * (se guarda aparte porque el mensaje se inserta ANTES de intentar mandarlo,
 * así que el id llega después). Escribe `external_id` — `wa_message_id`
 * queda igual que estaba, la columna vieja no se toca acá.
 */
export async function marcarExternalId(mensajeId: string, externalId: string): Promise<void> {
  const { error } = await supabase.from("mensajes").update({ external_id: externalId }).eq("id", mensajeId);
  if (error) throw error;
}

/**
 * Meta a veces acepta un envío (200 OK, wa_message_id asignado) y recién
 * falla después al no poder descargarlo o entregarlo — ese fallo llega
 * como un evento "failed" aparte en el webhook de statuses. Sin esto, el
 * mensaje queda en el panel como "enviado" aunque nunca le llegó nada al
 * cliente.
 */
export async function marcarMensajeFallido(waMessageId: string, error: string): Promise<void> {
  const { error: dbError } = await supabase
    .from("mensajes")
    .update({ error_entrega: error.slice(0, 500) })
    .eq("wa_message_id", waMessageId);
  if (dbError) throw dbError;
}

/**
 * Fusiona `patch` dentro del `metadata` del mensaje que tiene ese
 * `external_id` — se usa para marcar un comentario como eliminado o como
 * "ya se le respondió por privado" sin tener que guardar el mensaje de
 * nuevo. Si no hay ningún mensaje con ese external_id (el evento llegó antes
 * de que se guardara, o nunca se guardó), no hace nada — no hay nada que
 * actualizar y no es un error real.
 */
export async function actualizarMetadataPorExternalId(externalId: string, patch: MensajeMetadata): Promise<void> {
  const { data, error } = await supabase.from("mensajes").select("id, metadata").eq("external_id", externalId).maybeSingle();
  if (error) throw error;
  if (!data) return;

  const metadataActual = (data as { metadata: MensajeMetadata }).metadata ?? {};
  const { error: updateError } = await supabase
    .from("mensajes")
    .update({ metadata: { ...metadataActual, ...patch } })
    .eq("id", (data as { id: string }).id);
  if (updateError) throw updateError;
}

/**
 * true si `externalId` ya existe en `mensajes` — el dedupe persistente que
 * reemplaza al Map en memoria de webhook.ts para los canales nuevos (ese Map
 * no sobrevive un reinicio ni sirve con más de una instancia). El insert real
 * es responsabilidad de quien llama: acá solo se consulta.
 */
export async function existeExternalId(externalId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("mensajes")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function getMensajeById(id: string): Promise<Mensaje | null> {
  const { data, error } = await supabase.from("mensajes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Mensaje | null;
}

/**
 * Últimos N mensajes de una conversación, o de las últimas `sinceHours` horas,
 * lo que sea menor. Excluye notas internas y eventos de sistema: ninguno de
 * los dos es algo que el cliente haya visto o a lo que el bot deba "recordar"
 * haber dicho — Claude nunca los debe ver en el historial.
 */
export async function getHistorialReciente(
  conversacionId: string,
  maxMensajes = 20,
  sinceHours = 24,
): Promise<Mensaje[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("mensajes")
    .select("*")
    .eq("conversacion_id", conversacionId)
    .in("tipo", ["mensaje", "comentario"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(maxMensajes);
  if (error) throw error;
  return ((data ?? []) as Mensaje[]).reverse();
}

/**
 * ¿La persona escribió algo DESPUÉS de este momento? Sirve para no contestar dos veces cuando manda varios mensajes
 * seguidos ("Maquilladora" y un segundo después "Estilista"): el turno del último mensaje ya ve todo el historial.
 * Si la consulta falla, se responde igual: mejor una respuesta de más que ninguna.
 */
export async function hayMensajeNuevoDeLaPersona(conversacionId: string, despuesDe: string): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from("mensajes")
      .select("id", { count: "exact", head: true })
      .eq("conversacion_id", conversacionId)
      .eq("rol", "user")
      .eq("tipo", "mensaje")
      .gt("created_at", despuesDe);
    if (error) throw error;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Una respuesta del bot que no le llegó a la persona, con lo necesario para reenviarla. */
export type RespuestaSinEntregar = {
  id: string;
  conversacionId: string;
  contenido: string;
  creadoAt: string;
  metadata: MensajeMetadata;
  telefono: string;
  /** Último mensaje de la PERSONA: de él depende la ventana de 24 h de WhatsApp. */
  ultimoMensajeAt: string;
};

/**
 * Respuestas del bot por WhatsApp que fallaron al enviarse en las últimas horas, de conversaciones activas.
 * Se descartan las que fallaron por la ventana de 24 h (reenviarlas no sirve: solo una plantilla puede romperla).
 */
export async function listarRespuestasSinEntregar(desdeIso: string, limite = 50): Promise<RespuestaSinEntregar[]> {
  const { data, error } = await supabase
    .from("mensajes")
    .select("id, conversacion_id, contenido, metadata, created_at, conversaciones!inner(canal, estado, ultimo_mensaje_at, clientes!inner(telefono))")
    .eq("rol", "assistant")
    .eq("tipo", "mensaje")
    .not("error_entrega", "is", null)
    .not("error_entrega", "ilike", "%24 horas%")
    .gte("created_at", desdeIso)
    .eq("conversaciones.canal", "whatsapp")
    .eq("conversaciones.estado", "activa")
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error) throw error;

  type Fila = {
    id: string;
    conversacion_id: string;
    contenido: string;
    metadata: MensajeMetadata | null;
    created_at: string;
    conversaciones: {
      ultimo_mensaje_at: string;
      clientes: { telefono: string | null } | { telefono: string | null }[];
    } | { ultimo_mensaje_at: string; clientes: { telefono: string | null } | { telefono: string | null }[] }[];
  };
  const salida: RespuestaSinEntregar[] = [];
  for (const fila of (data ?? []) as unknown as Fila[]) {
    const conv = Array.isArray(fila.conversaciones) ? fila.conversaciones[0] : fila.conversaciones;
    const cliente = conv && (Array.isArray(conv.clientes) ? conv.clientes[0] : conv.clientes);
    if (!conv || !cliente?.telefono) continue;
    salida.push({
      id: fila.id,
      conversacionId: fila.conversacion_id,
      contenido: fila.contenido,
      creadoAt: fila.created_at,
      metadata: fila.metadata ?? {},
      telefono: cliente.telefono,
      ultimoMensajeAt: conv.ultimo_mensaje_at,
    });
  }
  return salida;
}

/** ¿Hay algún mensaje (de quien sea) en la conversación posterior a este momento? */
export async function hayMensajesPosteriores(conversacionId: string, despuesDe: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("mensajes")
    .select("id", { count: "exact", head: true })
    .eq("conversacion_id", conversacionId)
    .gt("created_at", despuesDe);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Anota un intento de reenvío. Si salió bien (`externalId`), el mensaje deja de figurar como no entregado. */
export async function registrarReenvio(
  mensajeId: string,
  params: { metadata: MensajeMetadata; externalId?: string; nuevoError?: string },
): Promise<void> {
  const cambios: Record<string, unknown> = { metadata: params.metadata };
  if (params.externalId) {
    cambios.error_entrega = null;
    cambios.external_id = params.externalId;
    cambios.wa_message_id = params.externalId;
  } else if (params.nuevoError) {
    cambios.error_entrega = params.nuevoError.slice(0, 500);
  }
  const { error } = await supabase.from("mensajes").update(cambios).eq("id", mensajeId);
  if (error) throw error;
}

/** ¿Ya se le mandó este archivo (misma URL) a esta conversación en las últimas `horas`? */
export async function yaSeEnvioMedia(conversacionId: string, mediaUrl: string, horas = 24): Promise<boolean> {
  const desde = new Date(Date.now() - horas * 60 * 60_000).toISOString();
  const { count, error } = await supabase
    .from("mensajes")
    .select("id", { count: "exact", head: true })
    .eq("conversacion_id", conversacionId)
    .eq("media_url", mediaUrl)
    .in("rol", ["assistant", "humano"])
    .gte("created_at", desde);
  if (error) throw error;
  return (count ?? 0) > 0;
}
