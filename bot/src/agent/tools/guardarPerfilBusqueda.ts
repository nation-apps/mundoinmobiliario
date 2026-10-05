import { z } from "zod";
import type { AgentTool } from "./types.js";
import { guardarPerfilCliente } from "../../db/repositories/clientes.js";

const campo = z.string().trim().min(1).max(200).optional();

const inputSchema = z.object({
  operacion: z.enum(["comprar", "rentar", "vender", "invertir"]).optional(),
  tipo_inmueble: campo,
  zona: campo,
  presupuesto: campo,
  recamaras: campo,
  plazo: campo,
  forma_de_pago: campo,
  notas: campo,
});

/**
 * Guarda, ordenado, lo que la persona va contando de lo que busca. El asesor lo ve en la ficha del contacto, así no
 * tiene que releer el chat. Cada llamada se mezcla con lo anterior: manda solo lo nuevo.
 */
export const guardarPerfilBusquedaTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: "guardar_perfil_busqueda",
  description:
    "Guarda lo que la persona cuenta de lo que busca: operación (comprar, rentar, vender o invertir), tipo de inmueble, " +
    "zona, presupuesto, recámaras, para cuándo lo necesita, forma de pago (contado, crédito) y cualquier nota útil para " +
    "el asesor. Llámala apenas sepas algo nuevo, con solo los campos nuevos, tal cual lo dijo (no inventes ni " +
    "completes lo que no dijo).",
  inputSchema,
  mutates: true,
  jsonSchema: {
    type: "object",
    properties: {
      operacion: { type: "string", enum: ["comprar", "rentar", "vender", "invertir"] },
      tipo_inmueble: { type: "string", description: "Casa, departamento, terreno, local…" },
      zona: { type: "string", description: "Colonia, zona o ciudad que le interesa" },
      presupuesto: { type: "string", description: "Tal cual lo dijo, con su moneda" },
      recamaras: { type: "string" },
      plazo: { type: "string", description: "Para cuándo lo necesita" },
      forma_de_pago: { type: "string", description: "Contado, crédito bancario, Infonavit…" },
      notas: { type: "string", description: "Algo más que le sirva al asesor" },
    },
  },
  handler: async (input, ctx) => {
    if (Object.values(input).every((v) => v === undefined)) return { ok: false, error: "sin_datos" };
    await guardarPerfilCliente(ctx.clienteId, input);
    return { ok: true };
  },
};
