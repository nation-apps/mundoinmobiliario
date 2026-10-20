import { logger } from "../lib/logger.js";
import { marcaDeLinea } from "../lib/lineas.js";
import { leerBienvenida, type Bienvenida } from "../db/repositories/bienvenida.js";
import { clienteAnulado } from "../db/repositories/etiquetas.js";
import { guardarMensaje, tieneRespuestaDelEquipo } from "../db/repositories/mensajes.js";
import { nombreDeStaff } from "../db/repositories/staff.js";
import type { Conversacion } from "../db/repositories/conversaciones.js";
import { sendTextIfWindowOpen } from "../whatsapp/window.js";
import { nombreDelAsesor, nombreParaSaludo, rellenarPlantilla } from "./primerMensajeLead.js";

const log = logger.child({ modulo: "bienvenida-directa" });

/** Espera antes de mandarla: que el mensaje de la persona ya esté guardado y se vea natural (no es una respuesta instantánea). */
const ESPERA_MIN_MS = 2_000;
const ESPERA_EXTRA_MS = 2_500;

/** La bienvenida con sus datos puestos, o null si está apagada o sin texto. Pura, para poder probarla. */
export function armarBienvenidaDirecta(
  config: Pick<Bienvenida, "directo_activo" | "directo_texto">,
  datos: { nombreContacto?: string | null | undefined; marca: string | null; asesor: string | null },
): string | null {
  const plantilla = config.directo_texto?.trim();
  if (!config.directo_activo || !plantilla) return null;
  return rellenarPlantilla(plantilla, {
    nombre: nombreParaSaludo(datos.nombreContacto),
    marca: datos.marca ?? "",
    interes: null,
    asesor: nombreDelAsesor(datos.asesor),
  });
}

/**
 * La bienvenida de quien escribe por PRIMERA vez a una línea (campaña de clic a WhatsApp o mensaje directo), con el texto que el
 * administrador escribió para esa línea y solo si la encendió. Solo en chats que empiezan en modo persona: si contesta el bot, el
 * bot ya saluda. Una sola vez por chat (solo si el chat no tenía mensajes) y nunca si el equipo ya contestó.
 *
 * `primerContacto` lo calcula quien llama ANTES de guardar el mensaje de la persona. No bloquea: se programa y sigue.
 */
export function programarBienvenidaDirecta(p: {
  conversacion: Conversacion;
  telefono: string;
  nombreContacto?: string | undefined;
  linea: string;
  primerContacto: boolean;
}): void {
  if (!p.primerContacto || p.conversacion.estado !== "escalada") return;
  void (async () => {
    const config = await leerBienvenida(p.linea);
    if (!armarBienvenidaDirecta(config, { marca: null, asesor: null })) return;

    await new Promise((r) => setTimeout(r, ESPERA_MIN_MS + Math.random() * ESPERA_EXTRA_MS));
    // Si en estos segundos alguien del equipo ya le contestó, no se le encima.
    if (await tieneRespuestaDelEquipo(p.conversacion.id)) return;
    if (await clienteAnulado(p.conversacion.cliente_id)) return;

    const asesor = p.conversacion.asignada_a ? await nombreDeStaff(p.conversacion.asignada_a).catch(() => null) : null;
    const texto = armarBienvenidaDirecta(config, { nombreContacto: p.nombreContacto, marca: marcaDeLinea(p.linea), asesor });
    if (!texto) return;
    const waMessageId = await sendTextIfWindowOpen(p.telefono, texto, p.linea);
    if (!waMessageId) return;
    await guardarMensaje({
      conversacionId: p.conversacion.id,
      rol: "assistant",
      contenido: texto,
      externalId: waMessageId,
      waMessageId,
      metadata: { via: "bienvenida_directa" },
    });
    log.info({ conversacionId: p.conversacion.id, linea: p.linea }, "Bienvenida enviada a quien escribió por primera vez");
  })().catch((err: unknown) => log.warn({ err }, "No se pudo mandar la bienvenida a quien escribió por primera vez"));
}
