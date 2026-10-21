import { normalizarTelefono } from "../lib/telefono.js";

export type DatosFormulario = { telefono: string | null; email: string | null };

/**
 * El botón «Enviar por WhatsApp» del formulario de Meta manda un primer mensaje armado con las respuestas del formulario
 * («¡Hola! Completé el formulario y… Phone number: +52… Email: …»). Ese teléfono es el que la persona escribió en el formulario,
 * y puede ser distinto del número desde el que escribe. Devuelve esos datos, o null si el texto no es de ese tipo.
 */
export function datosDelFormularioEnMensaje(texto: string): DatosFormulario | null {
  if (!/complet[eé] el formulario/i.test(texto)) return null;
  const crudoTelefono = texto.match(/(?:phone number|tel[eé]fono)\s*:\s*(\+?[\d\s().-]{8,22})/i)?.[1] ?? null;
  const telefono = crudoTelefono ? normalizarTelefono(crudoTelefono) : null;
  const email = texto.match(/(?:e-?mail|correo)\s*:\s*([^\s<>()]+@[^\s<>()]+\.[^\s<>()]+)/i)?.[1]?.toLowerCase() ?? null;
  if (!telefono && !email) return null;
  return { telefono, email };
}
