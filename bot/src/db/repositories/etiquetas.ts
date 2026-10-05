import { supabase } from "../client.js";

/**
 * Etiqueta que anula un contacto: no es el público del negocio (pide fotos personales, otras intenciones, spam).
 * Se asigna desde la ficha del contacto en el panel. El bot la reconoce por el nombre, sin importar mayúsculas ni tildes.
 */
export const ETIQUETA_ANULADO = "Anulado";

export function esEtiquetaAnulado(nombre: string): boolean {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() === "anulado";
}

type FilaEtiquetada = { cliente_id: string; etiquetas: { nombre: string } | { nombre: string }[] | null };

function esAnuladoLaFila(fila: FilaEtiquetada): boolean {
  const e = fila.etiquetas;
  const lista = Array.isArray(e) ? e : e ? [e] : [];
  return lista.some((x) => esEtiquetaAnulado(x.nombre));
}

/**
 * ¿Este contacto está anulado? Si la consulta falla devuelve false: es mejor contestar de más que dejar sin respuesta
 * a una clienta real por un fallo de la base.
 */
export async function clienteAnulado(clienteId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("cliente_etiquetas")
      .select("cliente_id, etiquetas!inner(nombre)")
      .eq("cliente_id", clienteId);
    if (error) throw error;
    return ((data ?? []) as unknown as FilaEtiquetada[]).some(esAnuladoLaFila);
  } catch {
    return false;
  }
}

/** Ids de todos los contactos anulados (para que los seguimientos los salten en bloque). */
export async function clientesAnulados(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from("cliente_etiquetas").select("cliente_id, etiquetas!inner(nombre)");
    if (error) throw error;
    return new Set(((data ?? []) as unknown as FilaEtiquetada[]).filter(esAnuladoLaFila).map((f) => f.cliente_id));
  } catch {
    return new Set();
  }
}
