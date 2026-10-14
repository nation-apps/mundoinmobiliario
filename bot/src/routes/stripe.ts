import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { verificarFirmaStripe } from "../stripe/firma.js";
import { aplicarEventoStripe } from "../stripe/aplicar.js";
import type { Evento } from "../stripe/estado.js";

/**
 * Webhook de Stripe. Se responde 200 solo cuando el evento quedó aplicado (o ya estaba): ante un fallo se responde 500
 * y Stripe reintenta durante días, que es lo que se quiere para un cobro.
 */
export async function stripeRoutes(app: FastifyInstance) {
  app.post("/stripe/webhook", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!env.STRIPE_WEBHOOK_SECRET) return reply.status(503).send({ error: "stripe_no_configurado" });

    const firmado = verificarFirmaStripe(request.rawBody, request.headers["stripe-signature"] as string | undefined, env.STRIPE_WEBHOOK_SECRET);
    if (!firmado) {
      logger.warn("Firma de webhook de Stripe inválida o ausente");
      return reply.status(401).send({ error: "invalid_signature" });
    }

    const evento = request.body as Partial<Evento> | undefined;
    if (!evento || typeof evento.id !== "string" || typeof evento.type !== "string" || !evento.data?.object) {
      return reply.status(400).send({ error: "evento_invalido" });
    }

    try {
      const resultado = await aplicarEventoStripe(evento as Evento);
      return reply.status(200).send({ received: true, resultado });
    } catch (err) {
      logger.error({ err, tipo: evento.type }, "No se pudo aplicar un evento de Stripe");
      return reply.status(500).send({ error: "no_aplicado" });
    }
  });
}
