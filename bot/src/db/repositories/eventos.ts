import { supabase } from "../client.js";

export type TipoEvento =
  | "asignacion"
  | "etapa"
  | "estado"
  | "cierre"
  | "fusion"
  | "respuesta_privada"
  | "escalada"
  /** El cliente mandó un archivo (foto de comprobantes, PDF, ficha RUC…). Lo registra agent/documentoEntrante.ts. */
  | "documento"
  /** El bot reservó una cita o matriculó un curso por las API del sitio. */
  | "reserva"
  | "matricula";

/**
 * `eventos_conversacion` se llena sobre todo con triggers de Postgres
 * (asignación, cambio de etapa/estado, cierre) — esto es para los tipos que
 * 0002_omnicanal.sql documenta como responsabilidad del bot: `fusion` (lo hace
 * la propia función SQL `fusionar_clientes`, no hace falta llamarlo desde
 * acá), `respuesta_privada`, `escalada` y `documento`. Sin policy de insert
 * para `authenticated` a propósito — el bot escribe con service role, que no
 * pasa por RLS.
 */
export async function registrarEvento(conversacionId: string, tipo: TipoEvento, detalle: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.from("eventos_conversacion").insert({ conversacion_id: conversacionId, tipo, detalle });
  if (error) throw error;
}
