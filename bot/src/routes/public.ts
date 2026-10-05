import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { isRateLimited } from "../lib/rateLimit.js";
import { normalizarTelefono } from "../lib/telefono.js";
import { registrarLeadWeb, INTERESES } from "../db/repositories/clientes.js";
import { getOrCreateConversacionAbierta } from "../db/repositories/conversaciones.js";
import { guardarMensaje } from "../db/repositories/mensajes.js";

/**
 * Lo que manda el formulario de contacto del sitio (app/api/contact/route.ts
 * → lib/bot.ts en la raíz del repo). Los topes calzan con la validación del
 * sitio para que nada que el sitio aceptó sea rechazado acá. `email: ""` se
 * acepta como "sin correo": un campo vacío de formulario no es un error.
 */
const leadBodySchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  telefono: z.string().trim().min(6).max(30),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).optional(),
  asunto: z.string().trim().max(200).optional(),
  mensaje: z.string().trim().max(3000).optional(),
  origen: z.string().trim().max(60).optional(),
  interes: z.enum(INTERESES).optional(),
  pagina: z.string().trim().max(300).optional(),
});

/** Comparación en tiempo constante: un `===` deja adivinar el token carácter por carácter midiendo tiempos. */
function tokenCoincide(recibido: string | undefined, esperado: string): boolean {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function origenesWeb(): string[] {
  return env.WEB_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * /public/* es la única superficie del bot que habla con cualquier
 * visitante del sitio, sin sesión — de ahí el rate limit por IP
 * (RATE_LIMIT_MAX_PER_MINUTE de WhatsApp usa el teléfono como llave, que
 * acá todavía no existe en la consulta de disponibilidad).
 */
export async function publicRoutes(app: FastifyInstance) {
  /**
   * Formulario de contacto del sitio → bandeja del panel.
   *
   * Con PUBLIC_LEADS_TOKEN configurado, solo el servidor del sitio puede
   * llamar (header `x-byb-leads-token`), y no hay rate limit por IP: todas
   * las llamadas salen de las IPs compartidas de Vercel, y limitarlas por IP
   * perdería leads reales en un día con tráfico. Sin token, queda abierto al
   * navegador de WEB_ORIGINS con rate limit por IP.
   *
   * El lead entra como conversación `web` / `formulario`: el canal web no
   * admite respuesta directa, el staff le escribe por WhatsApp desde el panel.
   */
  app.post("/public/leads", async (request: FastifyRequest, reply: FastifyReply) => {
    if (env.PUBLIC_LEADS_TOKEN) {
      const token = request.headers["x-byb-leads-token"];
      if (!tokenCoincide(typeof token === "string" ? token : undefined, env.PUBLIC_LEADS_TOKEN)) {
        logger.warn({ ip: request.ip }, "Lead web rechazado: token ausente o inválido");
        return reply.status(401).send({ error: "token_invalido" });
      }
    } else {
      // CORS ya impide que otro sitio lea la respuesta, pero no que dispare
      // el POST; con Origin presente y ajeno se corta acá. Sin Origin es una
      // llamada de servidor, que igual pasa por el rate limit.
      const origin = request.headers.origin;
      if (origin && !origenesWeb().includes(origin)) {
        return reply.status(403).send({ error: "origen_no_permitido" });
      }
      if (isRateLimited(`lead:${request.ip}`, env.PUBLIC_RATE_LIMIT_MAX_PER_MINUTE)) {
        return reply.status(429).send({ error: "demasiadas_solicitudes" });
      }
    }

    const parsed = leadBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid_body", detail: parsed.error.issues });
    const body = parsed.data;

    const telefono = normalizarTelefono(body.telefono);
    if (!telefono) return reply.status(400).send({ error: "telefono_invalido" });

    const cliente = await registrarLeadWeb({
      telefono,
      nombre: body.nombre,
      email: body.email || undefined,
      interes: body.interes,
    });

    // Reusa la conversación web abierta de este cliente si ya tenía una: dos
    // formularios seguidos de la misma persona son un mismo hilo en la bandeja.
    const conversacion = await getOrCreateConversacionAbierta({
      clienteId: cliente.id,
      canal: "web",
      origen: "formulario",
    });

    const contenido =
      body.mensaje || (body.asunto ? `Asunto: ${body.asunto}` : "Envió el formulario de contacto sin mensaje.");
    await guardarMensaje({
      conversacionId: conversacion.id,
      rol: "user",
      tipo: "mensaje",
      contenido,
      metadata: {
        ...(body.asunto ? { asunto: body.asunto } : {}),
        ...(body.pagina ? { pagina: body.pagina } : {}),
        ...(body.origen ? { origen: body.origen } : {}),
        ...(body.interes ? { interes: body.interes } : {}),
        ...(body.email ? { email: body.email } : {}),
      },
    });

    logger.info({ clienteId: cliente.id, conversacionId: conversacion.id }, "Lead del formulario web recibido");
    return reply.status(201).send({ ok: true, clienteId: cliente.id, conversacionId: conversacion.id });
  });
}
