import { logger } from "../lib/logger.js";
import { guardarSuscripcion, leerSuscripcion, olvidarEventoStripe, registrarEventoStripe } from "../db/repositories/suscripcion.js";
import { cambioDesdeEvento, type Evento } from "./estado.js";

export type ResultadoEvento = "aplicado" | "repetido" | "ignorado" | "viejo" | "otra_suscripcion";

/**
 * Aplica un evento de Stripe a la fila de suscripción. Idempotente (el mismo evento dos veces no cambia nada) y
 * tolerante al desorden: un aviso más viejo que el último aplicado, o de una suscripción distinta a la vigente, se
 * descarta. Si algo falla, el evento se olvida y se relanza el error para que Stripe lo reintente.
 */
export async function aplicarEventoStripe(evento: Evento): Promise<ResultadoEvento> {
  const cambio = cambioDesdeEvento(evento);
  if (!cambio) return "ignorado";

  if (!(await registrarEventoStripe(evento.id, evento.type))) return "repetido";

  try {
    const actual = await leerSuscripcion();
    const creado = evento.created ? new Date(evento.created * 1000) : new Date();

    if (actual.ultimo_evento_at && creado.getTime() < new Date(actual.ultimo_evento_at).getTime()) {
      logger.info({ tipo: evento.type }, "Aviso de Stripe más viejo que el último aplicado: se descarta");
      return "viejo";
    }

    const esDeSuscripcion = evento.type.startsWith("customer.subscription.");
    if (
      esDeSuscripcion &&
      cambio.stripe_subscription_id &&
      actual.stripe_subscription_id &&
      cambio.stripe_subscription_id !== actual.stripe_subscription_id
    ) {
      // Una suscripción vieja (p. ej. la cancelada antes de volver a suscribirse) no debe pisar la vigente.
      logger.info({ tipo: evento.type }, "Aviso de una suscripción anterior: se descarta");
      return "otra_suscripcion";
    }

    const parche: Parameters<typeof guardarSuscripcion>[0] = { ...cambio, ultimo_evento_at: creado.toISOString() };

    if (evento.type === "checkout.session.completed") {
      // Solo liga ids: el estado real lo trae la suscripción. Sin suscripción previa queda «incompleta» hasta entonces.
      if (actual.estado === "sin_suscripcion" || actual.estado === "cancelada") parche.estado = "incompleta";
      else delete (parche as { estado?: unknown }).estado;
    }

    const nuevoEstado = parche.estado ?? actual.estado;
    if (nuevoEstado === "pago_pendiente") {
      parche.pendiente_desde = actual.estado === "pago_pendiente" && actual.pendiente_desde ? actual.pendiente_desde : creado.toISOString();
    } else {
      parche.pendiente_desde = null;
    }

    await guardarSuscripcion(parche);
    logger.info({ tipo: evento.type, estado: nuevoEstado }, "Suscripción actualizada desde Stripe");
    return "aplicado";
  } catch (err) {
    await olvidarEventoStripe(evento.id).catch(() => {});
    throw err;
  }
}
