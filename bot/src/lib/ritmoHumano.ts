/**
 * Ritmo humano de las respuestas. El modelo contesta en 2 o 3 segundos y eso se nota: una persona lee, piensa y
 * escribe. Acá se calcula cuánto debería tardar una respuesta según su largo; la espera real corre EN PARALELO al
 * modelo (solo se espera lo que falte), así que no suma tiempo ni cuesta tokens.
 *
 *  - Primera respuesta de la conversación (la clienta acaba de tocar un anuncio): rápida, 6 a 8 s.
 *  - Texto fijo (aviso por mensaje cortado): 3 a 4 s.
 *  - Resto: tiempo de lectura (3 a 5 s) + escritura (~30 ms por letra), con variación de ±20 %, entre 8 y 15 s.
 */
export type TipoRespuesta = "primera" | "normal" | "fija";

const LIMITES: Record<TipoRespuesta, { min: number; max: number }> = {
  primera: { min: 6_000, max: 8_000 },
  normal: { min: 8_000, max: 15_000 },
  fija: { min: 3_000, max: 4_000 },
};

const LECTURA_MIN_MS = 3_000;
const LECTURA_MAX_MS = 5_000;
const MS_POR_LETRA = 30;
const VARIACION = 0.2;

export function pausaObjetivoMs(params: {
  caracteres: number;
  tipo: TipoRespuesta;
  /** Número en [0, 1); se inyecta para poder probar sin azar. */
  azar?: () => number;
  /** Multiplica la pausa final (RITMO_FACTOR): 1 = tal cual, 0.5 = la mitad. */
  factor?: number;
}): number {
  const azar = params.azar ?? Math.random;
  const lectura = LECTURA_MIN_MS + azar() * (LECTURA_MAX_MS - LECTURA_MIN_MS);
  const variacion = 1 + (azar() * 2 - 1) * VARIACION;
  const crudo = (lectura + Math.max(0, params.caracteres) * MS_POR_LETRA) * variacion;
  const { min, max } = LIMITES[params.tipo];
  const ms = Math.min(max, Math.max(min, crudo));
  return Math.round(ms * (params.factor ?? 1));
}

/** Cuánto falta esperar si ya pasaron `transcurridoMs` desde que llegó el mensaje. Nunca negativo. */
export function faltanteMs(objetivoMs: number, transcurridoMs: number): number {
  return Math.max(0, Math.round(objetivoMs - transcurridoMs));
}
