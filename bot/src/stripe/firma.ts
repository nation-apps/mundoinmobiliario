import { createHmac, timingSafeEqual } from "node:crypto";

/** Tolerancia que recomienda Stripe: avisos con más de 5 minutos de diferencia se rechazan (repetición de un aviso viejo). */
const TOLERANCIA_S = 300;

/**
 * Valida el encabezado `Stripe-Signature` (`t=<unix>,v1=<hex>[,v1=…]`) contra el cuerpo CRUDO: HMAC-SHA256 de
 * `<t>.<cuerpo>` con el secreto del endpoint (`whsec_…`). Sin el SDK de Stripe: es un cálculo corto y así no se agrega
 * una dependencia que toque el cuerpo del request.
 */
export function verificarFirmaStripe(
  cuerpo: Buffer | undefined,
  encabezado: string | undefined,
  secreto: string | undefined,
  ahoraMs = Date.now(),
): boolean {
  if (!cuerpo || !encabezado || !secreto) return false;

  let t: string | undefined;
  const firmas: string[] = [];
  for (const parte of encabezado.split(",")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    const clave = parte.slice(0, i).trim();
    const valor = parte.slice(i + 1).trim();
    if (clave === "t") t = valor;
    else if (clave === "v1") firmas.push(valor);
  }
  if (!t || firmas.length === 0) return false;

  const segundos = Number(t);
  if (!Number.isFinite(segundos) || Math.abs(ahoraMs / 1000 - segundos) > TOLERANCIA_S) return false;

  const esperada = createHmac("sha256", secreto).update(`${t}.`).update(cuerpo).digest();
  return firmas.some((f) => {
    if (!/^[0-9a-f]+$/i.test(f)) return false;
    const dada = Buffer.from(f, "hex");
    return dada.length === esperada.length && timingSafeEqual(dada, esperada);
  });
}
