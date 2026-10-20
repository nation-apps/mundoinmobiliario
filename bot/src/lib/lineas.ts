import { normalizarTelefono } from "./telefono.js";

/**
 * Las líneas de WhatsApp del negocio: TVS Motor Cancún y Mundo de Motos, cada una con su número y su marca. Cada conversación de
 * WhatsApp pertenece a una línea (`conversaciones.linea`): de ahí salen la marca del «origen» («WhatsApp Directo TVS»,
 * «Campaña WhatsApp Meta TVS»…) y el número desde el que se le contesta.
 *
 * Los números son los del documento del cliente; sirven para avisar si se escaneó el QR de otro número, no para decidir
 * nada. `WHATSAPP_LINEAS` (JSON `[{ "id": "tvs", "marca": "TVS", "etiqueta": "WhatsApp TVS", "telefono": "52…" }]`) cambia o suma
 * líneas. Se lee de `process.env` a propósito: este archivo es puro y no arrastra la validación de config/env.ts.
 */

export type Linea = {
  /** Identificador estable: va en `conversaciones.linea` y en `staff.lineas`. */
  id: string;
  /** La que sale en el origen de los chats: «TVS», «Mundo de Motos». */
  marca: string;
  /** Lo que se ve en el panel: «WhatsApp TVS». */
  etiqueta: string;
  /** Número esperado (52 + 10 dígitos). */
  telefono: string;
};

const LINEAS_POR_DEFECTO: Linea[] = [
  { id: "tvs", marca: "TVS", etiqueta: "WhatsApp TVS", telefono: "529987584160" },
  { id: "mundo", marca: "Mundo de Motos", etiqueta: "WhatsApp Mundo de Motos", telefono: "529988706920" },
];

/** La línea por la que se escribe cuando no se sabe otra (y la de todo lo que había antes de tener dos). */
export const LINEA_POR_DEFECTO = "tvs";

export function lineasConfiguradas(): Linea[] {
  const crudo = process.env.WHATSAPP_LINEAS;
  if (!crudo) return LINEAS_POR_DEFECTO;
  try {
    const propias = JSON.parse(crudo) as unknown;
    if (!Array.isArray(propias)) return LINEAS_POR_DEFECTO;
    const validas = propias.flatMap((l): Linea[] => {
      const x = l as Partial<Linea>;
      if (typeof x.id !== "string" || !/^[a-z][a-z0-9_-]{1,20}$/.test(x.id) || typeof x.marca !== "string" || !x.marca.trim()) return [];
      const telefono = normalizarTelefono(typeof x.telefono === "string" ? x.telefono : "") ?? "";
      return [{ id: x.id, marca: x.marca.trim(), etiqueta: typeof x.etiqueta === "string" && x.etiqueta.trim() ? x.etiqueta.trim() : x.marca.trim(), telefono }];
    });
    return validas.length > 0 ? validas : LINEAS_POR_DEFECTO;
  } catch {
    // Un JSON mal escrito no debe tumbar nada: se usan las líneas de siempre.
    return LINEAS_POR_DEFECTO;
  }
}

export function lineaPorId(id: string | null | undefined): Linea | null {
  return id ? (lineasConfiguradas().find((l) => l.id === id) ?? null) : null;
}

export function esLineaValida(id: string | null | undefined): id is string {
  return lineaPorId(id) !== null;
}

/** La marca de una línea («TVS»); null si la línea no existe o no se dijo. */
export function marcaDeLinea(id: string | null | undefined): string | null {
  return lineaPorId(id)?.marca ?? null;
}

/** La línea de una marca («TVS» → «tvs»). Null si ninguna línea tiene esa marca. */
export function lineaPorMarca(marca: string | null | undefined): string | null {
  const buscada = marca?.trim().toLowerCase();
  if (!buscada) return null;
  return lineasConfiguradas().find((l) => l.marca.toLowerCase() === buscada)?.id ?? null;
}

/**
 * La línea que le toca a un lead según su origen: «Campaña Formulario Meta TVS», «Campaña WhatsApp Meta TVS» y
 * «WhatsApp Directo TVS» son de la línea de TVS; lo mismo con Mundo de Motos. Null si el origen no dice la marca.
 */
export function lineaPorFuente(fuente: string | null | undefined): string | null {
  const texto = fuente?.toLowerCase();
  if (!texto) return null;
  // La más larga primero: «Mundo de Motos» no debe tomarse por «TVS» ni al revés si una marca contiene a otra.
  const lineas = [...lineasConfiguradas()].sort((a, b) => b.marca.length - a.marca.length);
  return lineas.find((l) => texto.includes(l.marca.toLowerCase()))?.id ?? null;
}

/** Los id de las líneas, para validar lo que llega de fuera. */
export function idsDeLineas(): string[] {
  return lineasConfiguradas().map((l) => l.id);
}
