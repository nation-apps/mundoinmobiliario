import { z } from "zod";
import type { AgentTool } from "./types.js";
import { guardarPerfilCliente } from "../../db/repositories/clientes.js";

const campo = z.string().trim().min(1).max(200).optional();

const inputSchema = z.object({
  moto: campo,
  uso: campo,
  presupuesto: campo,
  pago: campo,
  plazo: campo,
  ubicacion: campo,
  notas: campo,
});

/**
 * Guarda, ordenado, lo que la persona va contando de la moto que busca. El asesor lo ve en la ficha del contacto, así
 * no tiene que releer el chat. Cada llamada se mezcla con lo anterior: manda solo lo nuevo.
 */
export const guardarPerfilCompraTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: "guardar_perfil_compra",
  description:
    "Guarda lo que la persona cuenta de la moto que busca: qué moto o tipo de moto le interesa, para qué la va a usar " +
    "(ciudad, trabajo o reparto, carretera, primera moto), su presupuesto, cómo piensa pagar (contado o crédito), para " +
    "cuándo la quiere, en qué ciudad está, y cualquier nota útil para el asesor. Llámala apenas sepas algo nuevo, con " +
    "solo los campos nuevos, tal cual lo dijo (no inventes ni completes lo que no dijo).",
  inputSchema,
  mutates: true,
  jsonSchema: {
    type: "object",
    properties: {
      moto: { type: "string", description: "Modelo, marca o tipo de moto que le interesa (o taller, refacciones…)" },
      uso: { type: "string", description: "Para qué la va a usar" },
      presupuesto: { type: "string", description: "Presupuesto, tal cual lo dijo y con su moneda" },
      pago: { type: "string", description: "Cómo piensa pagar: contado, crédito, enganche que tiene…" },
      plazo: { type: "string", description: "Para cuándo la quiere" },
      ubicacion: { type: "string", description: "Ciudad o zona donde vive" },
      notas: { type: "string", description: "Algo más que le sirva al asesor" },
    },
  },
  handler: async (input, ctx) => {
    if (Object.values(input).every((v) => v === undefined)) return { ok: false, error: "sin_datos" };
    await guardarPerfilCliente(ctx.clienteId, input);
    return { ok: true };
  },
};
