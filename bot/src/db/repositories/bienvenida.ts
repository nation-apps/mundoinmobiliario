import { supabase } from "../client.js";

/**
 * Los mensajes de bienvenida que escribe el administrador, uno por línea de WhatsApp (tabla `mensajes_bienvenida`, 0013):
 * `formulario_*` es el saludo a quien se registra por un formulario de campaña y `directo_*`, a quien escribe por primera vez a la
 * línea. Cada uno con su interruptor, apagado por defecto. Se guarda en memoria un minuto: no se consulta en cada mensaje.
 */
export type Bienvenida = {
  linea: string;
  formulario_activo: boolean;
  formulario_texto: string | null;
  directo_activo: boolean;
  directo_texto: string | null;
};

const VIGENCIA_MS = 60_000;
const memoria = new Map<string, { valor: Bienvenida; hasta: number }>();

function apagada(linea: string): Bienvenida {
  return { linea, formulario_activo: false, formulario_texto: null, directo_activo: false, directo_texto: null };
}

/** Nunca lanza: sin la tabla (migración 0013 sin correr) o con la base caída, la bienvenida queda apagada. */
export async function leerBienvenida(linea: string): Promise<Bienvenida> {
  const guardada = memoria.get(linea);
  if (guardada && guardada.hasta > Date.now()) return guardada.valor;

  let valor = apagada(linea);
  try {
    const { data, error } = await supabase
      .from("mensajes_bienvenida")
      .select("linea, formulario_activo, formulario_texto, directo_activo, directo_texto")
      .eq("linea", linea)
      .maybeSingle();
    if (!error && data) valor = data as Bienvenida;
  } catch {
    // Se queda apagada.
  }
  memoria.set(linea, { valor, hasta: Date.now() + VIGENCIA_MS });
  return valor;
}

/** Solo para pruebas. */
export function _reiniciarBienvenida(): void {
  memoria.clear();
}
