import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

const API = "https://api.stripe.com/v1";

/** Stripe recibe formularios (`application/x-www-form-urlencoded`) con la notación `a[b][0]=c` para lo anidado. */
export function codificarFormulario(datos: Record<string, unknown>, prefijo = ""): string[] {
  const partes: string[] = [];
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor === undefined || valor === null) continue;
    const nombre = prefijo ? `${prefijo}[${clave}]` : clave;
    if (Array.isArray(valor)) {
      valor.forEach((v, i) => {
        if (typeof v === "object" && v !== null) partes.push(...codificarFormulario(v as Record<string, unknown>, `${nombre}[${i}]`));
        else partes.push(`${encodeURIComponent(`${nombre}[${i}]`)}=${encodeURIComponent(String(v))}`);
      });
    } else if (typeof valor === "object") {
      partes.push(...codificarFormulario(valor as Record<string, unknown>, nombre));
    } else {
      partes.push(`${encodeURIComponent(nombre)}=${encodeURIComponent(String(valor))}`);
    }
  }
  return partes;
}

async function llamarStripe(ruta: string, datos: Record<string, unknown>, idempotencia?: string): Promise<Record<string, unknown>> {
  if (!env.STRIPE_SECRET_KEY) throw new AppError("Stripe no está configurado", "stripe_no_configurado", 503);
  const res = await fetch(`${API}${ruta}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencia ? { "Idempotency-Key": idempotencia } : {}),
    },
    body: codificarFormulario(datos).join("&"),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & Record<string, unknown>;
  if (!res.ok) {
    // El mensaje de Stripe no lleva la clave, pero sí puede llevar datos del cliente: solo el código al registro.
    throw new AppError(`Stripe rechazó la solicitud (${json.error?.code ?? res.status})`, "stripe_error", 502);
  }
  return json;
}

export type SesionStripe = { url: string };

function urlSesion(r: Record<string, unknown>): SesionStripe {
  if (typeof r.url !== "string") throw new AppError("Stripe no devolvió la dirección", "stripe_sin_url", 502);
  return { url: r.url };
}

/** Precio de la suscripción: el `price_…` de Stripe si está configurado; si no, 39 USD al mes en línea. */
function lineaDePrecio() {
  if (env.STRIPE_PRICE_ID) return { price: env.STRIPE_PRICE_ID, quantity: 1 };
  return {
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: env.STRIPE_PRECIO_CENTAVOS,
      recurring: { interval: "month" },
      product_data: { name: "CRM Mundo Motos" },
    },
  };
}

export async function crearCheckout(params: { correo: string | null; clienteId: string | null; volverA: string }): Promise<SesionStripe> {
  const r = await llamarStripe("/checkout/sessions", {
    mode: "subscription",
    line_items: [lineaDePrecio()],
    success_url: `${params.volverA}?pago=ok`,
    cancel_url: `${params.volverA}?pago=cancelado`,
    // Con cliente existente se reutiliza (y se conserva su tarjeta); si no, Stripe crea uno con el correo.
    ...(params.clienteId ? { customer: params.clienteId } : params.correo ? { customer_email: params.correo } : {}),
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });
  return urlSesion(r);
}

export async function crearPortal(params: { clienteId: string; volverA: string }): Promise<SesionStripe> {
  const r = await llamarStripe("/billing_portal/sessions", { customer: params.clienteId, return_url: params.volverA });
  return urlSesion(r);
}
