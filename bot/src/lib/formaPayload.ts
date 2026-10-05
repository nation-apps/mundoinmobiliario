/**
 * Forma de un payload de webhook, SIN datos personales: sirve para
 * diagnosticar uno que no calzó con el esquema sin volcar al log el
 * teléfono, el nombre de perfil ni el texto del cliente.
 *
 * Solo salen nombres de tipo que define Meta (`object`, `field`, `type`),
 * recortados, y conteos.
 */

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

function etiqueta(valor: unknown): string | null {
  return typeof valor === "string" ? valor.slice(0, 40) : null;
}

export function formaDelPayload(body: unknown): Record<string, unknown> {
  if (!esObjeto(body)) return { tipo: typeof body };

  const entradas = lista(body.entry).filter(esObjeto);
  const cambios = entradas.flatMap((entrada) =>
    lista(entrada.changes)
      .filter(esObjeto)
      .map((cambio) => {
        const valor = esObjeto(cambio.value) ? cambio.value : {};
        return {
          field: etiqueta(cambio.field),
          tiposDeMensaje: lista(valor.messages).map((m) => (esObjeto(m) ? etiqueta(m.type) : null)),
          estados: lista(valor.statuses).length,
        };
      }),
  );
  const messaging = entradas.reduce((total, entrada) => total + lista(entrada.messaging).length, 0);

  return {
    object: etiqueta(body.object),
    entradas: lista(body.entry).length,
    cambios: cambios.slice(0, 10),
    messaging,
  };
}
