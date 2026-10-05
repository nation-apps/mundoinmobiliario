import { z } from "zod";
import type { AgentTool } from "./types.js";
import { getPlantillaById, urlPublicaPlantilla } from "../../db/repositories/plantillasMedia.js";
import { guardarMensaje, yaSeEnvioMedia } from "../../db/repositories/mensajes.js";
import { sendMediaIfWindowOpen } from "../../whatsapp/window.js";

const inputSchema = z.object({
  plantilla_id: z.string().uuid(),
});

export const enviarMultimediaTool: AgentTool<z.infer<typeof inputSchema>> = {
  name: "enviar_multimedia",
  description:
    "Envía un archivo de la biblioteca del estudio (brochure, tarifario, lista de requisitos, video… ver " +
    "MULTIMEDIA DISPONIBLE en tus instrucciones) directo por WhatsApp al cliente. Usa el id exacto de esa lista. " +
    "El archivo se manda como " +
    "un mensaje aparte — después de llamar a esta tool, puedes agregar un texto corto si aporta algo, pero no " +
    "es obligatorio, el caption del archivo ya suele bastar.",
  inputSchema,
  mutates: true,
  jsonSchema: {
    type: "object",
    properties: {
      plantilla_id: { type: "string", description: "Id exacto de MULTIMEDIA DISPONIBLE" },
    },
    required: ["plantilla_id"],
  },
  handler: async (input, ctx) => {
    // Hoy el envío de multimedia del bot solo sale por WhatsApp — en los demás
    // canales no está cableado (queda para cuando de verdad haga falta). Sin
    // teléfono, esto es justamente un lead de otro canal: se le explica a
    // Claude en vez de reventar. Con teléfono pero sin ventana abierta en
    // WhatsApp, lo frena sendMediaIfWindowOpen más abajo.
    if (!ctx.telefono) {
      return { ok: false, error: "canal_no_soportado", instruccion: "Por este canal todavía no se puede mandar multimedia; ofrécele el enlace o cuéntaselo por texto." };
    }

    const plantilla = await getPlantillaById(input.plantilla_id);
    if (!plantilla || !plantilla.activo) {
      return { ok: false, error: "plantilla_no_encontrada" };
    }

    const url = urlPublicaPlantilla(plantilla.storage_path);
    // Reenviar el mismo archivo a la misma persona es ruido (y una llamada más al modelo): solo si lo vuelve a pedir.
    if (await yaSeEnvioMedia(ctx.conversacionId, url)) {
      return {
        ok: true,
        ya_enviada: true,
        nota: "Ya se la mandaste hace poco a esta persona: no la repitas. Menciónalo con naturalidad solo si ella la pidió otra vez.",
      };
    }
    const waMessageId = await sendMediaIfWindowOpen({
      telefono: ctx.telefono,
      tipo: plantilla.tipo,
      link: url,
      caption: plantilla.caption,
    });

    if (!waMessageId) {
      return { ok: false, error: "ventana_24h_cerrada" };
    }

    await guardarMensaje({
      conversacionId: ctx.conversacionId,
      rol: "assistant",
      contenido: `[${plantilla.tipo}] ${plantilla.nombre}`,
      mediaUrl: url,
      mediaType: plantilla.tipo,
      waMessageId,
    });

    return { ok: true, nombre: plantilla.nombre };
  },
};
