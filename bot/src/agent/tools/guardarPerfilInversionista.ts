import { z } from "zod";
import type { AgentTool } from "./types.js";
import { guardarPerfilCliente } from "../../db/repositories/clientes.js";

const campo = z.string().trim().min(1).max(200).optional();

const inputSchema = z.object({
  experiencia: campo,
  objetivo: campo,
  capital: campo,
  plazo: campo,
  ubicacion: campo,
  notas: campo,
});

/**
 * Guarda, ordenado, lo que la persona va contando de su situación como inversionista. El asesor lo ve en la ficha del
 * contacto, así no tiene que releer el chat. Cada llamada se mezcla con lo anterior: manda solo lo nuevo.
 */
export const guardarPerfilInversionistaTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: "guardar_perfil_inversionista",
  description:
    "Guarda lo que la persona cuenta de su situación: experiencia invirtiendo (nunca ha invertido, tiene alguna propiedad, " +
    "ya tiene cartera), objetivo (ingresos por rentas, primera propiedad, escalar), capital disponible, en cuánto tiempo " +
    "quiere empezar, país y ciudad donde piensa invertir, y cualquier nota útil para el asesor. Llámala apenas sepas algo " +
    "nuevo, con solo los campos nuevos, tal cual lo dijo (no inventes ni completes lo que no dijo).",
  inputSchema,
  mutates: true,
  jsonSchema: {
    type: "object",
    properties: {
      experiencia: { type: "string", description: "Su experiencia invirtiendo en bienes raíces" },
      objetivo: { type: "string", description: "Qué quiere lograr: ingresos por rentas, primera propiedad, escalar cartera…" },
      capital: { type: "string", description: "Capital con el que cuenta, tal cual lo dijo y con su moneda" },
      plazo: { type: "string", description: "En cuánto tiempo quiere empezar" },
      ubicacion: { type: "string", description: "País y ciudad donde vive o donde piensa invertir" },
      notas: { type: "string", description: "Algo más que le sirva al asesor" },
    },
  },
  handler: async (input, ctx) => {
    if (Object.values(input).every((v) => v === undefined)) return { ok: false, error: "sin_datos" };
    await guardarPerfilCliente(ctx.clienteId, input);
    return { ok: true };
  },
};
