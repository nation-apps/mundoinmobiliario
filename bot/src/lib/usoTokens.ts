/**
 * Cuánto "pesa" una respuesta del modelo contra el tope diario de gasto
 * (DAILY_TOKEN_BUDGET). Cada tipo de token pesa lo que cuesta respecto a un
 * token de entrada normal: leer de la caché ~10 %, escribirla en la caché de
 * 5 minutos ~125 % y en la de 1 hora ~200 %. Con el prompt de ~18.000 tokens
 * esa diferencia es lo que más cuesta, así que el contador no puede tratarlos igual.
 */
export type UsoModelo = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
};

export function pesoDeUso(u: UsoModelo): number {
  const escritaTotal = u.cache_creation_input_tokens ?? 0;
  const de1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  // Si la respuesta no desglosa por duración, todo se trata como la de 5 minutos.
  const de5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : escritaTotal;
  return Math.round(u.input_tokens + u.output_tokens + de5m * 1.25 + de1h * 2 + (u.cache_read_input_tokens ?? 0) * 0.1);
}
