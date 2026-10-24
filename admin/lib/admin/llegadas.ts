/**
 * «Llegadas por anuncio» (Métricas): una fila por cada persona que llegó en el periodo, para compararla una por una con lo que
 * cuenta Meta. Lógica pura: el cargador (metricas-carga.ts, solo servidor) le pasa los datos.
 */

import { anuncioDeMensajes } from "./anuncio";
import type { Etapa } from "./chats-tipos";

export type ComoLlego =
  /** Escribió por WhatsApp desde un anuncio de clic a WhatsApp (el mensaje trae el anuncio). */
  | "anuncio_whatsapp"
  /** Llenó un formulario de anuncio. */
  | "formulario"
  /** Llenó un formulario con un teléfono y escribió por WhatsApp desde otro. */
  | "formulario_otro_numero"
  /** Chat de WhatsApp que empezó el vendedor: la persona no había escrito, así que no se sabe de qué anuncio vino. */
  | "vendedor_primero"
  /** Escribió por WhatsApp sin datos de anuncio. */
  | "directo";

export const COMO_LLEGO: { id: ComoLlego; label: string; ayuda: string }[] = [
  { id: "anuncio_whatsapp", label: "Escribió desde el anuncio", ayuda: "Tocó un anuncio de clic a WhatsApp y escribió." },
  { id: "formulario", label: "Llenó el formulario", ayuda: "Formulario de un anuncio de Facebook o Instagram." },
  { id: "formulario_otro_numero", label: "Formulario con otro número", ayuda: "Puso un teléfono en el formulario y escribió por WhatsApp desde otro." },
  { id: "vendedor_primero", label: "Escribió primero el vendedor", ayuda: "La persona no escribió antes: no se sabe de qué anuncio vino." },
  { id: "directo", label: "Escribió sin anuncio", ayuda: "Escribió por WhatsApp y el mensaje no traía datos de anuncio." },
];

export type Llegada = {
  conversacionId: string;
  /** Cuándo llegó (el formulario o el primer mensaje). */
  at: string;
  anuncioId: string | null;
  anuncioNombre: string | null;
  como: ComoLlego;
  nombre: string | null;
  telefono: string | null;
  /** El teléfono que puso en el formulario, si es distinto del de WhatsApp. */
  telefonoFormulario: string | null;
  vendedor: string | null;
  etapa: Etapa | null;
};

export type ResumenConversacion = {
  cliente_id: string;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  asignada_nombre: string | null;
  etapa: Etapa;
};

export type MensajeAnuncio = { conversacion_id: string; created_at: string; metadata: Record<string, unknown> | null; contenido?: string | null };

/** «52 998…» de lo que la persona escribió en el formulario («Teléfono: +52 1 998…»). */
export function telefonoDelFormulario(contenido: string | null | undefined): string | null {
  const crudo = contenido?.match(/(?:tel[eé]fono|phone(?: number)?)\s*:\s*(\+?[\d\s().-]{8,22})/i)?.[1];
  if (!crudo) return null;
  let d = crudo.replace(/\D/g, "");
  if (d.length === 10) d = `52${d}`;
  if (d.length === 13 && d.startsWith("521")) d = `52${d.slice(3)}`;
  return d.length >= 10 ? d : null;
}

function mismoTelefono(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const n = (t: string) => (t.length === 13 && t.startsWith("521") ? `52${t.slice(3)}` : t);
  return n(a) === n(b);
}

export function armarLlegadas(p: {
  desde: number;
  hasta: number;
  /** Mensajes con datos de anuncio (formularios y mensajes de clic a WhatsApp). */
  mensajes: MensajeAnuncio[];
  /** Chats de WhatsApp creados en el periodo que no traen ningún anuncio, con quién escribió primero. */
  whatsappSinAnuncio: { id: string; created_at: string; primerRol: string | null }[];
  resumen: Map<string, ResumenConversacion>;
  /** Clientes marcados con la etiqueta «Prueba»: no se listan. */
  prueba: Set<string>;
}): Llegada[] {
  const enPeriodo = (iso: string) => {
    const t = Date.parse(iso);
    return t >= p.desde && t <= p.hasta;
  };
  const vistas = new Set<string>();
  const llegadas: Llegada[] = [];

  const base = (conversacionId: string) => {
    const r = p.resumen.get(conversacionId);
    if (!r || p.prueba.has(r.cliente_id)) return null;
    return { nombre: r.cliente_nombre, telefono: r.cliente_telefono, vendedor: r.asignada_nombre, etapa: r.etapa };
  };

  for (const m of p.mensajes) {
    if (!enPeriodo(m.created_at)) continue;
    const anuncio = anuncioDeMensajes([m.metadata]);
    const esFormulario = typeof m.metadata?.leadgen_id === "string";
    if (!anuncio && !esFormulario) continue;
    // Una vez por conversación y anuncio (dos mensajes del mismo anuncio son la misma llegada).
    const clave = `${m.conversacion_id}|${anuncio?.id ?? anuncio?.nombre ?? (esFormulario ? "formulario" : "")}|${esFormulario ? "f" : "w"}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const b = base(m.conversacion_id);
    if (!b) continue;
    const telForm = esFormulario ? telefonoDelFormulario(m.contenido) : null;
    const otro = esFormulario && telForm !== null && b.telefono !== null && !mismoTelefono(telForm, b.telefono);
    llegadas.push({
      conversacionId: m.conversacion_id,
      at: m.created_at,
      anuncioId: anuncio?.id ?? null,
      anuncioNombre: anuncio?.nombre ?? null,
      como: esFormulario ? (otro ? "formulario_otro_numero" : "formulario") : "anuncio_whatsapp",
      ...b,
      telefonoFormulario: otro ? telForm : null,
    });
  }

  for (const c of p.whatsappSinAnuncio) {
    if (!enPeriodo(c.created_at)) continue;
    const b = base(c.id);
    if (!b) continue;
    llegadas.push({
      conversacionId: c.id,
      at: c.created_at,
      anuncioId: null,
      anuncioNombre: null,
      como: c.primerRol === "user" ? "directo" : "vendedor_primero",
      ...b,
      telefonoFormulario: null,
    });
  }

  return llegadas.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
