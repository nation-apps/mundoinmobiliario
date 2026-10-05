/**
 * Quita la raya larga (—) de lo que el bot le manda al cliente: en un chat
 * delata que el texto lo escribió una IA (lo pidió AZ). El prompt ya lo
 * prohíbe, pero Claude a veces la usa igual, así que se limpia acá.
 *
 * "precio cerrado — incluye todo" → "precio cerrado, incluye todo". La raya
 * corta (–) solo se toca rodeada de espacios: sin espacios es un rango
 * ("9:00–18:00") y se deja.
 */
export function quitarRayas(texto: string): string {
  return texto
    .replace(/^[ \t]*—[ \t]*/gm, "")
    .replace(/[ \t]*—[ \t]*/g, ", ")
    .replace(/[ \t]+–[ \t]+/g, ", ")
    .replace(/([.,;:!?¡¿])[ \t]*,[ \t]*/g, "$1 ")
    .replace(/,[ \t]*$/gm, "");
}
