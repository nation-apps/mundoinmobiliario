import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import { handleInboundMessage } from "../agent/handleMessage.js";
import { handleEcoApp } from "../agent/handleEcoApp.js";
import { borrarSesionGuardada, haySesionGuardada, usarSesionSupabase } from "./authSupabase.js";
import {
  aEco,
  aMensajeEntrante,
  esChatIndividual,
  telefonoDeClave,
  telefonoDeJid,
  telefonoDelBot,
  type ContenidoMinimo,
} from "./mapeo.js";

/**
 * WhatsApp por QR (Baileys): el bot se vincula como un dispositivo más del número, igual que WhatsApp Web.
 *
 * NO es la API oficial de Meta: WhatsApp puede bloquear el número, sobre todo con envíos masivos o a gente que no ha
 * escrito primero. Por eso este módulo SOLO contesta y refleja conversaciones (no manda plantillas ni difusiones) y
 * limita cuántos mensajes salen por minuto. Activa con WHATSAPP_QR_ACTIVO=true; la sesión se guarda en Supabase
 * (0010) para que sobreviva a los reinicios.
 */

export type EstadoQr = "apagado" | "sin_sesion" | "esperando_qr" | "conectando" | "conectado" | "desconectado";

const log = logger.child({ modulo: "whatsapp-qr" });
// Baileys es muy hablador: solo sus avisos y errores.
const logBaileys = logger.child({ modulo: "baileys" });
logBaileys.level = "warn";

/** Cuántas veces se pide un QR nuevo solo (sin que nadie lo escanee) antes de esperar a que alguien lo pida desde el panel. */
const MAX_QR_SIN_ESCANEAR = 3;
const MAX_REINTENTOS_CONEXION = 8;
const MENSAJES_GUARDADOS = 300;
const ESPERA_RAFAGA_MIN_MS = 600;
const ESPERA_RAFAGA_EXTRA_MS = 1400;

let estado: EstadoQr = env.WHATSAPP_QR_ACTIVO ? "sin_sesion" : "apagado";
let qrDataUrl: string | null = null;
let telefonoVinculado: string | null = null;
let ultimoError: string | null = null;
let sock: WASocket | null = null;
let deseaConexion = false;
let reintentos = 0;
let qrSinEscanear = 0;
let temporizadorReconexion: NodeJS.Timeout | null = null;

const vistos = new Map<string, number>();
/** Mensajes que mandó este mismo bot: su eco (fromMe) no es del equipo. */
const enviadosPorBot = new Set<string>();
/** Mensajes originales recientes: de ahí se baja la foto o el documento y se marca «leído» (la clave vive en el mensaje). */
const mensajesRecientes = new Map<string, WAMessage>();
/** teléfono (formato del bot) → jid con el que WhatsApp lo conoce (puede llevar o no el «1» de México). */
const jidPorTelefono = new Map<string, string>();

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function qrActivo(): boolean {
  return env.WHATSAPP_QR_ACTIVO;
}

export function estadoQr(): { activo: boolean; estado: EstadoQr; qr: string | null; telefono: string | null; error: string | null } {
  return { activo: env.WHATSAPP_QR_ACTIVO, estado, qr: estado === "esperando_qr" ? qrDataUrl : null, telefono: telefonoVinculado, error: ultimoError };
}

function recordarMensaje(m: WAMessage): void {
  const id = m.key.id;
  if (!id) return;
  mensajesRecientes.set(id, m);
  while (mensajesRecientes.size > MENSAJES_GUARDADOS) {
    const primero = mensajesRecientes.keys().next().value;
    if (primero === undefined) break;
    mensajesRecientes.delete(primero);
  }
}

function esDuplicado(id: string): boolean {
  const ahora = Date.now();
  for (const [visto, cuando] of vistos) if (ahora - cuando > 10 * 60_000) vistos.delete(visto);
  if (vistos.has(id)) return true;
  vistos.set(id, ahora);
  return false;
}

async function resolverTelefono(s: WASocket, m: WAMessage): Promise<string | null> {
  const directo = telefonoDeClave(m.key);
  if (directo) return directo;
  const lid = m.key.remoteJid;
  if (lid?.endsWith("@lid")) {
    try {
      return telefonoDeJid(await s.signalRepository.lidMapping.getPNForLID(lid));
    } catch (err) {
      log.warn({ err }, "No se pudo resolver el teléfono de un contacto con identificador @lid");
    }
  }
  return null;
}

async function procesarMensaje(s: WASocket, m: WAMessage, tipo: string): Promise<void> {
  const jid = m.key.remoteJid;
  if (!esChatIndividual(jid)) return;
  const propio = Boolean(m.key.fromMe);
  if (!propio && tipo !== "notify") return; // lo que llega en «append» es historial: no se contesta
  const id = m.key.id;
  if (!id || esDuplicado(id)) return;
  if (propio && enviadosPorBot.has(id)) return;

  const contenido = normalizeMessageContent(m.message) as ContenidoMinimo | undefined;
  if (!contenido) return; // protocolo, reacciones, recibos…

  const digitos = await resolverTelefono(s, m);
  const telefono = digitos ? telefonoDelBot(digitos) : null;
  if (!telefono) {
    log.warn("Mensaje sin teléfono resoluble, se ignora");
    return;
  }
  if (jid) jidPorTelefono.set(telefono, jid.endsWith("@lid") ? (m.key.remoteJidAlt ?? jid) : jid);
  recordarMensaje(m);

  if (propio) {
    const eco = aEco(m, contenido, telefono);
    if (eco) await handleEcoApp(eco);
    return;
  }
  const entrante = aMensajeEntrante(m, contenido, telefono);
  if (!entrante) return;
  if (entrante.kind === "unsupported") {
    log.info({ tipo: entrante.messageType }, "Tipo de mensaje no soportado por la conexión QR, se ignora");
    return;
  }
  if (entrante.kind === "text" && entrante.referral) {
    log.info({ anuncioId: entrante.referral.sourceId, titulo: entrante.referral.headline }, "Mensaje que llegó desde un anuncio de clic a WhatsApp");
  }
  await handleInboundMessage(entrante);
}

function codigoDeCierre(err: unknown): number | undefined {
  return (err as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

function programarReconexion(ms: number): void {
  if (temporizadorReconexion) clearTimeout(temporizadorReconexion);
  temporizadorReconexion = setTimeout(() => {
    temporizadorReconexion = null;
    conectar().catch((err: unknown) => {
      ultimoError = err instanceof Error ? err.message : String(err);
      log.error({ err }, "Falló la reconexión de WhatsApp por QR");
    });
  }, ms);
}

async function alCerrarse(error: unknown): Promise<void> {
  const codigo = codigoDeCierre(error);
  sock = null;
  qrDataUrl = null;

  if (codigo === DisconnectReason.loggedOut) {
    // Desvincularon el dispositivo desde el celular: la sesión ya no sirve.
    log.warn("El número desvinculó este dispositivo: se borra la sesión guardada");
    deseaConexion = false;
    estado = "desconectado";
    telefonoVinculado = null;
    await borrarSesionGuardada().catch((err: unknown) => log.error({ err }, "No se pudo borrar la sesión guardada"));
    return;
  }
  if (codigo === DisconnectReason.connectionReplaced) {
    // Otra instancia (p. ej. un despliegue nuevo) tomó la sesión: pelearla la desconectaría a ella.
    log.warn("La sesión se abrió en otro lugar: este proceso no reconecta");
    deseaConexion = false;
    estado = "desconectado";
    return;
  }
  if (!deseaConexion) {
    estado = "desconectado";
    return;
  }
  if (codigo === DisconnectReason.restartRequired) {
    // Pasa justo después de escanear el QR: hay que abrir la conexión otra vez.
    programarReconexion(500);
    return;
  }
  if (estado === "esperando_qr") {
    qrSinEscanear++;
    if (qrSinEscanear >= MAX_QR_SIN_ESCANEAR) {
      log.info("Nadie escaneó el QR: se espera a que lo pidan de nuevo desde el panel");
      deseaConexion = false;
      estado = "sin_sesion";
      return;
    }
    programarReconexion(1000);
    return;
  }
  reintentos++;
  if (reintentos > MAX_REINTENTOS_CONEXION) {
    log.error({ codigo }, "Demasiados fallos de conexión: se deja de reintentar");
    deseaConexion = false;
    estado = "desconectado";
    ultimoError = "La conexión falló varias veces seguidas. Vuelve a conectarla desde el panel.";
    return;
  }
  estado = "conectando";
  programarReconexion(Math.min(30_000, 2000 * 2 ** (reintentos - 1)));
}

async function conectar(): Promise<void> {
  if (sock) return;
  const { state, guardarCreds } = await usarSesionSupabase();
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  const s = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logBaileys) },
    ...(version ? { version } : {}),
    browser: Browsers.ubuntu("Chrome"),
    logger: logBaileys,
    // El celular sigue recibiendo sus notificaciones: este dispositivo no se anuncia como «en línea».
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
  });
  sock = s;
  estado = state.creds.registered ? "conectando" : estado === "esperando_qr" ? estado : "conectando";

  s.ev.on("creds.update", () => {
    guardarCreds().catch((err: unknown) => log.error({ err }, "No se pudo guardar la sesión de WhatsApp"));
  });

  s.ev.on("connection.update", (u) => {
    if (u.qr) {
      estado = "esperando_qr";
      QRCode.toDataURL(u.qr, { margin: 1, width: 320 })
        .then((url) => {
          qrDataUrl = url;
        })
        .catch((err: unknown) => log.error({ err }, "No se pudo dibujar el QR"));
    }
    if (u.connection === "open") {
      estado = "conectado";
      qrDataUrl = null;
      reintentos = 0;
      qrSinEscanear = 0;
      ultimoError = null;
      telefonoVinculado = telefonoDeJid(s.user?.id ? `${s.user.id.split(":")[0]}@s.whatsapp.net` : null);
      log.info("WhatsApp por QR conectado");
    }
    if (u.connection === "close") {
      void alCerrarse(u.lastDisconnect?.error);
    }
  });

  s.ev.on("messages.upsert", ({ messages, type }) => {
    for (const m of messages) {
      procesarMensaje(s, m, type).catch((err: unknown) => log.error({ err }, "Fallo manejando un mensaje de WhatsApp por QR"));
    }
  });
}

/** Empieza (o reanuda) la conexión. Sin sesión guardada, genera un QR para escanear. */
export async function iniciarSesionQr(): Promise<void> {
  if (!env.WHATSAPP_QR_ACTIVO) throw new AppError("La conexión por QR está apagada (WHATSAPP_QR_ACTIVO)", "whatsapp_qr_apagado", 409);
  if (sock || temporizadorReconexion) return;
  deseaConexion = true;
  reintentos = 0;
  qrSinEscanear = 0;
  ultimoError = null;
  try {
    await conectar();
  } catch (err) {
    deseaConexion = false;
    sock = null;
    estado = "desconectado";
    ultimoError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/** Desvincula el dispositivo (el número deja de estar conectado) y borra la sesión guardada. */
export async function cerrarSesionQr(): Promise<void> {
  deseaConexion = false;
  if (temporizadorReconexion) {
    clearTimeout(temporizadorReconexion);
    temporizadorReconexion = null;
  }
  const s = sock;
  sock = null;
  if (s) await s.logout().catch((err: unknown) => log.warn({ err }, "No se pudo cerrar la sesión limpiamente"));
  await borrarSesionGuardada();
  estado = "sin_sesion";
  qrDataUrl = null;
  telefonoVinculado = null;
}

/** Al arrancar el bot: si ya hay un número vinculado, reconecta solo (sin pedir un QR nuevo). */
export async function arrancarSesionQrSiHayGuardada(): Promise<void> {
  if (!env.WHATSAPP_QR_ACTIVO) return;
  try {
    if (await haySesionGuardada()) await iniciarSesionQr();
    else log.info("WhatsApp por QR activo, sin número vinculado: se espera a que se genere un QR desde el panel");
  } catch (err) {
    ultimoError = err instanceof Error ? err.message : String(err);
    log.error({ err }, "No se pudo arrancar WhatsApp por QR (¿está aplicada la migración 0010?)");
  }
}

/* ---------- Envío ---------- */

const marcasEnvio: number[] = [];
let colaEnvio: Promise<unknown> = Promise.resolve();

/** Un envío a la vez, con una pausa corta al azar entre mensajes y un tope por minuto: las ráfagas son lo que más bloquea números. */
function encolar<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = colaEnvio.then(async () => {
    const ahora = Date.now();
    while (marcasEnvio.length > 0 && ahora - (marcasEnvio[0] ?? 0) > 60_000) marcasEnvio.shift();
    if (marcasEnvio.length >= env.WHATSAPP_QR_MAX_POR_MINUTO) {
      await esperar(60_000 - (ahora - (marcasEnvio[0] ?? ahora)) + 250);
    }
    await esperar(ESPERA_RAFAGA_MIN_MS + Math.random() * ESPERA_RAFAGA_EXTRA_MS);
    marcasEnvio.push(Date.now());
    return tarea();
  });
  colaEnvio = resultado.catch(() => undefined);
  return resultado;
}

function conectado(): WASocket {
  if (!sock || estado !== "conectado") {
    throw new AppError("WhatsApp por QR no está conectado", "whatsapp_qr_desconectado", 503);
  }
  return sock;
}

async function jidDe(s: WASocket, telefono: string): Promise<string> {
  const conocido = jidPorTelefono.get(telefono);
  if (conocido) return conocido;
  const resultado = (await s.onWhatsApp(telefono))?.[0];
  if (!resultado?.exists) throw new AppError("Ese número no tiene WhatsApp", "whatsapp_qr_sin_whatsapp", 502);
  jidPorTelefono.set(telefono, resultado.jid);
  return resultado.jid;
}

function anotarEnviado(enviado: WAMessage | undefined): string {
  const id = enviado?.key.id ?? "";
  if (id) {
    enviadosPorBot.add(id);
    // El eco (fromMe) de lo enviado llega enseguida; pasados unos minutos ya no hace falta recordarlo.
    setTimeout(() => enviadosPorBot.delete(id), 10 * 60_000).unref();
  }
  return id;
}

export async function enviarTextoQr(para: string, texto: string): Promise<string> {
  return encolar(async () => {
    const s = conectado();
    const jid = await jidDe(s, para);
    const enviado = await s.sendMessage(jid, { text: texto });
    await s.sendPresenceUpdate("paused", jid).catch(() => undefined);
    return anotarEnviado(enviado);
  });
}

export type TipoMediaQr = "image" | "video" | "audio" | "document";

export async function enviarMediaQr(params: { para: string; tipo: TipoMediaQr; link: string; caption?: string | null }): Promise<string> {
  return encolar(async () => {
    const s = conectado();
    const jid = await jidDe(s, params.para);
    const url = { url: params.link };
    const pie = params.caption?.trim() ? { caption: params.caption.trim() } : {};
    const nombre = decodeURIComponent(new URL(params.link).pathname.split("/").pop() || "archivo");
    const enviado = await s.sendMessage(
      jid,
      params.tipo === "image"
        ? { image: url, ...pie }
        : params.tipo === "video"
          ? { video: url, ...pie }
          : params.tipo === "audio"
            ? { audio: url, mimetype: "audio/mpeg" }
            : { document: url, mimetype: "application/pdf", fileName: nombre, ...pie },
    );
    return anotarEnviado(enviado);
  });
}

/** «Leído» y «escribiendo…» (cosmético: quien llama ignora cualquier error). */
export async function marcarLeidoYEscribiendoQr(mensajeId: string): Promise<void> {
  const s = conectado();
  const m = mensajesRecientes.get(mensajeId);
  if (!m?.key.remoteJid) return;
  await s.readMessages([m.key]);
  await s.sendPresenceUpdate("composing", m.key.remoteJid);
}

/** Baja la foto o el documento de un mensaje reciente (el «mediaId» de la conexión QR es el id del mensaje). */
export async function descargarMediaQr(mensajeId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const s = conectado();
  const m = mensajesRecientes.get(mensajeId);
  if (!m) throw new AppError("El archivo ya no está disponible para descargar", "whatsapp_qr_media_vencida", 410);
  const contenido = normalizeMessageContent(m.message) as ContenidoMinimo | undefined;
  const buffer = await downloadMediaMessage(m, "buffer", {}, { logger: logBaileys, reuploadRequest: s.updateMediaMessage });
  const mimeType =
    contenido?.imageMessage?.mimetype ??
    contenido?.documentMessage?.mimetype ??
    contenido?.audioMessage?.mimetype ??
    contenido?.videoMessage?.mimetype ??
    "application/octet-stream";
  return { buffer, mimeType };
}
