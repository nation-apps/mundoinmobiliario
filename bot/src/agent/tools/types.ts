import type { z } from "zod";
import type { CanalConversacion } from "../../db/repositories/conversaciones.js";

/**
 * El teléfono nunca es un parámetro que el modelo pueda pasar — siempre
 * viene del contexto que inyecta el runner a partir del remitente real del
 * mensaje. Así ningún tool puede tocar citas de otro número aunque el modelo
 * se equivoque o intente pasarlo distinto. Lo mismo el canal: de ahí sale el
 * `origen` de cada cita, nunca de un parámetro.
 *
 * Única excepción acotada: `guardar_datos_contacto` en canales sin teléfono
 * (Instagram/Messenger/TikTok) puede rellenar `telefono` con el número que
 * dio el lead, y solo si ese número no pertenece a otro cliente ni tiene
 * matrículas previas. Nunca cambia `clienteId` ni fusiona fichas.
 */
export type AgentContext = {
  /** `web` solo aparece al pedir una sugerencia desde el panel para un lead del formulario. */
  canal: CanalConversacion;
  conversacionId: string;
  /**
   * El cliente dueño de la conversación. Ninguna tool lo cambia: unir dos
   * fichas (cuando un lead da un número que ya es de otro cliente) lo hace
   * el staff desde el panel, que confirma antes de fusionar.
   */
  clienteId: string;
  /**
   * Null en un lead de Instagram/Messenger/TikTok que todavía no dio su número —
   * las tools que operan citas lo necesitan y deben devolver un error
   * instructivo en vez de asumir nada (ver el guard al inicio de cada una).
   * También mutable: `guardar_datos_contacto` lo rellena en caliente.
   */
  telefono: string | null;
  contactName: string | undefined;
  /**
   * Botones de respuesta rápida que el asesor pidió con la marca
   * [[botones: A | B]] al final de su mensaje (ver lib/botones.ts). Los lee
   * handleInbound al enviar la respuesta; en un canal sin botones se ignoran.
   */
  botones?: string[];
};

/**
 * jsonSchema se escribe a mano en paralelo a inputSchema (Zod) — se probó
 * `zod-to-json-schema` y no genera esquemas usables con Zod v4 (devuelve
 * `{}` para schemas reales), así que no hay forma automática de derivarlo
 * sin agregar una dependencia rota. Con una decena de tools de pocos campos,
 * mantener ambos a mano es manejable; inputSchema sigue siendo la
 * validación real en runtime, jsonSchema es solo lo que ve Claude.
 */
export type AgentTool<TInput> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  jsonSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: TInput, ctx: AgentContext) => Promise<unknown>;
  /**
   * true si la tool escribe algo (agendar, cancelar, escalar…). En modo
   * `sugerir` (runner.ts) estas se excluyen de lo que Claude puede ver: una
   * sugerencia de respuesta nunca debe poder agendar ni cancelar nada por sí
   * sola. Sin esto (default false), la tool es de solo lectura.
   */
  mutates?: boolean;
};
