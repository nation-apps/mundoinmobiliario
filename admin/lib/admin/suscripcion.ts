/**
 * Suscripción del CRM (Stripe, 39 USD al mes). El bot escribe la fila `suscripcion` desde el webhook de Stripe;
 * el panel solo la lee. Esta lógica es la misma que `accesoPermitido` del bot (bot/src/stripe/estado.ts).
 */

export type EstadoSuscripcion = "sin_suscripcion" | "activa" | "en_prueba" | "pago_pendiente" | "impago" | "cancelada" | "incompleta";

export type Suscripcion = {
  estado: EstadoSuscripcion;
  periodo_fin: string | null;
  cancela_al_final: boolean;
  pendiente_desde: string | null;
  stripe_customer_id: string | null;
};

export const SIN_SUSCRIPCION: Suscripcion = {
  estado: "sin_suscripcion",
  periodo_fin: null,
  cancela_al_final: false,
  pendiente_desde: null,
  stripe_customer_id: null,
};

/** Días que el panel sigue abierto tras un cobro fallido, para arreglar la tarjeta sin quedarse sin el CRM de golpe. */
export const GRACIA_DIAS = 5;

export const ESTADO_ROTULO: Record<EstadoSuscripcion, string> = {
  sin_suscripcion: "Sin suscripción",
  activa: "Activa",
  en_prueba: "En prueba",
  pago_pendiente: "Pago pendiente",
  impago: "Sin pagar",
  cancelada: "Cancelada",
  incompleta: "Pago sin completar",
};

export function accesoPermitido(s: Pick<Suscripcion, "estado" | "pendiente_desde">, ahora = new Date()): boolean {
  switch (s.estado) {
    case "activa":
    case "en_prueba":
      return true;
    case "pago_pendiente":
      if (!s.pendiente_desde) return true;
      return ahora.getTime() <= new Date(s.pendiente_desde).getTime() + GRACIA_DIAS * 86_400_000;
    default:
      return false;
  }
}

/** Fecha en que se acaba la gracia de un pago pendiente (para decirla en el aviso). */
export function finDeGracia(s: Pick<Suscripcion, "pendiente_desde">): Date | null {
  if (!s.pendiente_desde) return null;
  return new Date(new Date(s.pendiente_desde).getTime() + GRACIA_DIAS * 86_400_000);
}

/** El cobro se exige solo si el servidor lo pide: así el panel nunca se bloquea por un cobro sin configurar. */
export const SUSCRIPCION_OBLIGATORIA = process.env.SUSCRIPCION_OBLIGATORIA === "true";
