/**
 * Parámetro de esfuerzo de Anthropic (`output_config.effort`) para las llamadas del bot. El SDK instalado todavía no lo
 * tipa, pero la API lo acepta: se agrega como un campo más del cuerpo. Sin BOT_EFFORT no se manda nada.
 */
export type NivelEsfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

export function opcionesEsfuerzo(nivel: NivelEsfuerzo | undefined): { output_config?: { effort: NivelEsfuerzo } } {
  return nivel ? { output_config: { effort: nivel } } : {};
}
