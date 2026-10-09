import { normalizarTelefono } from "../lib/telefono.js";

/**
 * Formularios instantáneos de Meta (Lead Ads). Lo que llega de la Graph API
 * (GET /{leadgen_id}) es una lista `field_data` de { name, values }: los
 * campos estándar con nombres fijos (full_name, phone_number, email…) y las
 * preguntas propias del formulario con su texto pasado a snake_case como
 * nombre ("¿cuál_es_tu_presupuesto?"). Aquí solo se interpreta esa lista; el
 * pedido a Meta está en meta/client.ts y el registro en agent/handleLeadFormulario.ts.
 */

export type CampoLead = { name: string; values: string[] };

/**
 * `conversaciones.hilo_externo` de los leads de anuncios: los separa del
 * formulario del sitio (mismo canal `web`, origen `formulario`) y el panel lo
 * usa para rotularlos.
 */
export const HILO_LEAD_ADS = "facebook_lead_ads";

const ETIQUETAS: Record<string, string> = {
  full_name: "Nombre",
  first_name: "Nombre",
  last_name: "Apellido",
  email: "Correo",
  work_email: "Correo de trabajo",
  phone_number: "Teléfono",
  // Algunos formularios (p. ej. los de Mundo de Motos MX) llaman así al campo estándar de teléfono.
  phone: "Teléfono",
  work_phone_number: "Teléfono de trabajo",
  city: "Ciudad",
  state: "Estado",
  province: "Provincia",
  country: "País",
  zip_code: "Código postal",
  post_code: "Código postal",
  street_address: "Dirección",
  date_of_birth: "Fecha de nacimiento",
  gender: "Género",
  job_title: "Puesto",
  company_name: "Empresa",
};

/** Preguntas propias que en la práctica piden el número (algunos formularios no usan el campo estándar). */
const PREGUNTA_DE_TELEFONO = /whats|tel[eé]fono|celular|m[oó]vil|phone|n[uú]mero/i;

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function primerValor(campos: CampoLead[], nombre: string): string | null {
  const valor = campos.find((c) => c.name === nombre)?.values.find((v) => v.trim() !== "");
  return valor?.trim() ?? null;
}

export type DatosLead = {
  nombre: string | null;
  /** Normalizado como en `clientes.telefono` (52 + 10 dígitos en México); null si no hay uno usable. */
  telefono: string | null;
  email: string | null;
};

export function datosDelLead(campos: CampoLead[]): DatosLead {
  const nombre =
    primerValor(campos, "full_name") ??
    ([primerValor(campos, "first_name"), primerValor(campos, "last_name")].filter(Boolean).join(" ") || null);

  const crudoTelefono =
    primerValor(campos, "phone_number") ??
    primerValor(campos, "phone") ??
    primerValor(campos, "work_phone_number") ??
    campos
      .filter((c) => !(c.name in ETIQUETAS) && PREGUNTA_DE_TELEFONO.test(c.name))
      .flatMap((c) => c.values)
      .find((v) => normalizarTelefono(v) !== null) ??
    null;

  const crudoEmail = primerValor(campos, "email") ?? primerValor(campos, "work_email");

  return {
    nombre,
    telefono: crudoTelefono ? normalizarTelefono(crudoTelefono) : null,
    email: crudoEmail && EMAIL_VALIDO.test(crudoEmail) ? crudoEmail : null,
  };
}

/** "¿cuál_es_tu_presupuesto?" → "¿Cuál es tu presupuesto?" */
function legible(texto: string): string {
  const limpio = texto.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const i = limpio.search(/\p{L}/u);
  return i < 0 ? limpio : limpio.slice(0, i) + limpio.charAt(i).toUpperCase() + limpio.slice(i + 1);
}

/**
 * Las respuestas en el orden del formulario, una por línea, para el hilo del
 * panel. En las preguntas propias, las opciones también llegan en snake_case;
 * en los campos estándar no se tocan (un correo puede llevar guion bajo).
 */
export function contenidoDelLead(campos: CampoLead[]): string {
  const lineas = campos
    .map((c) => {
      const valores = c.values.map((v) => v.trim()).filter(Boolean);
      if (valores.length === 0) return null;
      const estandar = c.name in ETIQUETAS;
      const etiqueta = estandar ? ETIQUETAS[c.name] : legible(c.name);
      const valor = (estandar ? valores : valores.map(legible)).join(", ");
      return `${etiqueta}: ${valor}`;
    })
    .filter((l): l is string => l !== null);
  return lineas.length > 0 ? lineas.join("\n") : "Envió el formulario del anuncio sin respuestas.";
}
