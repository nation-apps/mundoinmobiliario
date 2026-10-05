import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const GRAPH = (path: string) => `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${path}`;

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(GRAPH(path), {
    ...init,
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) throw new Error(`Graph ${res.status}: ${json.error?.message ?? "sin detalle"}`);
  return json;
}

/**
 * El botón "Registrar" del panel de Meta falla sin detalle (visto en Aura y
 * AZ). Registrar por API sí funciona: POST /{PHONE_NUMBER_ID}/register con
 * el PIN de 6 dígitos. Para no tener que correr un curl a mano, el bot lo
 * hace solo al arrancar si `WHATSAPP_REGISTER_PIN` está cargado y el número
 * no está registrado todavía. Además suscribe la app a la WABA
 * (POST /{WABA_ID}/subscribed_apps), que es lo que hace llegar los webhooks.
 *
 * Es idempotente: con el número ya registrado no hace nada, así que la
 * variable puede quedarse cargada (o borrarse después, como prefiera el
 * equipo; el PIN sigue haciendo falta para re-registrar el número algún día).
 */
export async function registrarNumeroSiHaceFalta(): Promise<void> {
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID!;

  if (env.WHATSAPP_WABA_ID) {
    try {
      const subs = await graph<{ data: { id: string; name: string }[] }>(`${env.WHATSAPP_WABA_ID}/subscribed_apps`);
      if (subs.data.length === 0) {
        await graph(`${env.WHATSAPP_WABA_ID}/subscribed_apps`, { method: "POST" });
        logger.info({ wabaId: env.WHATSAPP_WABA_ID }, "App suscrita a la cuenta de WhatsApp Business");
      }
    } catch (err) {
      logger.warn({ err }, "No se pudo comprobar/suscribir la app a la WABA (¿token sin whatsapp_business_management?)");
    }
  }

  const estado = await graph<{ platform_type?: string; status?: string; display_phone_number?: string; code_verification_status?: string }>(
    `${phoneId}?fields=display_phone_number,platform_type,status,code_verification_status`,
  ).catch((err: unknown) => {
    logger.warn({ err }, "No se pudo leer el estado del número de WhatsApp");
    return null;
  });
  if (!estado) return;

  logger.info({ numero: estado.display_phone_number, plataforma: estado.platform_type, estado: estado.status }, "Estado del número de WhatsApp");
  if (estado.platform_type === "CLOUD_API" && estado.status === "CONNECTED") return;

  const pin = process.env.WHATSAPP_REGISTER_PIN?.trim();
  if (!pin || !/^\d{6}$/.test(pin)) {
    logger.warn("El número no está registrado en la API de la nube y no hay WHATSAPP_REGISTER_PIN (6 dígitos): cárgalo y reinicia");
    return;
  }

  await graph(`${phoneId}/register`, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", pin }) });
  logger.info({ numero: estado.display_phone_number }, "Número de WhatsApp registrado en la API de la nube");
}
