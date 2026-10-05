/**
 * Teléfonos de México. En la base se guarda siempre "52" + 10 dígitos (12 dígitos en total). Meta a veces entrega los
 * móviles mexicanos con un "1" después del 52 (formato antiguo: 521 + 10 dígitos); aquí se unifican para que una misma
 * persona no termine con dos fichas. Números de otros países se guardan tal cual, solo con dígitos.
 *
 * `clientes.telefono` es único: si un teléfono se normaliza distinto en el bot y en el panel, aparecen duplicados.
 */
export function normalizarTelefono(crudo: string): string | null {
  let d = crudo.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10) return `52${d}`;
  if (d.length === 12 && d.startsWith("52")) return d;
  if (d.length === 13 && d.startsWith("521")) return `52${d.slice(3)}`;
  return d.length >= 8 ? d : null;
}

/**
 * Las dos formas en que un móvil mexicano puede llegar de Meta (52 + 10 y 521 + 10). Sirve para buscar una ficha sin
 * importar cuál usó Meta. Para cualquier otro número devuelve solo el original.
 */
export function variantesTelefono(telefono: string): string[] {
  const normal = normalizarTelefono(telefono);
  if (!normal) return [telefono];
  if (normal.length === 12 && normal.startsWith("52")) return [normal, `521${normal.slice(2)}`];
  return [normal];
}

/**
 * Cómo escribirle a este número por WhatsApp. Los móviles mexicanos aceptan "52" + 10 dígitos; si Meta rechazara ese
 * formato para algún destinatario, se activa `conUno` y se manda con el "1" (521 + 10 dígitos).
 */
export function telefonoParaEnvio(telefono: string, conUno = false): string {
  if (conUno && telefono.length === 12 && telefono.startsWith("52")) return `521${telefono.slice(2)}`;
  return telefono;
}
