import { logger } from "../lib/logger.js";
import { resolverIdentidad, vincularIdentidadMensajeria, type TipoIdentidad, type TipoIdentidadDm } from "../meta/identidades.js";
import { getOrCreateConversacionAbierta } from "../db/repositories/conversaciones.js";
import { guardarMensaje, actualizarMetadataPorExternalId } from "../db/repositories/mensajes.js";
import { getCanalConfig } from "../db/repositories/canales.js";
import { registrarEvento } from "../db/repositories/eventos.js";
import { responderComentarioPrivado } from "../meta/client.js";
import { elegirRespuestaPrivada } from "./respuestaPrivada.js";
import type { EventoMeta } from "../meta/parser.js";

/** Canales con comentarios públicos que entran a la bandeja. */
export type CanalComentario = "messenger" | "instagram" | "tiktok";

type ComentarioMeta = Extract<EventoMeta, { kind: "comentario_nuevo" | "comentario_eliminado" }>;

/**
 * El mismo evento que produce meta/parser.ts, pero con el canal abierto a
 * TikTok: su módulo arma este shape con lo que le llega y entra por este
 * mismo pipeline (guías por palabra clave incluidas), sin duplicarlo.
 */
export type EventoComentario = ComentarioMeta extends infer E
  ? E extends ComentarioMeta
    ? Omit<E, "canal"> & { canal: CanalComentario }
    : never
  : never;

const TIPO_IDENTIDAD_COMENTARIO: Record<CanalComentario, TipoIdentidad> = {
  messenger: "fb_comment_user",
  instagram: "ig_comment_user",
  tiktok: "tt_comment_user",
};

const TIPO_IDENTIDAD_DM: Record<CanalComentario, TipoIdentidadDm> = {
  messenger: "psid",
  instagram: "igsid",
  tiktok: "tt_user",
};

type ResponderPrivado = (params: { commentId: string; texto: string }) => Promise<{ messageId: string; recipientId: string }>;

/**
 * Cómo se contesta por privado a quien comentó, por canal. `recipientId` es la
 * identidad de DM de esa persona — lo que permite abrirle una conversación
 * privada ligada a su ficha. Un canal sin entrada acá guarda el comentario en
 * la bandeja pero no manda respuesta automática: así queda TikTok hasta que su
 * módulo registre la suya.
 */
const RESPONDER_PRIVADO: Partial<Record<CanalComentario, ResponderPrivado>> = {
  messenger: (p) => responderComentarioPrivado({ canal: "messenger", ...p }),
  instagram: (p) => responderComentarioPrivado({ canal: "instagram", ...p }),
};

/**
 * Para un canal SIN respuesta privada (TikTok en Perú: la API no la permite),
 * la guía pedida se entrega respondiendo el comentario en público. Lo pasa
 * quien llama (tiktok/comentarios.ts) en vez de importarse acá, para que este
 * pipeline no dependa del módulo de TikTok. Devuelve null cuando decide no
 * responder (tope anti-spam): no es un error, el comentario queda en la bandeja.
 */
export type ResponderEnPublico = (params: {
  commentId: string;
  hiloExterno: string | null;
  guia: string;
}) => Promise<{ commentId: string; texto: string } | null>;

export type OpcionesComentario = { responderEnPublico?: ResponderEnPublico };

async function entregarGuiaEnPublico(params: {
  evento: Extract<EventoComentario, { kind: "comentario_nuevo" }>;
  conversacionId: string;
  guia: string;
  responder: ResponderEnPublico;
}): Promise<void> {
  const { evento, conversacionId, guia } = params;
  try {
    const resultado = await params.responder({ commentId: evento.externalId, hiloExterno: evento.hiloExterno, guia });
    if (!resultado) return;

    // Igual que una respuesta pública desde el panel: queda en el mismo hilo,
    // y su external_id es lo que evita procesarla como comentario nuevo
    // cuando el webhook de la plataforma avise que se publicó.
    await guardarMensaje({
      conversacionId,
      rol: "assistant",
      tipo: "comentario",
      contenido: resultado.texto,
      ...(resultado.commentId ? { externalId: resultado.commentId } : {}),
      metadata: { parent_id: evento.externalId, ...(evento.hiloExterno ? { media_id: evento.hiloExterno } : {}) },
    });
    await actualizarMetadataPorExternalId(evento.externalId, { respondido_publico: true, guia_enviada: guia });
    // Mismo tipo de evento que la respuesta privada (el check de
    // eventos_conversacion.tipo no tiene uno "público"); `modo` lo distingue.
    await registrarEvento(conversacionId, "respuesta_privada", { comment_id: evento.externalId, guia, modo: "publica" }).catch(
      (err: unknown) => logger.error({ err }, "No se pudo registrar el evento de respuesta pública"),
    );
  } catch (err) {
    logger.error({ err, externalId: evento.externalId, canal: evento.canal }, "No se pudo responder en público con la guía");
  }
}

/**
 * Un comentario de una persona en una publicación de Facebook, Instagram o
 * TikTok. No abre la ventana de DM (eso solo lo hace un mensaje directo) — la
 * única forma de escribirle por privado a quien solo comentó es la respuesta
 * privada automática de acá abajo, o la manual desde el panel
 * (`POST /admin/comentarios/:id/responder`).
 */
export async function handleComentario(evento: EventoComentario, opciones: OpcionesComentario = {}): Promise<void> {
  if (evento.kind === "comentario_eliminado") {
    // No se borra el mensaje: queda como rastro, solo marcado.
    await actualizarMetadataPorExternalId(evento.externalId, { eliminado: true }).catch((err: unknown) =>
      logger.error({ err, externalId: evento.externalId }, "No se pudo marcar el comentario como eliminado"),
    );
    return;
  }

  if (!evento.remitenteId) {
    // No siempre llega el autor de un comentario (perfil restringido, o la
    // plataforma simplemente no lo incluye). Sin remitente no hay a quién
    // atribuírselo ni con quién abrir conversación — se deja registrado en el
    // log y nada más, en vez de inventar una identidad.
    logger.warn({ externalId: evento.externalId, canal: evento.canal }, "Comentario sin remitente, se ignora");
    return;
  }

  const { cliente, identidad } = await resolverIdentidad({
    canal: evento.canal,
    tipo: TIPO_IDENTIDAD_COMENTARIO[evento.canal],
    externalId: evento.remitenteId,
    cuentaId: evento.cuentaId,
    // Facebook trae nombre y apellido; Instagram y TikTok, el @usuario.
    nombreConocido: evento.canal === "messenger" ? evento.nombrePerfil : null,
    usernameConocido: evento.canal === "messenger" ? null : evento.nombrePerfil,
  });

  const conversacion = await getOrCreateConversacionAbierta({
    clienteId: cliente.id,
    canal: evento.canal,
    origen: "comentario",
    identidadId: identidad.id,
    cuentaId: evento.cuentaId,
    hiloExterno: evento.hiloExterno,
  });

  await guardarMensaje({
    conversacionId: conversacion.id,
    rol: "user",
    tipo: "comentario",
    contenido: evento.texto,
    externalId: evento.externalId,
    metadata: {
      ...(evento.hiloExterno ? { [evento.canal === "messenger" ? "post_id" : "media_id"]: evento.hiloExterno } : {}),
      ...(evento.parentId ? { parent_id: evento.parentId } : {}),
    },
  });

  const canalConfig = await getCanalConfig(evento.canal);
  // Solo al comentario original (no a una respuesta anidada) y solo con el
  // interruptor encendido de verdad — apagado por defecto porque Meta solo
  // deja UNA respuesta privada por comentario: gastarla con un texto mal
  // configurado no tiene vuelta atrás. Si el comentario pide una guía (la
  // palabra clave del final de un video), la respuesta es el enlace a esa guía;
  // si no, el texto fijo del canal. La decisión vive en respuestaPrivada.ts.
  const respuesta = elegirRespuestaPrivada({ texto: evento.texto, parentId: evento.parentId, config: canalConfig });
  if (!respuesta) return;

  const responder = RESPONDER_PRIVADO[evento.canal];
  if (!responder) {
    // Solo la guía, no el texto fijo del canal: responder en público lo
    // mismo a cada comentario es justo lo que la plataforma marca como spam.
    if (opciones.responderEnPublico && respuesta.guia) {
      await entregarGuiaEnPublico({ evento, conversacionId: conversacion.id, guia: respuesta.guia, responder: opciones.responderEnPublico });
      return;
    }
    logger.info({ canal: evento.canal, externalId: evento.externalId }, "Canal sin respuesta privada automática: el comentario queda en la bandeja");
    return;
  }

  const textoRespuesta = respuesta.texto;
  try {
    const resultado = await responder({ commentId: evento.externalId, texto: textoRespuesta });

    // El recipient_id que devuelve ESTA llamada es la primera confirmación
    // real de que este comentarista y esa identidad de DM son la misma persona.
    const identidadDm = await vincularIdentidadMensajeria({
      clienteId: cliente.id,
      canal: evento.canal,
      tipo: TIPO_IDENTIDAD_DM[evento.canal],
      externalId: resultado.recipientId,
      cuentaId: evento.cuentaId,
    });
    const conversacionDm = await getOrCreateConversacionAbierta({
      clienteId: cliente.id,
      canal: evento.canal,
      origen: "dm",
      identidadId: identidadDm.id,
      cuentaId: evento.cuentaId,
    });

    await guardarMensaje({
      conversacionId: conversacionDm.id,
      rol: "assistant",
      contenido: textoRespuesta,
      externalId: resultado.messageId,
    });
    await guardarMensaje({
      conversacionId: conversacion.id,
      rol: "assistant",
      tipo: "sistema",
      contenido: "Respuesta privada enviada automáticamente.",
    });
    await actualizarMetadataPorExternalId(evento.externalId, {
      respondido_privado: true,
      ...(respuesta.guia ? { guia_enviada: respuesta.guia } : {}),
    });
    await registrarEvento(conversacion.id, "respuesta_privada", {
      comment_id: evento.externalId,
      ...(respuesta.guia ? { guia: respuesta.guia } : {}),
    }).catch((err: unknown) =>
      logger.error({ err }, "No se pudo registrar el evento de respuesta privada"),
    );
  } catch (err) {
    // Un fallo acá no debe tumbar nada más: el comentario ya quedó guardado
    // arriba, solo no salió la respuesta privada automática.
    logger.error({ err, externalId: evento.externalId, canal: evento.canal }, "No se pudo enviar la respuesta privada automática");
  }
}
