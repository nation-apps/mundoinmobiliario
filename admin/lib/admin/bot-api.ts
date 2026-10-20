"use client";

import type { InfoAnuncio } from "./anuncio";
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
  stripe_no_configurado: "El cobro todavía no está configurado en el servidor.",
  stripe_error: "Stripe no pudo crear la sesión de pago. Inténtalo de nuevo en un momento.",
  ya_activa: "La suscripción ya está activa.",
  sin_cliente: "Todavía no hay un pago registrado que administrar.",
  panel_url_no_configurada: "Falta configurar la dirección pública del panel en el servidor.",
  whatsapp_qr_apagado: "La conexión por QR está apagada en el servidor (WHATSAPP_QR_ACTIVO).",
  whatsapp_qr_desconectado: "WhatsApp por QR no está conectado.",
  anuncio_no_disponible: "Meta no dejó leer este anuncio.",
  linea_invalida: "Esa línea de WhatsApp no existe.",
  linea_desconocida: "Esa línea de WhatsApp no existe.",
  persona_no_encontrada: "Esa persona ya no está en el equipo.",
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

/** `linea`: solo WhatsApp, la línea desde la que se manda (si no es la del chat, el chat se pasa a ella). */
export function enviarMensajeHumano(conversacionId: string, texto: string, linea?: string): Promise<{ mensaje: Mensaje }> {
  return llamar("mensajes", { method: "POST", body: JSON.stringify({ conversacionId, texto, ...(linea ? { linea } : {}) }) });
}

export function enviarPlantillaMensaje(conversacionId: string, plantillaId: string, linea?: string): Promise<{ mensaje: Mensaje }> {
  return llamar("mensajes", { method: "POST", body: JSON.stringify({ conversacionId, plantillaId, ...(linea ? { linea } : {}) }) });
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

/** Crea la sesión de pago de la suscripción en Stripe; devuelve a dónde mandar a la persona. */
export function iniciarPago(): Promise<{ url: string }> {
  return llamar("pagos/checkout", { method: "POST", body: "{}" });
}

/** Portal de Stripe: cambiar la tarjeta, ver facturas o cancelar. */
export function abrirPortalDePago(): Promise<{ url: string }> {
  return llamar("pagos/portal", { method: "POST", body: "{}" });
}

/** WhatsApp por QR (no oficial): lo que el bot dice de cada línea (un número por línea). */
export type EstadoLineaWhatsappQr = {
  id: string;
  etiqueta: string;
  marca: string;
  estado: "apagado" | "sin_sesion" | "esperando_qr" | "conectando" | "conectado" | "desconectado";
  /** Imagen del QR (data URL) mientras se espera el escaneo. */
  qr: string | null;
  telefono: string | null;
  telefonoEsperado: string;
  /** Se conectó un número que no es el esperado para esta línea. */
  advertencia: string | null;
  error: string | null;
};
export type EstadoWhatsappQr = { activo: boolean; lineas: EstadoLineaWhatsappQr[] };

export function estadoWhatsappQr(): Promise<EstadoWhatsappQr> {
  return llamar("whatsapp-qr");
}

export function conectarWhatsappQr(linea: string): Promise<EstadoWhatsappQr> {
  return llamar("whatsapp-qr/iniciar", { method: "POST", body: JSON.stringify({ linea }) });
}

export function desconectarWhatsappQr(linea: string): Promise<EstadoWhatsappQr> {
  return llamar("whatsapp-qr/desconectar", { method: "POST", body: JSON.stringify({ linea }) });
}

/** De qué líneas de WhatsApp recibe leads una persona del equipo (solo administración). */
export function cambiarLineasPersona(personaId: string, lineas: string[]): Promise<{ lineas: string[] }> {
  return llamar(`equipo/${personaId}/lineas`, { method: "POST", body: JSON.stringify({ lineas }) });
}

/** De qué anuncio vino un lead: nombre, campaña, video o imagen y un enlace para verlo. */
export function infoAnuncio(id: string): Promise<InfoAnuncio> {
  return llamar(`anuncios/${id}`);
}
