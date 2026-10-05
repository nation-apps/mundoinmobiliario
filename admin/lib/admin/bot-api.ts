"use client";

import type { EstadoCanales, Mensaje } from "./chats-tipos";

/**
 * Cliente del bot para componentes de cliente. Siempre pasa por
 * /api/admin/bot/* (el puente del servidor), que agrega la sesión del staff
 * y conoce la URL del bot.
 */
export class BotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "BotApiError";
  }
}

const MENSAJES: Record<string, string> = {
  ventana_cerrada: "Pasaron más de 24 horas desde el último mensaje del cliente: ya no se puede escribir texto libre por este canal.",
  canal_sin_respuesta: "Este contacto llegó por el formulario web: escríbele por WhatsApp.",
  sin_telefono: "Este contacto todavía no tiene un número al que escribirle.",
  conversacion_no_encontrada: "La conversación ya no existe.",
  whatsapp_no_configurado: "WhatsApp todavía no está conectado al bot.",
  telefono_en_uso: "Ese número ya pertenece a otro contacto.",
  telefono_invalido: "El número no parece un celular mexicano válido.",
  comentario_no_admite_privado: "Ya se usó la respuesta privada de este comentario, o pasaron más de 7 días.",
  bot_no_disponible: "No se pudo conectar con el bot. Revisa que esté en línea en Railway.",
  bot_no_configurado: "Falta configurar la URL del bot en el servidor (BOT_API_URL).",
  sin_sesion: "Tu sesión se cerró. Vuelve a entrar al panel.",
  forbidden: "Tu usuario no tiene permiso para esta acción.",
};

async function llamar<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin/bot/${ruta}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const code = typeof json.error === "string" ? json.error : `http_${res.status}`;
    const detalle = typeof json.mensaje === "string" ? json.mensaje : MENSAJES[code];
    throw new BotApiError(detalle ?? `El bot respondió ${res.status} (${code}).`, res.status, code);
  }
  return json as T;
}

export function enviarMensajeHumano(conversacionId: string, texto: string): Promise<{ mensaje: Mensaje }> {
  return llamar("mensajes", { method: "POST", body: JSON.stringify({ conversacionId, texto }) });
}

export function enviarPlantillaMensaje(conversacionId: string, plantillaId: string): Promise<{ mensaje: Mensaje }> {
  return llamar("mensajes", { method: "POST", body: JSON.stringify({ conversacionId, plantillaId }) });
}

export function responderComentario(
  mensajeId: string,
  datos: { modo: "publico" | "privado"; texto: string },
): Promise<{ mensaje: Mensaje } | { conversacionDmId: string }> {
  return llamar(`comentarios/${mensajeId}/responder`, { method: "POST", body: JSON.stringify(datos) });
}

export function sugerirRespuesta(conversacionId: string): Promise<{ texto: string }> {
  return llamar("ia/sugerencia", { method: "POST", body: JSON.stringify({ conversacionId }) });
}

export function marcarVisto(conversacionId: string): Promise<void> {
  return llamar(`conversaciones/${conversacionId}/visto`, { method: "POST", body: "{}" });
}

export function estadoCanales(): Promise<EstadoCanales> {
  return llamar("canales/estado");
}

export function guardarTelefonoContacto(
  clienteId: string,
  telefono: string,
  fusionar = false,
): Promise<{ clienteId: string; fusionado: boolean }> {
  return llamar(`clientes/${clienteId}/telefono`, { method: "POST", body: JSON.stringify({ telefono, fusionar }) });
}

export function escribirWhatsappDesdeFicha(
  clienteId: string,
  datos: { texto?: string; plantilla?: string; parametros?: string[] },
): Promise<{ mensaje: Mensaje; conversacionId: string }> {
  return llamar(`clientes/${clienteId}/whatsapp`, { method: "POST", body: JSON.stringify(datos) });
}

export type PlantillaWhatsApp = { name: string; status: string; language: string; category: string; cuerpo?: string; variables?: number };

export function listarPlantillasWhatsapp(): Promise<{ plantillas: PlantillaWhatsApp[] }> {
  return llamar("plantillas");
}
