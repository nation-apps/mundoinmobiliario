import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { sendTextIfWindowOpen } from "../whatsapp/window.js";

/**
 * ¿La API de Anthropic rechazó la llamada porque la cuenta se quedó sin saldo?
 * Es el fallo más grave del bot: no puede contestarle a NADIE hasta que se
 * recargue, y sin esto parecía una falla más de una conversación.
 */
export function esErrorDeSaldo(err: unknown): boolean {
  const texto = err instanceof Error ? `${err.message} ${JSON.stringify((err as { error?: unknown }).error ?? "")}` : String(err);
  return /credit balance is too low|insufficient[_ ]credit|billing|plans\s*&\s*billing/i.test(texto);
}

const AVISO_CADA_MS = 60 * 60_000;
let ultimoAvisoAt = 0;

/**
 * Avisa al número de escalamiento que el bot no puede responder por falta de
 * saldo. Una vez por hora como máximo: si hay 30 clientas escribiendo no son
 * 30 avisos. Es best effort (si la ventana de 24 h de ese número está cerrada,
 * WhatsApp no deja mandar texto libre): por eso además queda un error en el log.
 */
export async function avisarSinSaldo(): Promise<void> {
  logger.error("SIN SALDO EN ANTHROPIC: el bot no puede responder. Recargar en console.anthropic.com > Plans & Billing");
  if (Date.now() - ultimoAvisoAt < AVISO_CADA_MS) return;
  ultimoAvisoAt = Date.now();
  await sendTextIfWindowOpen(
    env.ESCALATION_PHONE,
    "⚠️ El bot de Mundo Motos NO puede responder: se agotó el saldo de la cuenta de Anthropic. Recárgalo en console.anthropic.com > Plans & Billing y vuelve a funcionar al instante.",
  ).catch((err: unknown) => logger.error({ err }, "No se pudo avisar de la falta de saldo"));
}

/** Solo para tests. */
export function reiniciarAvisoSaldo(): void {
  ultimoAvisoAt = 0;
}
