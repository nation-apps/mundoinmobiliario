import { z } from "zod";
import type { AgentTool } from "./types.js";
import { escalarConversacion } from "../../db/repositories/conversaciones.js";
import { registrarEvento } from "../../db/repositories/eventos.js";
import { sendTextIfWindowOpen } from "../../whatsapp/window.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

const inputSchema = z.object({
  motivo: z.string(),
});

export const escalarAHumanoTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: "escalar_a_humano",
  description:
    "Marca la conversación para que la atienda un asesor del equipo y le avisa. Úsalo siempre que: el cliente pida " +
    "hablar con una persona o con un asesor; quiera ver una propiedad o agendar una visita; ya haya dejado claro qué " +
    "busca y quiera avanzar; quiera vender o rentar su propiedad; pregunte por una propiedad concreta, su precio o " +
    "disponibilidad, financiamiento específico, trámites o temas legales; tenga un reclamo o un problema con un pago; " +
    "o cuando una tool falle y no puedas resolver la solicitud. Pasa en el motivo un resumen claro de lo que busca " +
    "(operación, tipo, zona, presupuesto, plazo). Después de llamar esta tool, dile al cliente que un asesor le va a " +
    "escribir por este mismo chat; no sigas intentando resolverlo tú.",
  inputSchema,
  mutates: true,
  jsonSchema: {
    type: "object",
    properties: {
      motivo: { type: "string" },
    },
    required: ["motivo"],
  },
  handler: async (input, ctx) => {
    await escalarConversacion(ctx.conversacionId);

    // Evento propio (distinto del `estado` genérico que ya inserta el
    // trigger de 0002_omnicanal.sql al cambiar a 'escalada'): es lo que el panel
    // escucha en tiempo real para mostrar el toast de "conversación
    // escalada", sin confundirlo con un cambio de estado cualquiera hecho
    // a mano desde el switch del panel.
    await registrarEvento(ctx.conversacionId, "escalada", { motivo: input.motivo, canal: ctx.canal }).catch((err: unknown) =>
      logger.error({ err }, "No se pudo registrar el evento de escalada"),
    );

    try {
      await sendTextIfWindowOpen(
        env.ESCALATION_PHONE,
        `Conversación escalada (${ctx.canal}). Cliente: ${ctx.contactName ?? "sin nombre"} (${ctx.telefono ?? "sin teléfono"}). Motivo: ${input.motivo}`,
      );
    } catch (err) {
      // No dejamos que un fallo en la notificación tumbe la escalada en sí
      // (la conversación ya quedó marcada); solo se pierde el aviso proactivo.
      logger.error({ err }, "No se pudo notificar al número de escalamiento");
    }

    return { ok: true };
  },
};
