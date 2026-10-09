import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  env,
  whatsappConfigurado,
  metaConfigurado,
  instagramConfigurado,
  anthropicConfigurado,
  metaVerifyToken,
} from "../config/env.js";
import { logger } from "../lib/logger.js";
import { requireStaff } from "../lib/adminAuth.js";
import { normalizarTelefono } from "../lib/telefono.js";
import {
  getConversacionConDestino,
  getOrCreateConversacionAbierta,
  pasarAPersona,
} from "../db/repositories/conversaciones.js";
import { guardarMensaje, getMensajeById, actualizarMetadataPorExternalId } from "../db/repositories/mensajes.js";
import { getClienteById, getClienteByTelefono, guardarTelefonoCliente, fusionarClientes } from "../db/repositories/clientes.js";
import { registrarEvento } from "../db/repositories/eventos.js";
import { getPlantillaById, urlPublicaPlantilla } from "../db/repositories/plantillasMedia.js";
import { sendTemplate, listarPlantillas } from "../whatsapp/client.js";
import { getLastInboundAt } from "../whatsapp/window.js";
import { getCanalAdapter } from "../canales/index.js";
import { MOTIVO_CANAL_WEB } from "../canales/sinRespuesta.js";
import { runAgent } from "../agent/runner.js";
import { responderComentarioPublico, responderComentarioPrivado, estadoConexion, marcarVisto } from "../meta/client.js";
import { vincularIdentidadMensajeria } from "../meta/identidades.js";
import type { CanalMeta } from "../meta/parser.js";

// Exactamente uno de los dos: o el staff escribe texto, o elige una
// plantilla multimedia de la biblioteca — nunca ambos ni ninguno.
const mensajeSchema = z
  .object({
    conversacionId: z.string().uuid(),
    texto: z.string().trim().min(1).max(4000).optional(),
    plantillaId: z.string().uuid().optional(),
  })
  .refine((data) => Boolean(data.texto) !== Boolean(data.plantillaId), {
    message: "Manda exactamente uno: texto o plantillaId",
  });

const promocionSchema = z.object({
  clienteIds: z.array(z.string().uuid()).min(1).max(200),
  plantilla: z.string().trim().min(1),
  parametros: z.array(z.string()).max(10).optional(),
});

// Igual que /admin/mensajes: o texto libre (solo con la ventana de 24h
// abierta), o una plantilla aprobada — nunca ambos ni ninguno.
const whatsappClienteSchema = z
  .object({
    texto: z.string().trim().min(1).max(4000).optional(),
    plantilla: z.string().trim().min(1).optional(),
    parametros: z.array(z.string().trim().min(1)).max(10).optional(),
  })
  .refine((d) => Boolean(d.texto) !== Boolean(d.plantilla), {
    message: "Manda exactamente uno: texto o plantilla",
  });

const comentarioResponderSchema = z.object({
  modo: z.enum(["publico", "privado"]),
  texto: z.string().trim().min(1).max(2000),
});

const clienteTelefonoSchema = z.object({
  telefono: z.string().trim().min(6),
  fusionar: z.boolean().optional(),
});

const SIETE_DIAS_MS = 7 * 24 * 60 * 60_000;

export async function adminRoutes(app: FastifyInstance) {
  /**
   * Respuesta escrita por un humano del staff desde el panel — WhatsApp,
   * Messenger, Instagram (y TikTok cuando esté conectado), el mismo endpoint
   * para todos. Una conversación `web` no admite respuesta: se contesta por
   * WhatsApp con POST /admin/clientes/:id/whatsapp.
   *
   * El envío va antes de guardar a propósito: si el canal rechaza el
   * mensaje, no queremos dejar en el historial algo que el cliente nunca
   * recibió (y que Claude luego leería como contexto real).
   */
  app.post("/admin/mensajes", async (request: FastifyRequest, reply: FastifyReply) => {
    const staff = await requireStaff(request.headers.authorization);

    const parsed = mensajeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", detail: parsed.error.issues });
    }
    const { conversacionId, texto, plantillaId } = parsed.data;

    const found = await getConversacionConDestino(conversacionId);
    if (!found) return reply.status(404).send({ error: "conversacion_no_encontrada" });

    if (found.conversacion.canal === "web") {
      return reply.status(409).send({ error: "canal_sin_respuesta", mensaje: MOTIVO_CANAL_WEB });
    }

    if (!found.destinatarioId) {
      return reply.status(409).send({
        error: "sin_telefono",
        mensaje: "Todavía no se resolvió a quién enviarle: este contacto no tiene una identidad de mensajería registrada.",
      });
    }

    const adapter = getCanalAdapter(found.conversacion.canal);
    const ultimoMensajeAt = found.conversacion.ultimo_mensaje_at;

    let mensaje;
    if (texto) {
      const resultado = await adapter.enviarTexto({ destinatarioId: found.destinatarioId, texto, rol: "humano", ultimoMensajeAt });
      if (!resultado.externalId) {
        return reply.status(409).send({ error: "ventana_cerrada", mensaje: resultado.motivoCierre });
      }
      mensaje = await guardarMensaje({ conversacionId, rol: "humano", contenido: texto, externalId: resultado.externalId, autorId: staff.id });
    } else {
      const plantilla = await getPlantillaById(plantillaId!);
      if (!plantilla) return reply.status(404).send({ error: "plantilla_no_encontrada" });

      const url = urlPublicaPlantilla(plantilla.storage_path);
      const resultado = await adapter.enviarMedia({
        destinatarioId: found.destinatarioId,
        tipo: plantilla.tipo,
        url,
        caption: plantilla.caption,
        rol: "humano",
        ultimoMensajeAt,
      });
      if (!resultado.externalId) {
        return reply.status(409).send({ error: "ventana_cerrada", mensaje: resultado.motivoCierre });
      }
      mensaje = await guardarMensaje({
        conversacionId,
        rol: "humano",
        contenido: `[${plantilla.tipo}] ${plantilla.nombre}`,
        mediaUrl: url,
        mediaType: plantilla.tipo,
        externalId: resultado.externalId,
        autorId: staff.id,
      });
    }

    // Respondió una persona: el bot deja de contestar en este chat hasta que lo devuelvan a «Bot».
    const pasoAPersona = await pasarAPersona(conversacionId).catch((err: unknown) => {
      logger.warn({ err, conversacionId }, "No se pudo pasar la conversación a «Yo»");
      return false;
    });
    logger.info({ conversacionId, canal: found.conversacion.canal, pasoAPersona }, "Mensaje humano enviado desde el panel");
    return reply.status(201).send({ mensaje });
  });

  /**
   * Responder un comentario de Facebook/Instagram: en público (respuesta
   * visible bajo el comentario) o en privado (Send API, una sola vez por
   * comentario, hasta 7 días desde que se creó). TikTok: solo en público.
   */
  app.post("/admin/comentarios/:mensajeId/responder", async (request: FastifyRequest, reply: FastifyReply) => {
    const staff = await requireStaff(request.headers.authorization);

    const parsed = comentarioResponderSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body", detail: parsed.error.issues });

    const { mensajeId } = request.params as { mensajeId: string };
    const comentario = await getMensajeById(mensajeId);
    if (!comentario || comentario.tipo !== "comentario" || !comentario.external_id) {
      return reply.status(404).send({ error: "comentario_no_encontrado" });
    }

    const conv = await getConversacionConDestino(comentario.conversacion_id);
    if (!conv) return reply.status(404).send({ error: "conversacion_no_encontrada" });
    const canal = conv.conversacion.canal;
    if (canal !== "messenger" && canal !== "instagram") return reply.status(400).send({ error: "canal_no_soportado" });
    const canalMeta: CanalMeta = canal;

    if (parsed.data.modo === "publico") {
      const resultado = await responderComentarioPublico({ canal: canalMeta, commentId: comentario.external_id, texto: parsed.data.texto });
      const nuevo = await guardarMensaje({
        conversacionId: comentario.conversacion_id,
        rol: "humano",
        tipo: "comentario",
        contenido: parsed.data.texto,
        externalId: resultado.commentId,
        autorId: staff.id,
        metadata: { parent_id: comentario.external_id },
      });
      logger.info({ conversacionId: comentario.conversacion_id }, "Respuesta pública a comentario enviada desde el panel");
      return reply.status(201).send({ mensaje: nuevo });
    }

    // modo === "privado": Meta permite UNA por comentario, hasta 7 días.
    const yaRespondido = (comentario.metadata as Record<string, unknown> | null)?.respondido_privado === true;
    const pasaron7dias = Date.now() - new Date(comentario.created_at).getTime() > SIETE_DIAS_MS;
    if (yaRespondido || pasaron7dias) {
      return reply.status(409).send({ error: "comentario_no_admite_privado" });
    }

    const resultado = await responderComentarioPrivado({ canal: canalMeta, commentId: comentario.external_id, texto: parsed.data.texto });

    const identidadDm = await vincularIdentidadMensajeria({
      clienteId: conv.clienteId,
      canal: canalMeta,
      tipo: canalMeta === "instagram" ? "igsid" : "psid",
      externalId: resultado.recipientId,
      cuentaId: conv.conversacion.cuenta_id,
    });
    const conversacionDm = await getOrCreateConversacionAbierta({
      clienteId: conv.clienteId,
      canal: canalMeta,
      origen: "dm",
      identidadId: identidadDm.id,
      cuentaId: conv.conversacion.cuenta_id,
    });

    await guardarMensaje({
      conversacionId: conversacionDm.id,
      rol: "humano",
      contenido: parsed.data.texto,
      externalId: resultado.messageId,
      autorId: staff.id,
    });
    await guardarMensaje({
      conversacionId: comentario.conversacion_id,
      rol: "humano",
      tipo: "sistema",
      contenido: "Respuesta privada enviada desde el panel.",
      autorId: staff.id,
    });
    await actualizarMetadataPorExternalId(comentario.external_id, { respondido_privado: true });
    await registrarEvento(comentario.conversacion_id, "respuesta_privada", { comment_id: comentario.external_id }).catch((err: unknown) =>
      logger.error({ err }, "No se pudo registrar el evento de respuesta privada"),
    );

    logger.info({ conversacionId: comentario.conversacion_id }, "Respuesta privada a comentario enviada desde el panel");
    return reply.send({ conversacionDmId: conversacionDm.id });
  });

  /**
   * Borrador de respuesta para que el staff revise antes de mandar — nunca
   * envía ni guarda nada solo. `runAgent(..., { modo: "sugerir" })` excluye
   * las tools que mutan y no escala la conversación ante ningún fallo.
   */
  app.post("/admin/ia/sugerencia", async (request: FastifyRequest, reply: FastifyReply) => {
    await requireStaff(request.headers.authorization);

    const parsed = z.object({ conversacionId: z.string().uuid() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body", detail: parsed.error.issues });

    const conv = await getConversacionConDestino(parsed.data.conversacionId);
    if (!conv) return reply.status(404).send({ error: "conversacion_no_encontrada" });

    const texto = await runAgent(
      {
        canal: conv.conversacion.canal,
        conversacionId: conv.conversacion.id,
        clienteId: conv.clienteId,
        telefono: conv.clienteTelefono,
        contactName: conv.clienteNombre ?? undefined,
      },
      "(El staff pidió una sugerencia de respuesta — no hay un mensaje nuevo del cliente. Usa el historial " +
        "reciente de esta conversación para redactar el siguiente mensaje que le mandaría el negocio.)",
      { modo: "sugerir" },
    );

    return reply.send({ texto });
  });

  /**
   * Guardar el teléfono de un contacto desde el panel. A diferencia de la
   * tool guardar_datos_contacto (que nunca fusiona: el número que dice un
   * lead no está verificado), aquí decide una persona del staff:
   * si el teléfono ya es de otro cliente, no se puede simplemente
   * sobreescribir (rompería el unique de clientes.telefono) — hay que
   * fusionar, y eso requiere una transacción que no se puede hacer por RLS
   * directo desde el navegador.
   */
  app.post("/admin/clientes/:id/telefono", async (request: FastifyRequest, reply: FastifyReply) => {
    await requireStaff(request.headers.authorization);

    const parsed = clienteTelefonoSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body", detail: parsed.error.issues });

    const { id } = request.params as { id: string };
    const cliente = await getClienteById(id);
    if (!cliente) return reply.status(404).send({ error: "cliente_no_encontrado" });

    const normalizado = normalizarTelefono(parsed.data.telefono);
    if (!normalizado) return reply.status(400).send({ error: "telefono_invalido" });

    const existente = await getClienteByTelefono(normalizado);
    if (existente && existente.id !== id) {
      if (!parsed.data.fusionar) {
        return reply.status(409).send({ error: "telefono_en_uso", clienteExistente: { id: existente.id, nombre: existente.nombre } });
      }
      await fusionarClientes(id, existente.id);
      logger.info({ origen: id, destino: existente.id }, "Clientes fusionados desde el panel");
      return reply.send({ clienteId: existente.id, fusionado: true });
    }

    await guardarTelefonoCliente(id, normalizado);
    return reply.send({ clienteId: id, fusionado: false });
  });

  /**
   * Estado de conexión de cada canal — la página "Canales" del panel lo usa
   * para mostrar si cada canal está de verdad funcionando, no solo si las
   * variables de entorno están cargadas. Nunca devuelve secretos (tokens de
   * acceso, app secret, service role): solo booleanos, ids públicos y
   * nombres… salvo el verify token, que solo sirve para el handshake de Meta
   * al registrar el webhook y que el staff necesita copiar en el panel de
   * Meta. Va únicamente en la respuesta a un staff autenticado: nunca se
   * loguea ni se guarda.
   */
  app.get("/admin/canales/estado", async (request: FastifyRequest, reply: FastifyReply) => {
    await requireStaff(request.headers.authorization);

    const meta = metaConfigurado ? await estadoConexion().catch(() => null) : null;
    // PUBLIC_BASE_URL puede venir con o sin "/" final; las URLs de webhook
    // que se pegan en Meta no deben quedar con doble barra.
    const baseUrl = env.PUBLIC_BASE_URL.replace(/\/$/, "");

    return reply.send({
      whatsapp: {
        configurado: whatsappConfigurado,
        numero: env.WHATSAPP_PHONE_NUMBER_ID ?? null,
        // Sin WABA no se pueden listar plantillas (ni armar recordatorios o
        // el primer contacto a un lead web desde el panel).
        plantillasDisponibles: Boolean(env.WHATSAPP_WABA_ID),
      },
      messenger: {
        configurado: metaConfigurado,
        pagina: meta?.pagina?.nombre ?? null,
        suscrito: meta?.suscrita ?? false,
        tokenVence: meta?.tokenVenceEn ?? null,
      },
      instagram: {
        configurado: instagramConfigurado,
        cuenta: meta?.instagram?.id ?? null,
        username: meta?.instagram?.username ?? null,
      },
      tiktok: { configurado: false, mensajesDirectos: false },
      // El formulario del sitio. `protegido` = exige PUBLIC_LEADS_TOKEN (solo
      // el servidor del sitio puede crear leads).
      web: { protegido: Boolean(env.PUBLIC_LEADS_TOKEN) },
      // Formularios instantáneos de anuncios (Lead Ads): entran por el webhook
      // de la página. Hacen falta las dos cosas para que lleguen a Chats.
      formulariosAnuncios: { suscrito: meta?.leadgenSuscrito ?? false, permiso: meta?.permisoLeads ?? false },
      ia: { configurada: anthropicConfigurado },
      // No vive en ninguna tabla — es una aprobación de Meta a nivel de app,
      // no un interruptor de negocio. El panel lo necesita para calcular el
      // mismo aviso de ventana que ve el bot (meta/window.ts) ANTES de que
      // el staff intente enviar, no solo después de que el bot lo rechace.
      metaHumanAgentAprobado: env.META_HUMAN_AGENT_APROBADO,
      // Lo que el staff copia en el panel de Meta al registrar los webhooks
      // (contrato `WebhooksInfo` de lib/admin/chats-tipos.ts en el sitio).
      webhooks: {
        whatsapp: `${baseUrl}/webhook`,
        meta: `${baseUrl}/webhook/meta`,
        verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? null,
        verifyTokenMeta: metaVerifyToken ?? null,
      },
    });
  });

  /**
   * Marca como visto en Messenger/Instagram cuando el staff abre la
   * conversación. Puramente cosmético del lado de Meta (sender_action:
   * mark_seen) — sin equivalente en WhatsApp, TikTok ni web con lo que ya
   * está integrado, así que para esos canales no hace nada.
   */
  app.post("/admin/conversaciones/:id/visto", async (request: FastifyRequest, reply: FastifyReply) => {
    await requireStaff(request.headers.authorization);

    const { id } = request.params as { id: string };
    const conv = await getConversacionConDestino(id);
    if (!conv) return reply.status(404).send({ error: "conversacion_no_encontrada" });

    const canal = conv.conversacion.canal;
    if ((canal === "messenger" || canal === "instagram") && conv.destinatarioId) {
      await marcarVisto({ canal, recipientId: conv.destinatarioId }).catch(() => {});
    }

    return reply.status(204).send();
  });

  /**
   * Plantillas de WhatsApp aprobadas por Meta (o pendientes/rechazadas, para
   * que el staff sepa por qué no aparecen como opción todavía). El panel las
   * usa para armar el envío de promociones sin que nadie tenga que copiar el
   * nombre a mano desde el Administrador de WhatsApp ni adivinar cuántas
   * variables lleva el cuerpo.
   */
  app.get("/admin/plantillas", async (request: FastifyRequest, reply: FastifyReply) => {
    await requireStaff(request.headers.authorization);
    const plantillas = await listarPlantillas();
    return reply.send({ plantillas });
  });

  /**
   * Envío masivo de una plantilla (promociones). Siempre por plantilla
   * aprobada: una campaña sale casi siempre fuera de la ventana de 24h, y
   * mezclar los dos caminos haría que el resultado dependa de cuándo
   * escribió cada cliente por última vez. Solo WhatsApp: Messenger/Instagram
   * no tienen un equivalente de plantilla fuera de ventana.
   */
  app.post("/admin/promociones", async (request: FastifyRequest, reply: FastifyReply) => {
    const staff = await requireStaff(request.headers.authorization);
    // Un envío masivo sale a nombre del negocio: lo hacen admin y asistente, no el vendedor.
    if (staff.rol === "vendedor") {
      return reply.status(403).send({ error: "forbidden", mensaje: "Tu rol no puede enviar promociones masivas." });
    }

    const parsed = promocionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", detail: parsed.error.issues });
    }
    const { clienteIds, plantilla, parametros } = parsed.data;

    let enviadas = 0;
    const fallidas: { clienteId: string; motivo: string }[] = [];

    for (const clienteId of clienteIds) {
      // Se resuelve el cliente ANTES de reservar la notificación: a uno sin
      // teléfono no hay campaña que mandarle (llegó por Instagram, Messenger o
      // TikTok y todavía no lo dio), y reservar primero dejaría una
      // notificación colgada que ningún reintento va a poder completar.
      const cliente = await getClienteById(clienteId);
      if (!cliente?.telefono) {
        logger.info({ clienteId }, "Cliente sin teléfono, se salta de la campaña");
        continue;
      }

      try {
        await sendTemplate({
          to: cliente.telefono,
          plantilla,
          idioma: env.WHATSAPP_TEMPLATE_LANG,
          ...(parametros ? { parametros } : {}),
        });
        enviadas++;
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        fallidas.push({ clienteId, motivo });
        logger.error({ err, clienteId }, "Falló el envío de promoción");
      }
    }

    logger.info({ enviadas, fallidas: fallidas.length, plantilla }, "Campaña de promoción procesada");
    return reply.send({ enviadas, fallidas });
  });

  /**
   * Escribirle por WhatsApp a un contacto desde su ficha — el camino para
   * los leads del formulario web (canal sin respuesta) o de redes que ya
   * dieron su número. Abre (o reutiliza) su conversación de WhatsApp y deja
   * el mensaje ahí, así la respuesta del cliente cae en el mismo hilo.
   *
   * Texto libre solo con la ventana de 24h abierta; si no, plantilla
   * aprobada (GET /admin/plantillas). Enviar primero, guardar después.
   */
  app.post("/admin/clientes/:id/whatsapp", async (request: FastifyRequest, reply: FastifyReply) => {
    const staff = await requireStaff(request.headers.authorization);

    const parsed = whatsappClienteSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body", detail: parsed.error.issues });
    if (!whatsappConfigurado) return reply.status(503).send({ error: "whatsapp_no_configurado" });

    const { id } = request.params as { id: string };
    const cliente = await getClienteById(id);
    if (!cliente) return reply.status(404).send({ error: "cliente_no_encontrado" });
    if (!cliente.telefono) return reply.status(409).send({ error: "sin_telefono" });

    // Se lee ANTES de abrir la conversación: una recién creada no es un
    // mensaje entrante y no debe contar para la ventana. Si nunca escribió
    // por WhatsApp, la conversación nace con ultimo_mensaje_at en 1970 —
    // "nunca", ventana cerrada — y el panel la ordena igual por actividad
    // (conversaciones_resumen.actividad_at incluye la respuesta del equipo).
    const ultimoEntrante = await getLastInboundAt(cliente.telefono);
    const conversacion = await getOrCreateConversacionAbierta({
      clienteId: cliente.id,
      canal: "whatsapp",
      origen: "dm",
      ultimoMensajeAt: (ultimoEntrante ?? new Date(0)).toISOString(),
    });

    let externalId: string;
    let contenido: string;
    if (parsed.data.texto) {
      const resultado = await getCanalAdapter("whatsapp").enviarTexto({
        destinatarioId: cliente.telefono,
        texto: parsed.data.texto,
        rol: "humano",
        ultimoMensajeAt: ultimoEntrante ? ultimoEntrante.toISOString() : null,
      });
      if (!resultado.externalId) {
        return reply.status(409).send({ error: "ventana_cerrada", mensaje: resultado.motivoCierre });
      }
      externalId = resultado.externalId;
      contenido = parsed.data.texto;
    } else {
      externalId = await sendTemplate({
        to: cliente.telefono,
        plantilla: parsed.data.plantilla!,
        idioma: env.WHATSAPP_TEMPLATE_LANG,
        ...(parsed.data.parametros ? { parametros: parsed.data.parametros } : {}),
      });
      contenido = `[Plantilla ${parsed.data.plantilla}]${parsed.data.parametros?.length ? ` ${parsed.data.parametros.join(" · ")}` : ""}`;
    }

    const mensaje = await guardarMensaje({
      conversacionId: conversacion.id,
      rol: "humano",
      contenido,
      externalId,
      waMessageId: externalId,
      autorId: staff.id,
      ...(parsed.data.plantilla
        ? { metadata: { plantilla: parsed.data.plantilla, parametros: parsed.data.parametros ?? [] } }
        : {}),
    });

    logger.info({ clienteId: cliente.id, conversacionId: conversacion.id }, "Mensaje de WhatsApp iniciado desde la ficha del contacto");
    return reply.status(201).send({ mensaje, conversacionId: conversacion.id });
  });
}
