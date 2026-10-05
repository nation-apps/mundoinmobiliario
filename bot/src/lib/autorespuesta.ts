/**
 * ¿Este mensaje lo escribió una persona o es la respuesta automática de OTRO negocio ("Gracias por comunicarte con X,
 * en breve te respondemos")? Contestarle a un bot ajeno gasta tokens, queda raro y puede armar un ciclo de bots
 * hablándose entre sí. Lista corta y conservadora: solo frases que una clienta real casi nunca escribe.
 */
const PATRONES: RegExp[] = [
  /\bgracias\s+por\s+(comunicarte|comunicarse|escribir(nos)?|contactar(nos)?|tu\s+mensaje|su\s+mensaje)\s+(con|a)\b/i,
  /\b(en\s+breve|a\s+la\s+brevedad)\s+(te|le|lo)\s+(respondemos|responderemos|atenderemos|atendemos|contactaremos)/i,
  /\b(mensaje|respuesta)\s+autom[aá]tic[oa]\b/i,
  /\b(en\s+este\s+momento\s+)?no\s+(podemos|estamos\s+pudiendo)\s+atender(te|le)?\b.*\b(horario|volveremos|responderemos)/is,
];

export function esRespuestaAutomatica(texto: string): boolean {
  return PATRONES.some((p) => p.test(texto));
}
