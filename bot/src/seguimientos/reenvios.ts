/**
 * Reenvío automático de respuestas que no llegaron. Si el envío falla (red caída, Meta saturada) incluso después de
 * los reintentos inmediatos de whatsapp/client.ts, la clienta se queda sin su respuesta y no sabe que el bot le
 * escribió (pasó con la primera respuesta a una clienta de un anuncio). Cada minuto se buscan esas respuestas y se
 * reenvían a los 2, 10 y 30 minutos del fallo, mientras nadie haya escrito después y la ventana de 24 h siga abierta.
 *
 * La decisión (`proximoReenvio`) es pura y se prueba con casos; `reintentarEntregas` recibe sus dependencias para
 * poder probarse sin red ni base de datos.
 */
import { env, whatsappConfigurado } from "../config/env.js";
import { logger } from "../lib/logger.js";
import {
  hayMensajesPosteriores,
  listarRespuestasSinEntregar,
  registrarReenvio,
  type MensajeMetadata,
  type RespuestaSinEntregar,
} from "../db/repositories/mensajes.js";
import { whatsappAdapter } from "../canales/whatsapp.js";
import type { ResultadoEnvioCanal } from "../canales/types.js";

/** Minutos que se espera antes de cada reenvío (el primero se cuenta desde el fallo; los demás, desde el intento anterior). */
export const ESPERAS_REENVIO_MIN = [2, 10, 30] as const;
export const MAX_REENVIOS = ESPERAS_REENVIO_MIN.length;
/** Pasado este tiempo desde el fallo, la respuesta ya quedó vieja y no se reenvía. */
export const VIGENCIA_REENVIO_MS = 3 * 60 * 60_000;
const INTERVALO_MS = 60_000;

export type DecisionReenvio = "ahora" | "esperar" | "agotado";

export function proximoReenvio(p: {
  creadoAt: Date;
  reintentos: number;
  ultimoReintentoAt: Date | null;
  ahora: Date;
}): DecisionReenvio {
  if (p.reintentos >= MAX_REENVIOS) return "agotado";
  if (p.ahora.getTime() - p.creadoAt.getTime() > VIGENCIA_REENVIO_MS) return "agotado";
  const base = p.ultimoReintentoAt ?? p.creadoAt;
  const espera = ESPERAS_REENVIO_MIN[p.reintentos]! * 60_000;
  return p.ahora.getTime() >= base.getTime() + espera ? "ahora" : "esperar";
}

export type DepsReenvio = {
  listar(desdeIso: string): Promise<RespuestaSinEntregar[]>;
  hayPosteriores(conversacionId: string, despuesDeIso: string): Promise<boolean>;
  enviar(r: RespuestaSinEntregar, botones: string[] | null): Promise<ResultadoEnvioCanal>;
  registrar(mensajeId: string, p: { metadata: MensajeMetadata; externalId?: string; nuevoError?: string }): Promise<void>;
};

const depsReales: DepsReenvio = {
  listar: (desde) => listarRespuestasSinEntregar(desde),
  hayPosteriores: hayMensajesPosteriores,
  async enviar(r, botones) {
    const base = { destinatarioId: r.telefono, texto: r.contenido, rol: "assistant" as const, ultimoMensajeAt: r.ultimoMensajeAt };
    return botones && whatsappAdapter.enviarBotones
      ? whatsappAdapter.enviarBotones({ ...base, opciones: botones })
      : whatsappAdapter.enviarTexto(base);
  },
  registrar: registrarReenvio,
};

export type ResumenReenvio = { revisadas: number; reenviadas: number; falladas: number };

function leerBotones(metadata: MensajeMetadata): string[] | null {
  const b = metadata.botones;
  return Array.isArray(b) && b.length >= 2 && b.every((x) => typeof x === "string") ? (b as string[]) : null;
}

export async function reintentarEntregas(ahora = new Date(), deps: DepsReenvio = depsReales): Promise<ResumenReenvio> {
  const resumen: ResumenReenvio = { revisadas: 0, reenviadas: 0, falladas: 0 };
  const desde = new Date(ahora.getTime() - VIGENCIA_REENVIO_MS).toISOString();
  const pendientes = await deps.listar(desde);

  for (const r of pendientes) {
    const reintentos = typeof r.metadata.reintentos === "number" ? r.metadata.reintentos : 0;
    const ultimo = typeof r.metadata.ultimo_reintento_at === "string" ? new Date(r.metadata.ultimo_reintento_at) : null;
    const decision = proximoReenvio({ creadoAt: new Date(r.creadoAt), reintentos, ultimoReintentoAt: ultimo, ahora });
    if (decision !== "ahora") continue;
    resumen.revisadas++;

    // Si ya hay algo posterior (la clienta escribió, el bot o una persona contestó), esta respuesta quedó vieja.
    if (await deps.hayPosteriores(r.conversacionId, r.creadoAt)) {
      await deps.registrar(r.id, { metadata: { ...r.metadata, reintentos: MAX_REENVIOS, reenvio_descartado: "ya hay mensajes posteriores" } });
      continue;
    }

    const nuevaMetadata = { ...r.metadata, reintentos: reintentos + 1, ultimo_reintento_at: ahora.toISOString() };
    try {
      const res = await deps.enviar(r, leerBotones(r.metadata));
      if (res.externalId) {
        await deps.registrar(r.id, { metadata: { ...nuevaMetadata, reenviado_at: ahora.toISOString() }, externalId: res.externalId });
        resumen.reenviadas++;
        logger.info({ conversacionId: r.conversacionId, intento: reintentos + 1 }, "Respuesta que no había llegado: reenviada");
      } else {
        // Sin id = el canal no la envió (ventana cerrada): no tiene sentido seguir intentando.
        await deps.registrar(r.id, {
          metadata: { ...nuevaMetadata, reintentos: MAX_REENVIOS },
          nuevoError: res.motivoCierre ?? "No se pudo reenviar",
        });
        resumen.falladas++;
      }
    } catch (err) {
      await deps.registrar(r.id, { metadata: nuevaMetadata }).catch(() => {});
      resumen.falladas++;
      logger.warn({ err, conversacionId: r.conversacionId, intento: reintentos + 1 }, "Falló el reenvío de una respuesta; se reintentará");
    }
  }
  return resumen;
}

let corriendo = false;

export function iniciarReenvios(): void {
  if (!env.REENVIOS_ACTIVOS) {
    logger.info("Reenvío automático de respuestas apagado (REENVIOS_ACTIVOS=false)");
    return;
  }
  if (!whatsappConfigurado) return;
  setInterval(() => {
    if (corriendo) return;
    corriendo = true;
    reintentarEntregas()
      .catch((err: unknown) => logger.error({ err }, "Falló una vuelta de reenvíos"))
      .finally(() => {
        corriendo = false;
      });
  }, INTERVALO_MS);
  logger.info("Reenvío automático de respuestas activo (cada minuto)");
}
