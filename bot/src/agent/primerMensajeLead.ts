import { env } from "../config/env.js";
import { leerBienvenida, type Bienvenida } from "../db/repositories/bienvenida.js";
import { logger } from "../lib/logger.js";
import { clienteAnulado } from "../db/repositories/etiquetas.js";
import { convertirEnWhatsapp, leerConversacion, tieneConversacionWhatsappAbierta } from "../db/repositories/conversaciones.js";
import { guardarMensaje } from "../db/repositories/mensajes.js";
import { legible, type CampoLead } from "../meta/leadAds.js";
import { sendText } from "../whatsapp/client.js";

/**
 * Primer mensaje por WhatsApp a quien llenó un formulario de anuncios y dejó su teléfono pero no tocó el botón de WhatsApp:
 * llegaba al panel solo como un dato y nadie podía escribirle. Con LEADS_PRIMER_MENSAJE_ACTIVO el bot le manda un saludo
 * armado con sus respuestas y la conversación pasa a ser de WhatsApp, para que el asesor siga desde ahí.
 *
 * Solo funciona con la conexión por QR (por la API oficial, escribirle primero a alguien exige una plantilla aprobada). Es
 * escribirle a gente que no ha escrito: lo que más bloquea números. Por eso va en cola, con horario, tope por hora, una
 * pausa larga y al azar entre mensajes, un solo mensaje por persona y una línea para que pueda pedir que no le escriban.
 */

const log = logger.child({ modulo: "primer-mensaje-lead" });

/* ---------- El texto ---------- */

const SIGLAS = new Set(["tvs", "rtr", "rr", "dt", "ds", "ft", "cdi", "gt", "ls", "ak", "rt", "xl", "cg", "gs"]);
const INDEFINIDO = /^(a[uú]n no|no (estoy|s[eé])|otr[ao]s?|ninguna?|no lo s[eé]|n\/?a)\b|test lead/i;

/** «tvs rtr 310» → «TVS RTR 310»; lo demás se deja como lo escribió la persona. */
function conSiglas(valor: string): string {
  return valor
    .split(/\s+/)
    // Siglas («tvs», «rtr») y claves de modelo con número («ft150», «dt150»).
    .map((palabra) => (SIGLAS.has(palabra.toLowerCase()) || /^[a-z]{1,4}\d{2,4}[a-z]?$/i.test(palabra) ? palabra.toUpperCase() : palabra))
    .join(" ");
}

function valorDe(campos: CampoLead[], patron: RegExp, excluir?: RegExp): string | null {
  for (const campo of campos) {
    if (!patron.test(campo.name) || excluir?.test(campo.name)) continue;
    const valor = campo.values.map((v) => v.trim()).find(Boolean);
    if (!valor) continue;
    const limpio = legible(valor);
    if (INDEFINIDO.test(limpio)) continue;
    return conSiglas(limpio);
  }
  return null;
}

/** «MARCOS GONZALEZ» → «Marcos». Sin un nombre que se pueda leer, nada (el saludo queda sin nombre). */
export function nombreParaSaludo(nombre: string | null | undefined): string {
  const primero = nombre?.trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}{2,}$/u.test(primero)) return "";
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

function marcaVisible(marca: string | null): string {
  if (!marca) return "Mundo de Motos";
  return /tvs/i.test(marca) ? "TVS Motor Cancún" : marca;
}

/** Qué le interesa, en una frase que cabe después de «te interesa…» (null si el formulario no lo dice). */
export function interesDelLead(campos: CampoLead[]): { frase: string | null; tipo: "tvs" | "refacciones" | "general" } {
  const modeloTvs = valorDe(campos, /modelo.*tvs|tvs.*modelo/i);
  if (modeloTvs) return { frase: `la moto ${modeloTvs}`, tipo: "tvs" };

  const hayPreguntaTvs = campos.some((c) => /modelo.*tvs|tvs.*modelo/i.test(c.name));
  if (hayPreguntaTvs) return { frase: null, tipo: "tvs" };

  const hayPreguntaRefaccion = campos.some((c) => /refacci/i.test(c.name));
  if (hayPreguntaRefaccion) {
    const pieza = valorDe(campos, /refacci/i);
    const marcaMoto = valorDe(campos, /marca/i);
    const modeloMoto = valorDe(campos, /modelo/i, /tvs/i);
    const moto = [marcaMoto, modeloMoto].filter(Boolean).join(" ");
    const frase = [pieza ? pieza.toLowerCase() : "refacciones", moto ? `para tu ${moto}` : null].filter(Boolean).join(" ");
    return { frase, tipo: "refacciones" };
  }
  return { frase: null, tipo: "general" };
}

const DESPEDIDA = "Si prefieres que no te escribamos, responde NO.";

/** «Ventas Cancún 1 - Giovanny» → «Giovanny»; sin guion, el primer nombre. Sin nombre legible, null. */
export function nombreDelAsesor(nombre: string | null | undefined): string | null {
  const limpio = nombre?.trim() ?? "";
  const guion = limpio.lastIndexOf(" - ");
  const crudo = guion >= 0 ? limpio.slice(guion + 3).trim() : (limpio.split(/\s+/)[0] ?? "");
  const nombreAsesor = crudo.split(/\s+/)[0] ?? "";
  if (!/^\p{L}{2,}$/u.test(nombreAsesor)) return null;
  return nombreAsesor.charAt(0).toUpperCase() + nombreAsesor.slice(1).toLowerCase();
}

/** Rellena {{nombre}}, {{marca}}, {{interes}} y {{asesor}} de un texto propio (LEADS_PRIMER_MENSAJE_TEXTO). */
export function rellenarPlantilla(
  texto: string,
  datos: { nombre: string; marca: string; interes: string | null; asesor?: string | null },
): string {
  return texto
    .replaceAll("{{nombre}}", datos.nombre || "")
    .replaceAll("{{marca}}", datos.marca)
    .replaceAll("{{interes}}", datos.interes ?? "nuestras motos")
    .replaceAll("{{asesor}}", datos.asesor ?? "tu asesor")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * El saludo según las respuestas del formulario, con las palabras que pidió el cliente («Felicidades por registrarte, sabemos
 * que estás interesado en la moto…, mi nombre es … y te atenderé con mucho gusto»). `asesor` es quien tiene asignado el lead.
 * Sin precios ni promesas: solo ofrece ayuda.
 */
export function textoPrimerMensaje(params: {
  nombre: string | null;
  campos: CampoLead[];
  marca: string | null;
  asesor?: string | null;
  plantilla?: string;
}): string {
  const nombre = nombreParaSaludo(params.nombre);
  const asesor = nombreDelAsesor(params.asesor);
  const { frase, tipo } = interesDelLead(params.campos);
  const marca = tipo === "tvs" ? "TVS Motor Cancún" : marcaVisible(params.marca);
  if (params.plantilla) return rellenarPlantilla(params.plantilla, { nombre, marca, interes: frase, asesor });

  const saludo = nombre ? `Hola ${nombre} 👋` : "Hola 👋";
  const presentacion = asesor ? `Mi nombre es ${asesor} y te atenderé con mucho gusto.` : "Un asesor te atenderá con mucho gusto.";
  const interes =
    tipo === "tvs"
      ? `estás interesado en ${frase ?? "nuestras motos TVS"}`
      : tipo === "refacciones"
        ? `estás buscando ${frase ?? "refacciones"}`
        : "dejaste tus datos en nuestro anuncio";
  const pregunta = tipo === "refacciones" ? " ¿Me confirmas la pieza, el modelo y el año de tu moto para revisar disponibilidad?" : "";
  return `${saludo} ¡Felicidades por registrarte en ${marca}! Sabemos que ${interes}. ${presentacion}${pregunta}\n\n${DESPEDIDA}`;
}

/* ---------- Cuándo se puede mandar ---------- */

const UNA_HORA_MS = 60 * 60_000;
const REVISAR_HORARIO_MS = 10 * 60_000;

/** La hora (0–23) en la zona del negocio. */
export function horaLocal(ahora: number, zona: string): number {
  const hora = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: zona }).format(new Date(ahora));
  return Number(hora) % 24;
}

/**
 * Cuánto hay que esperar para mandar el siguiente (0 = ya). Dos límites: el horario (de noche no se escribe) y el tope de
 * mensajes por hora. Pura, para poder probarla.
 */
export function esperaParaEnviar(params: {
  ahora: number;
  enviados: number[];
  hora: number;
  desde: number;
  hasta: number;
  maxPorHora: number;
}): number {
  const dentro = params.desde < params.hasta ? params.hora >= params.desde && params.hora < params.hasta : params.hora >= params.desde || params.hora < params.hasta;
  if (!dentro) return REVISAR_HORARIO_MS;
  const recientes = params.enviados.filter((t) => params.ahora - t < UNA_HORA_MS).sort((a, b) => a - b);
  if (recientes.length >= params.maxPorHora) {
    const liberaEn = (recientes[recientes.length - params.maxPorHora] ?? params.ahora) + UNA_HORA_MS - params.ahora;
    return Math.max(1000, liberaEn + 1000);
  }
  return 0;
}

/* ---------- La cola ---------- */

export type PrimerMensaje = {
  conversacionId: string;
  clienteId: string;
  telefono: string;
  texto: string;
  /** La línea de WhatsApp por la que se le escribe: la de la marca del anuncio (lib/lineas.ts). */
  linea: string;
  leadgenId?: string;
};

const TOPE_EN_COLA = 60;
const PAUSA_MIN_MS = 45_000;
const PAUSA_EXTRA_MS = 75_000;

const cola: PrimerMensaje[] = [];
const enviados: number[] = [];
let procesando = false;

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function enviarUno(p: PrimerMensaje): Promise<boolean> {
  const { estadoLineaQr } = await import("../whatsapp-qr/sesion.js");
  if (estadoLineaQr(p.linea).estado !== "conectado") {
    log.warn({ linea: p.linea }, "La línea de WhatsApp no está conectada: no se le escribió a un lead (queda como formulario)");
    return false;
  }
  const conversacion = await leerConversacion(p.conversacionId);
  if (!conversacion || conversacion.canal !== "web" || conversacion.estado === "cerrada") return false;
  // Ya está hablando con nosotros por WhatsApp (o lo estuvo hace poco): no se le escribe primero otra vez.
  if (await tieneConversacionWhatsappAbierta(p.clienteId)) {
    log.info("El lead ya tiene una conversación de WhatsApp abierta: no se le manda el primer mensaje");
    return false;
  }
  if (await clienteAnulado(p.clienteId)) return false;

  const externalId = await sendText(p.telefono, p.texto, p.linea);
  const convertida = await convertirEnWhatsapp(p.conversacionId, p.linea);
  await guardarMensaje({
    conversacionId: p.conversacionId,
    rol: "assistant",
    contenido: p.texto,
    externalId,
    waMessageId: externalId,
    metadata: { via: "primer_mensaje_formulario", ...(p.leadgenId ? { leadgen_id: p.leadgenId } : {}) },
  });
  log.info({ conversacionId: p.conversacionId, convertida }, "Primer mensaje por WhatsApp enviado a un lead de formulario");
  return true;
}

async function procesar(): Promise<void> {
  if (procesando) return;
  procesando = true;
  try {
    while (cola.length > 0) {
      const espera = esperaParaEnviar({
        ahora: Date.now(),
        enviados,
        hora: horaLocal(Date.now(), env.BUSINESS_TIMEZONE),
        desde: env.LEADS_PRIMER_MENSAJE_DESDE_HORA,
        hasta: env.LEADS_PRIMER_MENSAJE_HASTA_HORA,
        maxPorHora: env.LEADS_PRIMER_MENSAJE_MAX_POR_HORA,
      });
      if (espera > 0) {
        await esperar(espera);
        continue;
      }
      const siguiente = cola.shift();
      if (!siguiente) break;
      try {
        if (await enviarUno(siguiente)) {
          enviados.push(Date.now());
          while (enviados.length > 200) enviados.shift();
        }
      } catch (err) {
        // Un número sin WhatsApp o una caída de la conexión: el lead queda como formulario, como hasta ahora.
        log.warn({ err }, "No se pudo mandar el primer mensaje a un lead");
      }
      await esperar(PAUSA_MIN_MS + Math.random() * PAUSA_EXTRA_MS);
    }
  } finally {
    procesando = false;
  }
}

/** El saludo que toca, o null si el administrador no lo encendió para esa línea. Pura, para poder probarla. */
export function armarSaludo(
  config: Pick<Bienvenida, "formulario_activo" | "formulario_texto">,
  datos: { nombre: string | null; campos: CampoLead[]; marca: string | null; asesor: string | null },
): string | null {
  if (!config.formulario_activo) return null;
  const propio = config.formulario_texto?.trim();
  return textoPrimerMensaje({ ...datos, ...(propio ? { plantilla: propio } : {}) });
}

/**
 * El saludo de un lead de formulario: solo si el administrador lo encendió para esa línea (Bienvenida, en el panel) y con el texto
 * que escribió; si lo dejó vacío, el que el bot arma con las respuestas del formulario. Solo con la conexión por QR.
 */
export async function programarPrimerMensaje(p: {
  conversacionId: string;
  clienteId: string;
  telefono: string;
  linea: string;
  nombre: string | null;
  campos: CampoLead[];
  marca: string | null;
  asesor: string | null;
  leadgenId?: string;
}): Promise<void> {
  if (!env.WHATSAPP_QR_ACTIVO) return;
  const texto = armarSaludo(await leerBienvenida(p.linea), p);
  if (!texto) return;
  encolarPrimerMensaje({
    conversacionId: p.conversacionId,
    clienteId: p.clienteId,
    telefono: p.telefono,
    linea: p.linea,
    texto,
    ...(p.leadgenId ? { leadgenId: p.leadgenId } : {}),
  });
}

/** Pone en la cola el primer mensaje de un lead nuevo. No hace nada si no hay conexión por QR. */
export function encolarPrimerMensaje(p: PrimerMensaje): void {
  if (!env.WHATSAPP_QR_ACTIVO) return;
  if (cola.length >= TOPE_EN_COLA) {
    log.warn("Cola de primeros mensajes llena: este lead queda solo como formulario");
    return;
  }
  cola.push(p);
  void procesar();
}
