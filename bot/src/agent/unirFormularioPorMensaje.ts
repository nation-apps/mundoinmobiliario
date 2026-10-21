import { logger } from "../lib/logger.js";
import { variantesTelefono } from "../lib/telefono.js";
import { agregarNotaCliente, fusionarClientes, type Cliente } from "../db/repositories/clientes.js";
import { buscarFormularioAbiertoReciente } from "../db/repositories/conversaciones.js";
import { datosDelFormularioEnMensaje } from "./formularioEnMensaje.js";

const log = logger.child({ modulo: "unir-formulario" });

/** Cuánto tiempo después de llenar el formulario se acepta que el primer mensaje de WhatsApp sea de la misma persona. */
const VENTANA_MS = 72 * 3_600_000;

/**
 * Quien llena el formulario y toca «Enviar por WhatsApp» puede escribir desde un número distinto al que puso en el formulario:
 * el mensaje trae su teléfono o su correo, y con ellos se encuentra su registro. Aquí el registro del formulario se fusiona con el
 * del número que escribe (que es al que hay que contestar), para que sea UN lead y no dos. Después, `unirFormularioConWhatsapp`
 * convierte la conversación del formulario en el chat de WhatsApp.
 *
 * Devuelve true si fusionó. Nunca lanza: si algo falla, el chat sigue su curso normal.
 */
export async function unirFormularioPorMensaje(cliente: Pick<Cliente, "id" | "telefono">, texto: string): Promise<boolean> {
  try {
    const datos = datosDelFormularioEnMensaje(texto);
    if (!datos) return false;
    // Escribe desde el mismo número del formulario: el flujo normal ya lo une.
    if (datos.telefono && cliente.telefono && variantesTelefono(datos.telefono).includes(cliente.telefono)) return false;
    const formulario = await buscarFormularioAbiertoReciente({
      telefono: datos.telefono,
      email: datos.email,
      excluirClienteId: cliente.id,
      desde: new Date(Date.now() - VENTANA_MS).toISOString(),
    });
    if (!formulario) return false;
    await fusionarClientes(formulario.clienteId, cliente.id);
    const nota = datos.telefono
      ? `Llenó el formulario con otro teléfono (+${datos.telefono}) y escribió por WhatsApp desde este número.`
      : "Llenó el formulario con un correo y escribió por WhatsApp desde este número.";
    await agregarNotaCliente(cliente.id, nota).catch(() => {});
    log.info({ clienteId: cliente.id, formularioClienteId: formulario.clienteId }, "Formulario fusionado con el chat de WhatsApp");
    return true;
  } catch (err) {
    log.warn({ err, clienteId: cliente.id }, "No se pudo unir el formulario con el mensaje de WhatsApp");
    return false;
  }
}
