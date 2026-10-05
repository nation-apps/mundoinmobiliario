/**
 * Un mensaje que llegó cortado ("H", "Ho", "q"): WhatsApp a veces manda el envío a medio escribir. Contestarlo con el
 * modelo cuesta una llamada completa (el prompt de ~18.000 tokens) para decir lo mismo cada vez, así que se responde
 * con un texto fijo y sin gasto.
 *
 * Es conservador a propósito: solo letras sueltas (1 a 3). "Sí", "no", "ok", "ya", "hi"… son respuestas de verdad y
 * van al modelo; un número, un emoji o un signo también.
 */
export const RESPUESTA_MENSAJE_CORTADO = "Parece que tu mensaje se cortó 😊 ¿Me lo escribes de nuevo?";

const RESPUESTAS_CORTAS_VALIDAS = new Set(["si", "sí", "no", "ok", "oka", "ya", "ja", "je", "ah", "oh", "eh", "ey", "hi", "ola", "vip", "tu", "yo", "ud"]);

export function esMensajeCortado(texto: string): boolean {
  // El primer mensaje que llega de un anuncio trae su contexto pegado: ahí el modelo sí tiene qué contestar.
  if (/Llegó desde un anuncio/i.test(texto)) return false;
  const t = texto.trim().toLowerCase();
  if (!/^\p{L}{1,3}$/u.test(t)) return false;
  return !RESPUESTAS_CORTAS_VALIDAS.has(t);
}
