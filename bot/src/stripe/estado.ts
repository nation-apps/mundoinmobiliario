/**
 * Del evento de Stripe al estado que guarda el panel. Funciones puras: sin red ni base.
 */

export type EstadoSuscripcion = "sin_suscripcion" | "activa" | "en_prueba" | "pago_pendiente" | "impago" | "cancelada" | "incompleta";

/** Estados de una suscripción de Stripe → los del panel. */
export function estadoDesdeStripe(status: string | undefined): EstadoSuscripcion {
  switch (status) {
    case "active":
      return "activa";
    case "trialing":
      return "en_prueba";
    case "past_due":
      return "pago_pendiente";
    case "unpaid":
      return "impago";
    case "canceled":
      return "cancelada";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "incompleta";
    default:
      return "sin_suscripcion";
  }
}

/** Lo que de una suscripción de Stripe hace falta guardar. */
export type CambioSuscripcion = {
  estado: EstadoSuscripcion;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  periodo_fin?: string | null;
  cancela_al_final?: boolean;
  email?: string;
};

type Objeto = Record<string, unknown>;
const texto = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const esObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null;
/** `customer` llega como id o, si Stripe lo expande, como objeto con `id`. */
const idDe = (v: unknown): string | undefined => (esObjeto(v) ? texto(v.id) : texto(v));

/** `current_period_end` está en la suscripción (versiones anteriores) o en cada ítem (versiones nuevas). */
function finDePeriodo(sub: Objeto): string | null | undefined {
  let segundos: unknown = sub.current_period_end;
  if (typeof segundos !== "number") {
    const items = esObjeto(sub.items) && Array.isArray(sub.items.data) ? sub.items.data : [];
    const primero = items.find(esObjeto);
    segundos = primero?.current_period_end;
  }
  return typeof segundos === "number" ? new Date(segundos * 1000).toISOString() : undefined;
}

export function cambioDesdeSuscripcion(sub: Objeto): CambioSuscripcion {
  const cambio: CambioSuscripcion = { estado: estadoDesdeStripe(texto(sub.status)) };
  const cliente = idDe(sub.customer);
  const id = texto(sub.id);
  if (cliente) cambio.stripe_customer_id = cliente;
  if (id) cambio.stripe_subscription_id = id;
  const fin = finDePeriodo(sub);
  if (fin !== undefined) cambio.periodo_fin = fin;
  cambio.cancela_al_final = sub.cancel_at_period_end === true;
  return cambio;
}

export type Evento = { id: string; type: string; /** Segundos Unix en que Stripe creó el evento. */ created?: number; data: { object: Objeto } };

/**
 * Qué cambia en la fila de suscripción por cada evento que nos interesa; null = ignorar.
 * `invoice.payment_failed` pasa a «pago_pendiente» sin esperar a que Stripe actualice la suscripción;
 * `invoice.paid` no cambia el estado: lo confirma `customer.subscription.updated`.
 */
export function cambioDesdeEvento(evento: Evento): CambioSuscripcion | null {
  const obj = evento.data.object;
  switch (evento.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return cambioDesdeSuscripcion(obj);
    case "customer.subscription.deleted":
      return { ...cambioDesdeSuscripcion(obj), estado: "cancelada", cancela_al_final: false };
    case "checkout.session.completed": {
      // El estado definitivo llega con la suscripción; aquí se liga el cliente y la suscripción a la fila.
      if (obj.mode !== "subscription") return null;
      const cambio: CambioSuscripcion = { estado: "incompleta" };
      const cliente = idDe(obj.customer);
      const sub = idDe(obj.subscription);
      const correo = texto(obj.customer_email) ?? (esObjeto(obj.customer_details) ? texto(obj.customer_details.email) : undefined);
      if (cliente) cambio.stripe_customer_id = cliente;
      if (sub) cambio.stripe_subscription_id = sub;
      if (correo) cambio.email = correo;
      return cambio;
    }
    case "invoice.payment_failed":
      return { estado: "pago_pendiente" };
    default:
      return null;
  }
}

/**
 * ¿Se puede usar el panel? «activa» y «en prueba» sí. «pago pendiente» tiene `GRACIA_DIAS` de gracia, contados desde
 * que se volvió pendiente, para que el cliente arregle la tarjeta sin quedarse sin su CRM de golpe. Una suscripción
 * cancelada (Stripe la da de baja al terminar el periodo pagado), impaga o sin pagar no tiene acceso.
 */
export const GRACIA_DIAS = 5;

export function accesoPermitido(
  s: { estado: EstadoSuscripcion; pendiente_desde: string | null },
  ahora = new Date(),
): boolean {
  switch (s.estado) {
    case "activa":
    case "en_prueba":
      return true;
    case "pago_pendiente": {
      if (!s.pendiente_desde) return true; // sin fecha no se puede medir la gracia: no se bloquea por un dato faltante
      return ahora.getTime() <= new Date(s.pendiente_desde).getTime() + GRACIA_DIAS * 86_400_000;
    }
    default:
      return false;
  }
}
