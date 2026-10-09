import { z } from "zod";
import type { AgentTool } from "./types.js";
import { guardarPerfilCliente } from "../../db/repositories/clientes.js";

const campo = z.string().trim().min(1).max(200).optional();

const inputSchema = z.object({
  moto: campo,
  uso: campo,
  presupuesto: campo,
  enganche: campo,
  pago: campo,
  plazo: campo,
  ubicacion: campo,
  vehiculo: campo,
  solicitud: campo,
  kilometraje: campo,
  horario_visita: campo,
  notas: campo,
});

/**
 * Guarda, ordenado, lo que la persona va contando: la moto que quiere comprar, o la moto que ya tiene y la refacción,
 * accesorio o servicio de taller que necesita. El asesor lo ve en la ficha del contacto, así no tiene que releer el
 * chat. Cada llamada se mezcla con lo anterior: manda solo lo nuevo.
 */
export const guardarPerfilCompraTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: "guardar_perfil_compra",
  description:
    "Guarda lo que la persona cuenta. Si quiere comprar: qué modelo le interesa, para qué la usaría, presupuesto, " +
    "cuánto tiene para el enganche, si sería de contado o con financiamiento y para cuándo. Si busca refacciones, " +
    "accesorios o taller: la marca, modelo y año de su moto, qué pieza, accesorio o servicio necesita (o qué falla " +
    "presenta) y el kilometraje. Siempre que lo diga: su ciudad (y si puede visitar la sucursal) y el día y hora que " +
    "pidió para visitar o para la cita. Llámala apenas sepas algo nuevo, con solo los campos nuevos, tal cual lo dijo " +
    "(no inventes ni completes lo que no dijo).",
  inputSchema,
  mutates: true,
  jsonSchema: {
    type: "object",
    properties: {
      moto: { type: "string", description: "Modelo TVS que quiere comprar" },
      uso: { type: "string", description: "Para qué usaría la moto" },
      presupuesto: { type: "string", description: "Presupuesto, tal cual lo dijo y con su moneda" },
      enganche: { type: "string", description: "Cuánto tiene para el enganche, tal cual lo dijo" },
      pago: { type: "string", description: "Contado o financiamiento" },
      plazo: { type: "string", description: "Para cuándo piensa comprar" },
      ubicacion: { type: "string", description: "Ciudad donde vive y si puede visitar la sucursal en Cancún" },
      vehiculo: { type: "string", description: "Su moto actual: marca, modelo y año (para refacciones o taller)" },
      solicitud: { type: "string", description: "La pieza, accesorio o servicio que necesita, o la falla que presenta" },
      kilometraje: { type: "string", description: "Kilometraje aproximado de su moto (taller)" },
      horario_visita: { type: "string", description: "Día y hora que pidió para visitar la sucursal o para la cita" },
      notas: { type: "string", description: "Algo más que le sirva al asesor" },
    },
  },
  handler: async (input, ctx) => {
    if (Object.values(input).every((v) => v === undefined)) return { ok: false, error: "sin_datos" };
    await guardarPerfilCliente(ctx.clienteId, input);
    return { ok: true };
  },
};
