/**
 * Botones de respuesta rápida pedidos desde el texto. En vez de una herramienta (que obliga a una llamada extra al
 * modelo en cada mensaje con botones), el asesor termina su mensaje con una línea exacta:
 *
 *   [[botones: Maquilladora | Estilista | Recién empiezo]]
 *
 * El sistema la quita del texto y la convierte en botones de WhatsApp (2 o 3, máximo 20 caracteres cada uno). Una marca
 * mal escrita se quita igual: la clienta nunca ve los corchetes.
 */
const MARCA = /\[\[\s*botones\s*:?([^\]\n]*)(?:\]\]?)?/gi;

export function extraerBotones(texto: string): { texto: string; botones: string[] | null } {
  let ultimas: string | null = null;
  const limpio = texto
    .replace(MARCA, (_m, opciones: string) => {
      ultimas = opciones;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (ultimas === null) return { texto: limpio, botones: null };
  const opciones = (ultimas as string)
    .split(/\s*[|·]\s*/)
    .map((o) => o.trim().replace(/^["“«]+|["”»]+$/g, "").trim())
    .filter((o) => o.length >= 2 && o.length <= 20)
    .slice(0, 3);
  return { texto: limpio, botones: opciones.length >= 2 ? opciones : null };
}
