import { normalizarTelefono } from "./telefono.js";

/**
 * A qué marca pertenece cada línea de WhatsApp del negocio, para el «origen» de los chats que llegan por ella:
 * «WhatsApp Directo TVS», «WhatsApp Directo Mundo de Motos» y «Campaña WhatsApp Meta TVS». El bot atiende UN número a la vez
 * (el de la conexión por QR, o el de la API oficial): ese número decide la marca.
 *
 * Los números son los del documento del cliente. `WHATSAPP_LINEAS` (JSON {"52…": "Marca"}) los cambia o suma, y
 * `WHATSAPP_MARCA` fija la marca sin mirar el número (útil para probar con un número secundario). Se leen de `process.env`
 * a propósito: este archivo es puro y no arrastra la validación de config/env.ts.
 */
const LINEAS_POR_DEFECTO: Record<string, string> = {
  "529987584160": "TVS",
  "529988706920": "Mundo de Motos",
};

let lineaActual: string | null = null;

/** El número con el que está conectado el bot ahora (formato del bot: 52 + 10 dígitos). Null si no hay conexión. */
export function fijarLineaActual(telefono: string | null): void {
  lineaActual = telefono ? normalizarTelefono(telefono) : null;
}

function lineasConocidas(): Record<string, string> {
  const resultado = { ...LINEAS_POR_DEFECTO };
  const crudo = process.env.WHATSAPP_LINEAS;
  if (!crudo) return resultado;
  try {
    const propias = JSON.parse(crudo) as Record<string, unknown>;
    for (const [numero, marca] of Object.entries(propias)) {
      const normal = normalizarTelefono(numero);
      if (normal && typeof marca === "string" && marca.trim()) resultado[normal] = marca.trim();
    }
  } catch {
    // Un JSON mal escrito no debe tumbar nada: se usan los números de siempre.
  }
  return resultado;
}

/** La marca de la línea por la que está atendiendo el bot; null si no se sabe (número desconocido o sin conexión). */
export function marcaDeLaLinea(): string | null {
  const fija = process.env.WHATSAPP_MARCA?.trim();
  if (fija) return fija;
  if (!lineaActual) return null;
  return lineasConocidas()[lineaActual] ?? null;
}
