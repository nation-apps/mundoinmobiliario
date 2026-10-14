import { cache } from "react";
import { redirect } from "next/navigation";
import { cargarSuscripcion } from "./suscripcion-carga";
import { SUSCRIPCION_OBLIGATORIA, accesoPermitido } from "./suscripcion";

const leer = cache(cargarSuscripcion);

/**
 * SOLO servidor. Si el servidor exige la suscripción (SUSCRIPCION_OBLIGATORIA=true) y no hay una activa, manda a
 * quien administra a pagar y al resto a la pantalla de acceso suspendido. Si el estado no se pudo leer (migración sin
 * correr, base caída) NO bloquea: un fallo de lectura no debe dejar a un negocio sin su CRM.
 *
 * Lo llama el layout y cada página: los layouts no se vuelven a evaluar al navegar entre páginas del panel.
 */
export async function exigirSuscripcion(rol: string): Promise<void> {
  if (!SUSCRIPCION_OBLIGATORIA) return;
  const { suscripcion, leida } = await leer();
  if (!leida || accesoPermitido(suscripcion)) return;
  redirect(rol === "admin" ? "/admin/suscripcion" : "/admin/suspendido");
}

export async function suscripcionActual() {
  return leer();
}
