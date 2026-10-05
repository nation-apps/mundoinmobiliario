import { isWithin24hWindow } from "../whatsapp/window.js";
import { sendText, sendMedia, sendButtons, marcarLeidoYEscribiendo } from "../whatsapp/client.js";
import type { CanalAdapter, ResultadoEnvioCanal } from "./types.js";

const MOTIVO_VENTANA_CERRADA =
  "Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp solo permite retomar el contacto con una plantilla aprobada.";

/**
 * A diferencia de sendTextIfWindowOpen() (whatsapp/window.ts), acá la
 * ventana se calcula con el `ultimoMensajeAt` que ya trae quien llama — no
 * hace una consulta aparte a la base. sendTextIfWindowOpen sigue existiendo
 * para los casos que no tienen una conversación de por medio (el aviso a
 * ESCALATION_PHONE, los recordatorios): ese sí necesita ir a buscar el dato.
 */
export const whatsappAdapter: CanalAdapter = {
  canal: "whatsapp",
  async enviarTexto({ destinatarioId, texto, ultimoMensajeAt }): Promise<ResultadoEnvioCanal> {
    const abierta = isWithin24hWindow(ultimoMensajeAt ? new Date(ultimoMensajeAt) : null);
    if (!abierta) {
      return { externalId: null, motivoCierre: MOTIVO_VENTANA_CERRADA };
    }
    const messageId = await sendText(destinatarioId, texto);
    return { externalId: messageId };
  },

  async enviarBotones({ destinatarioId, texto, opciones, ultimoMensajeAt }): Promise<ResultadoEnvioCanal> {
    const abierta = isWithin24hWindow(ultimoMensajeAt ? new Date(ultimoMensajeAt) : null);
    if (!abierta) {
      return { externalId: null, motivoCierre: MOTIVO_VENTANA_CERRADA };
    }
    // Límites de WhatsApp: hasta 3 botones, título de 20 caracteres, cuerpo de 1024.
    const botones = opciones.slice(0, 3).map((titulo, i) => ({ id: `op_${i + 1}`, title: titulo.trim().slice(0, 20) }));
    const messageId = await sendButtons(destinatarioId, texto.slice(0, 1024), botones);
    return { externalId: messageId };
  },

  async indicarEscribiendo(mensajeEntranteId) {
    await marcarLeidoYEscribiendo(mensajeEntranteId);
  },

  async enviarMedia({ destinatarioId, tipo, url, caption, ultimoMensajeAt }): Promise<ResultadoEnvioCanal> {
    const abierta = isWithin24hWindow(ultimoMensajeAt ? new Date(ultimoMensajeAt) : null);
    if (!abierta) {
      return { externalId: null, motivoCierre: MOTIVO_VENTANA_CERRADA };
    }
    const messageId = await sendMedia({ to: destinatarioId, tipo, link: url, caption: caption ?? null });
    return { externalId: messageId };
  },
};
