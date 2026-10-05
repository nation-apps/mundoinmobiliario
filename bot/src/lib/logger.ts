import pino, { type LoggerOptions } from "pino";
import { env } from "../config/env.js";

// Redacta números de teléfono en todos los niveles de log. Los campos
// comunes (phone, to, from) se enmascaran siempre; nunca deben aparecer
// completos ni en desarrollo.
const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    // recipientId/remitenteId/psid/igsid: identificadores personales de Meta
    // aunque no sean teléfonos — mismo criterio que phone/to/from.
    // telefono/waId/wa_id: los nombres en español que usa este bot (window.ts loguea `telefono`).
    paths: [
      "phone",
      "*.phone",
      "*.*.phone",
      "telefono",
      "*.telefono",
      "waId",
      "wa_id",
      "to",
      "*.to",
      "from",
      "*.from",
      "recipientId",
      "*.recipientId",
      "remitenteId",
      "*.remitenteId",
      "psid",
      "igsid",
    ],
    censor: (value) => maskPhone(String(value)),
  },
};

/** Para los tests: la misma configuración (nivel y redacción) con otro destino. */
export const opcionesLogger = baseOptions;

export const logger =
  process.env.NODE_ENV !== "production"
    ? pino({ ...baseOptions, transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } })
    : pino(baseOptions);

export function maskPhone(phone: string): string {
  if (phone.length <= 4) return "***";
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
}
