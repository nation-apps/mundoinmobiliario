/**
 * Los mensajes de bienvenida por línea de WhatsApp (tabla `mensajes_bienvenida`, 0013). Lo que escribe el administrador lo manda el
 * bot (bot/src/agent/primerMensajeLead.ts y bienvenidaDirecta.ts). Aquí solo los tipos y la vista previa.
 */

export type ConfigBienvenida = {
  linea: string;
  formulario_activo: boolean;
  formulario_texto: string | null;
  directo_activo: boolean;
  directo_texto: string | null;
};

export const LARGO_MAXIMO = 900;

/** Lo que el bot rellena en el texto: `{{nombre}}`, `{{marca}}`, `{{interes}}` (solo en formularios) y `{{asesor}}`. */
export const MARCADORES: { id: string; ayuda: string; soloFormulario?: boolean }[] = [
  { id: "{{nombre}}", ayuda: "El primer nombre de la persona" },
  { id: "{{asesor}}", ayuda: "El vendedor que le tocó por el reparto" },
  { id: "{{marca}}", ayuda: "TVS Motor Cancún o Mundo de Motos, según la línea" },
  { id: "{{interes}}", ayuda: "Lo que le interesa según su formulario (la moto o la refacción)", soloFormulario: true },
];

/** Lo que se vería con datos de ejemplo (lo mismo que hace el bot al rellenar). */
export function vistaPrevia(texto: string, marca: string, esFormulario: boolean): string {
  return texto
    .replaceAll("{{nombre}}", "Marcos")
    .replaceAll("{{marca}}", marca)
    .replaceAll("{{interes}}", esFormulario ? "la moto TVS RTR 310" : "nuestras motos")
    .replaceAll("{{asesor}}", "Giovanny")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Lo que el bot arma solo cuando el saludo del formulario está encendido y se deja el texto vacío. */
export const SALUDO_AUTOMATICO_EJEMPLO =
  "Hola Marcos 👋 ¡Felicidades por registrarte en TVS Motor Cancún! Sabemos que estás interesado en la moto TVS RTR 310. Mi nombre es Giovanny y te atenderé con mucho gusto.";
