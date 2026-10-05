import { z } from "zod";
import type { AgentTool } from "./types.js";
import { normalizarTelefono } from "../../lib/telefono.js";
import {
  getClienteByTelefono,
  guardarTelefonoCliente,
  guardarNombreCliente,
  guardarEmailCliente,
  guardarInteresCliente,
  INTERESES,
} from "../../db/repositories/clientes.js";
import { logger } from "../../lib/logger.js";

const inputSchema = z.object({
  telefono: z.string().optional(),
  nombre: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().optional(),
  interes: z.enum(INTERESES).optional(),
});

/**
 * Así es como un lead de Instagram/Messenger termina reservando sin salir del
 * canal: el modelo la llama cuando el cliente da su número, y las tools de
 * reserva y matrícula (que exigen teléfono) empiezan a funcionar en el mismo
 * turno.
 *
 * El número que llega aquí lo escribió el cliente en el chat: NO está
 * verificado. Por eso esta tool nunca fusiona fichas ni cambia de cliente:
 * - En WhatsApp se ignora: el número real es el del remitente (ctx.telefono).
 * - En los demás canales solo se guarda si ese número no es de otro cliente
 *   ni tiene matrículas previas. Si ya está en uso, cualquiera podría decir
 *   un número ajeno para ver sus citas y matrículas o pisar sus datos; la
 *   fusión queda para el staff, desde la ficha del panel (que sí confirma).
 */
export const guardarDatosContactoTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: "guardar_datos_contacto",
  description:
    "Guarda los datos que el cliente da voluntariamente: su número de WhatsApp, nombre, correo y qué le interesa " +
    "(interes: comprar, rentar, vender, invertir u otro). Llámala apenas los dé, sin esperar a escalar. El teléfono " +
    "debe ser el número de WhatsApp de la persona (10 dígitos en México, con o sin el 52 delante); nunca inventes uno. " +
    "Si devuelve 'telefono_no_verificable', no la reintentes con ese número: sigue la instrucción que trae. " +
    "Nunca pidas ni guardes contraseñas ni datos de tarjetas.",
  inputSchema,
  mutates: true,
  jsonSchema: {
    type: "object",
    properties: {
      telefono: { type: "string", description: "Número de WhatsApp del cliente (México, 10 dígitos)" },
      nombre: { type: "string" },
      email: { type: "string" },
      interes: { type: "string", enum: [...INTERESES], description: "Qué busca el cliente" },
    },
  },
  handler: async (input, ctx) => {
    const hayAlgo = [input.telefono, input.nombre, input.email, input.interes].some((v) => v !== undefined);
    if (!hayAlgo) return { ok: false, error: "sin_datos" };

    let telefonoNoVerificable = false;

    // En WhatsApp el teléfono es el del remitente (lo certifica Meta): lo que
    // diga el texto del chat no lo cambia.
    if (input.telefono && ctx.canal !== "whatsapp") {
      const normalizado = normalizarTelefono(input.telefono);
      if (!normalizado) {
        return { ok: false, error: "telefono_invalido", instruccion: "Pídele el número de nuevo, parece incompleto." };
      }

      if (normalizado !== ctx.telefono) {
        const existente = await getClienteByTelefono(normalizado);
        const esDeOtroCliente = existente !== null && existente.id !== ctx.clienteId;

        if (esDeOtroCliente) {
          telefonoNoVerificable = true;
          logger.warn(
            { conversacionId: ctx.conversacionId, canal: ctx.canal },
            "guardar_datos_contacto: el número dado ya tiene dueño; no se guarda ni se fusiona",
          );
        } else {
          if (!existente) await guardarTelefonoCliente(ctx.clienteId, normalizado);
          ctx.telefono = normalizado;
        }
      }
    }

    // Siempre sobre la ficha propia de quien escribe (ctx.clienteId no cambia).
    if (input.nombre) await guardarNombreCliente(ctx.clienteId, input.nombre).catch(() => {});
    if (input.email) await guardarEmailCliente(ctx.clienteId, input.email).catch(() => {});
    if (input.interes) await guardarInteresCliente(ctx.clienteId, input.interes).catch(() => {});

    if (telefonoNoVerificable) {
      return {
        ok: false,
        error: "telefono_no_verificable",
        instruccion:
          "No se pudo asociar ese número desde este canal (el resto de datos sí se guardó). No lo reintentes ni le " +
          "digas a quién pertenece el número ni si está registrado. Dile que, por seguridad, escriba desde ese " +
          "mismo WhatsApp a este número; si prefiere " +
          "seguir por aquí, llama a escalar_a_humano con el motivo 'dio un teléfono que no se pudo verificar: " +
          "confirmar que es suyo y unir las fichas desde el panel'.",
      };
    }

    return { ok: true };
  },
};
