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
import { LINEA_POR_DEFECTO, lineaPorId, lineasConfiguradas, type Linea } from "../lib/lineas.js";
import { handleInboundMessage } from "../agent/handleMessage.js";
import { handleEcoApp } from "../agent/handleEcoApp.js";
import { borrarSesionGuardada, haySesionGuardada, usarSesionSupabase } from "./authSupabase.js";
import {
  aEco,
  aMensajeEntrante,
  esChatIndividual,
  resumenContexto,
  telefonoDeClave,
  telefonoDeJid,
  telefonoDelBot,
  type ContenidoMinimo,
} from "./mapeo.js";

/**
 * WhatsApp por QR (Baileys): el bot se vincula como un dispositivo más del número, igual que WhatsApp Web. Hay una sesión por
 * LÍNEA (TVS y Mundo de Motos, lib/lineas.ts), cada una con su QR, su conexión, su cola de envío y su tope por minuto.
 *
 * NO es la API oficial de Meta: WhatsApp puede bloquear el número, sobre todo con envíos masivos o a gente que no ha
 * escrito primero. Por eso este módulo SOLO contesta y refleja conversaciones (no manda plantillas ni difusiones) y
 * limita cuántos mensajes salen por minuto en cada número. Activa con WHATSAPP_QR_ACTIVO=true; las sesiones se guardan en
 * Supabase (0010) para que sobrevivan a los reinicios.
 */

export type EstadoQr = "apagado" | "sin_sesion" | "esperando_qr" | "conectando" | "conectado" | "desconectado";

export type EstadoLineaQr = {
  id: string;
  etiqueta: string;
  marca: string;
  estado: EstadoQr;
  qr: string | null;
  /** El número que quedó vinculado (52 + 10 dígitos). */
  telefono: string | null;
  /** El número que se espera en esta línea (el del documento del cliente). */
  telefonoEsperado: string;
  /** Se conectó un número que no es el esperado para esta línea. */
  advertencia: string | null;
  error: string | null;
};

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

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function codigoDeCierre(err: unknown): number | undefined {
  return (err as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

function formatoTelefono(t: string): string {
  return t.length === 12 ? `+${t.slice(0, 2)} ${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8)}` : `+${t}`;
}

/** La conexión de UNA línea: su socket, su estado, su cola de envío y sus memorias de mensajes. */
class SesionLinea {
  private estado: EstadoQr = env.WHATSAPP_QR_ACTIVO ? "sin_sesion" : "apagado";
  private qrDataUrl: string | null = null;
  private telefonoVinculado: string | null = null;
  private advertencia: string | null = null;
  private ultimoError: string | null = null;
  private sock: WASocket | null = null;
  private deseaConexion = false;
  private reintentos = 0;
  private qrSinEscanear = 0;
  private temporizadorReconexion: NodeJS.Timeout | null = null;

  private readonly vistos = new Map<string, number>();
  /** Mensajes que mandó este mismo bot: su eco (fromMe) no es del equipo. */
  private readonly enviadosPorBot = new Set<string>();
  /** Mensajes originales recientes: de ahí se baja la foto o el documento y se marca «leído» (la clave vive en el mensaje). */
  readonly mensajesRecientes = new Map<string, WAMessage>();
  /** teléfono (formato del bot) → jid con el que WhatsApp lo conoce (puede llevar o no el «1» de México). */
  private readonly jidPorTelefono = new Map<string, string>();

  private readonly marcasEnvio: number[] = [];
  private colaEnvio: Promise<unknown> = Promise.resolve();

  constructor(readonly linea: Linea) {}

  private get log() {
    return log.child({ linea: this.linea.id });
  }

  estadoPublico(): EstadoLineaQr {
    return {
      id: this.linea.id,
      etiqueta: this.linea.etiqueta,
      marca: this.linea.marca,
      estado: this.estado,
      qr: this.estado === "esperando_qr" ? this.qrDataUrl : null,
      telefono: this.telefonoVinculado,
      telefonoEsperado: this.linea.telefono,
      advertencia: this.advertencia,
      error: this.ultimoError,
    };
  }

  private recordarMensaje(m: WAMessage): void {
    const id = m.key.id;
    if (!id) return;
    this.mensajesRecientes.set(id, m);
    while (this.mensajesRecientes.size > MENSAJES_GUARDADOS) {
      const primero = this.mensajesRecientes.keys().next().value;
      if (primero === undefined) break;
      this.mensajesRecientes.delete(primero);
    }
  }

  private esDuplicado(id: string): boolean {
    const ahora = Date.now();
    for (const [visto, cuando] of this.vistos) if (ahora - cuando > 10 * 60_000) this.vistos.delete(visto);
    if (this.vistos.has(id)) return true;
    this.vistos.set(id, ahora);
    return false;
  }

  private async resolverTelefono(s: WASocket, m: WAMessage): Promise<string | null> {
    const directo = telefonoDeClave(m.key);
    if (directo) return directo;
    const lid = m.key.remoteJid;
    if (lid?.endsWith("@lid")) {
      try {
        return telefonoDeJid(await s.signalRepository.lidMapping.getPNForLID(lid));
      } catch (err) {
        this.log.warn({ err }, "No se pudo resolver el teléfono de un contacto con identificador @lid");
      }
    }
    return null;
  }

  private async procesarMensaje(s: WASocket, m: WAMessage, tipo: string): Promise<void> {
    const jid = m.key.remoteJid;
    if (!esChatIndividual(jid)) return;
    const propio = Boolean(m.key.fromMe);
    if (!propio && tipo !== "notify") return; // lo que llega en «append» es historial: no se contesta
    const id = m.key.id;
    if (!id || this.esDuplicado(id)) return;
    if (propio && this.enviadosPorBot.has(id)) return;

    const contenido = normalizeMessageContent(m.message) as ContenidoMinimo | undefined;
    if (!contenido) return; // protocolo, reacciones, recibos…

    const digitos = await this.resolverTelefono(s, m);
    const telefono = digitos ? telefonoDelBot(digitos) : null;
    if (!telefono) {
      this.log.warn("Mensaje sin teléfono resoluble, se ignora");
      return;
    }
    if (jid) this.jidPorTelefono.set(telefono, jid.endsWith("@lid") ? (m.key.remoteJidAlt ?? jid) : jid);
    this.recordarMensaje(m);

    if (propio) {
      const eco = aEco(m, contenido, telefono);
      if (eco) await handleEcoApp(eco, undefined, this.linea.id);
      return;
    }
    const entrante = aMensajeEntrante(m, contenido, telefono);
    if (!entrante) return;
    if (entrante.kind === "unsupported") {
      this.log.info({ tipo: entrante.messageType }, "Tipo de mensaje no soportado por la conexión QR, se ignora");
      return;
    }
    if (entrante.kind === "text" && entrante.referral) {
      this.log.info(
        { anuncioId: entrante.referral.sourceId, titulo: entrante.referral.headline },
        entrante.referral.sourceId ? "Mensaje que llegó desde un anuncio de clic a WhatsApp" : "Mensaje de un anuncio de clic a WhatsApp (WhatsApp no dijo cuál)",
      );
    } else if (entrante.kind === "text") {
      // Sin datos de anuncio: se anota qué señales trajo, para entender los chats de campaña que no se reconocen.
      this.log.info(resumenContexto(contenido), "Mensaje sin datos de anuncio");
    }
    await handleInboundMessage(entrante, this.linea.id);
  }

  private programarReconexion(ms: number): void {
    if (this.temporizadorReconexion) clearTimeout(this.temporizadorReconexion);
    this.temporizadorReconexion = setTimeout(() => {
      this.temporizadorReconexion = null;
      this.conectar().catch((err: unknown) => {
        this.ultimoError = err instanceof Error ? err.message : String(err);
        this.log.error({ err }, "Falló la reconexión de WhatsApp por QR");
      });
    }, ms);
  }

  private async alCerrarse(error: unknown): Promise<void> {
    const codigo = codigoDeCierre(error);
    this.sock = null;
    this.qrDataUrl = null;

    if (codigo === DisconnectReason.loggedOut) {
      // Desvincularon el dispositivo desde el celular: la sesión ya no sirve.
      this.log.warn("El número desvinculó este dispositivo: se borra la sesión guardada");
      this.deseaConexion = false;
      this.estado = "desconectado";
      this.telefonoVinculado = null;
      this.advertencia = null;
      await borrarSesionGuardada(this.linea.id).catch((err: unknown) => this.log.error({ err }, "No se pudo borrar la sesión guardada"));
      return;
    }
    if (codigo === DisconnectReason.connectionReplaced) {
      // Otra instancia (p. ej. un despliegue nuevo) tomó la sesión: pelearla la desconectaría a ella.
      this.log.warn("La sesión se abrió en otro lugar: este proceso no reconecta");
      this.deseaConexion = false;
      this.estado = "desconectado";
      return;
    }
    if (!this.deseaConexion) {
      this.estado = "desconectado";
      return;
    }
    if (codigo === DisconnectReason.restartRequired) {
      // Pasa justo después de escanear el QR: hay que abrir la conexión otra vez.
      this.programarReconexion(500);
      return;
    }
    if (this.estado === "esperando_qr") {
      this.qrSinEscanear++;
      if (this.qrSinEscanear >= MAX_QR_SIN_ESCANEAR) {
        this.log.info("Nadie escaneó el QR: se espera a que lo pidan de nuevo desde el panel");
        this.deseaConexion = false;
        this.estado = "sin_sesion";
        return;
      }
      this.programarReconexion(1000);
      return;
    }
    this.reintentos++;
    if (this.reintentos > MAX_REINTENTOS_CONEXION) {
      this.log.error({ codigo }, "Demasiados fallos de conexión: se deja de reintentar");
      this.deseaConexion = false;
      this.estado = "desconectado";
      this.ultimoError = "La conexión falló varias veces seguidas. Vuelve a conectarla desde el panel.";
      return;
    }
    this.estado = "conectando";
    this.programarReconexion(Math.min(30_000, 2000 * 2 ** (this.reintentos - 1)));
  }

  private async conectar(): Promise<void> {
    if (this.sock) return;
    const { state, guardarCreds } = await usarSesionSupabase(this.linea.id);
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
    this.sock = s;
    this.estado = state.creds.registered ? "conectando" : this.estado === "esperando_qr" ? this.estado : "conectando";

    s.ev.on("creds.update", () => {
      guardarCreds().catch((err: unknown) => this.log.error({ err }, "No se pudo guardar la sesión de WhatsApp"));
    });

    s.ev.on("connection.update", (u) => {
      if (u.qr) {
        this.estado = "esperando_qr";
        QRCode.toDataURL(u.qr, { margin: 1, width: 320 })
          .then((url) => {
            this.qrDataUrl = url;
          })
          .catch((err: unknown) => this.log.error({ err }, "No se pudo dibujar el QR"));
      }
      if (u.connection === "open") {
        this.estado = "conectado";
        this.qrDataUrl = null;
        this.reintentos = 0;
        this.qrSinEscanear = 0;
        this.ultimoError = null;
        const digitos = telefonoDeJid(s.user?.id ? `${s.user.id.split(":")[0]}@s.whatsapp.net` : null);
        this.telefonoVinculado = digitos ? telefonoDelBot(digitos) : null;
        // Avisa si se escaneó el QR de otro número (p. ej. el de Mundo de Motos en la línea de TVS). No bloquea: sirve para pruebas.
        this.advertencia =
          this.telefonoVinculado && this.linea.telefono && this.telefonoVinculado !== this.linea.telefono
            ? `Este número (${formatoTelefono(this.telefonoVinculado)}) no es el de ${this.linea.etiqueta} (${formatoTelefono(this.linea.telefono)}).`
            : null;
        if (this.advertencia) this.log.warn(this.advertencia);
        this.log.info("WhatsApp por QR conectado");
      }
      if (u.connection === "close") {
        void this.alCerrarse(u.lastDisconnect?.error);
      }
    });

    s.ev.on("messages.upsert", ({ messages, type }) => {
      for (const m of messages) {
        this.procesarMensaje(s, m, type).catch((err: unknown) => this.log.error({ err }, "Fallo manejando un mensaje de WhatsApp por QR"));
      }
    });
  }

  /** Empieza (o reanuda) la conexión. Sin sesión guardada, genera un QR para escanear. */
  async iniciar(): Promise<void> {
    if (!env.WHATSAPP_QR_ACTIVO) throw new AppError("La conexión por QR está apagada (WHATSAPP_QR_ACTIVO)", "whatsapp_qr_apagado", 409);
    if (this.sock || this.temporizadorReconexion) return;
    this.deseaConexion = true;
    this.reintentos = 0;
    this.qrSinEscanear = 0;
    this.ultimoError = null;
    try {
      await this.conectar();
    } catch (err) {
      this.deseaConexion = false;
      this.sock = null;
      this.estado = "desconectado";
      this.ultimoError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /** Desvincula el dispositivo (el número deja de estar conectado) y borra la sesión guardada de esta línea. */
  async cerrar(): Promise<void> {
    this.deseaConexion = false;
    if (this.temporizadorReconexion) {
      clearTimeout(this.temporizadorReconexion);
      this.temporizadorReconexion = null;
    }
    const s = this.sock;
    this.sock = null;
    if (s) await s.logout().catch((err: unknown) => this.log.warn({ err }, "No se pudo cerrar la sesión limpiamente"));
    await borrarSesionGuardada(this.linea.id);
    this.estado = "sin_sesion";
    this.qrDataUrl = null;
    this.telefonoVinculado = null;
    this.advertencia = null;
  }

  /** Al arrancar el bot: si ya hay un número vinculado en esta línea, reconecta solo (sin pedir un QR nuevo). */
  async arrancarSiHayGuardada(): Promise<void> {
    if (!env.WHATSAPP_QR_ACTIVO) return;
    try {
      if (await haySesionGuardada(this.linea.id)) await this.iniciar();
      else this.log.info("WhatsApp por QR activo, sin número vinculado en esta línea: se espera a que se genere un QR desde el panel");
    } catch (err) {
      this.ultimoError = err instanceof Error ? err.message : String(err);
      this.log.error({ err }, "No se pudo arrancar WhatsApp por QR (¿está aplicada la migración 0010?)");
    }
  }

  /* ---------- Envío ---------- */

  /** Un envío a la vez, con una pausa corta al azar entre mensajes y un tope por minuto: las ráfagas son lo que más bloquea números. */
  private encolar<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = this.colaEnvio.then(async () => {
      const ahora = Date.now();
      while (this.marcasEnvio.length > 0 && ahora - (this.marcasEnvio[0] ?? 0) > 60_000) this.marcasEnvio.shift();
      if (this.marcasEnvio.length >= env.WHATSAPP_QR_MAX_POR_MINUTO) {
        await esperar(60_000 - (ahora - (this.marcasEnvio[0] ?? ahora)) + 250);
      }
      await esperar(ESPERA_RAFAGA_MIN_MS + Math.random() * ESPERA_RAFAGA_EXTRA_MS);
      this.marcasEnvio.push(Date.now());
      return tarea();
    });
    this.colaEnvio = resultado.catch(() => undefined);
    return resultado;
  }

  private conectado(): WASocket {
    if (!this.sock || this.estado !== "conectado") {
      throw new AppError(`${this.linea.etiqueta} no está conectado`, "whatsapp_qr_desconectado", 503);
    }
    return this.sock;
  }

  private async jidDe(s: WASocket, telefono: string): Promise<string> {
    const conocido = this.jidPorTelefono.get(telefono);
    if (conocido) return conocido;
    const resultado = (await s.onWhatsApp(telefono))?.[0];
    if (!resultado?.exists) throw new AppError("Ese número no tiene WhatsApp", "whatsapp_qr_sin_whatsapp", 502);
    this.jidPorTelefono.set(telefono, resultado.jid);
    return resultado.jid;
  }

  private anotarEnviado(enviado: WAMessage | undefined): string {
    const id = enviado?.key.id ?? "";
    if (id) {
      this.enviadosPorBot.add(id);
      // El eco (fromMe) de lo enviado llega enseguida; pasados unos minutos ya no hace falta recordarlo.
      setTimeout(() => this.enviadosPorBot.delete(id), 10 * 60_000).unref();
    }
    return id;
  }

  enviarTexto(para: string, texto: string): Promise<string> {
    return this.encolar(async () => {
      const s = this.conectado();
      const jid = await this.jidDe(s, para);
      const enviado = await s.sendMessage(jid, { text: texto });
      return this.anotarEnviado(enviado);
    });
  }

  enviarMedia(params: { para: string; tipo: TipoMediaQr; link: string; caption?: string | null }): Promise<string> {
    return this.encolar(async () => {
      const s = this.conectado();
      const jid = await this.jidDe(s, params.para);
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
      return this.anotarEnviado(enviado);
    });
  }

  async descargarMedia(mensajeId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const s = this.conectado();
    const m = this.mensajesRecientes.get(mensajeId);
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
}

export type TipoMediaQr = "image" | "video" | "audio" | "document";

/* ---------- Las líneas ---------- */

const sesiones = new Map<string, SesionLinea>();

function sesionDe(id: string | null | undefined): SesionLinea {
  const linea = lineaPorId(id ?? LINEA_POR_DEFECTO);
  if (!linea) throw new AppError("Esa línea de WhatsApp no existe", "linea_desconocida", 400);
  let s = sesiones.get(linea.id);
  if (!s) {
    s = new SesionLinea(linea);
    sesiones.set(linea.id, s);
  }
  return s;
}

export function qrActivo(): boolean {
  return env.WHATSAPP_QR_ACTIVO;
}

/** El estado de cada línea, en el orden en que están configuradas. */
export function estadoLineasQr(): EstadoLineaQr[] {
  return lineasConfiguradas().map((l) => sesionDe(l.id).estadoPublico());
}

export function estadoLineaQr(linea: string | null | undefined): EstadoLineaQr {
  return sesionDe(linea).estadoPublico();
}

export function iniciarSesionQr(linea: string): Promise<void> {
  return sesionDe(linea).iniciar();
}

export function cerrarSesionQr(linea: string): Promise<void> {
  return sesionDe(linea).cerrar();
}

/** Al arrancar el bot: cada línea que ya tiene un número vinculado reconecta sola. */
export async function arrancarSesionesQrSiHayGuardadas(): Promise<void> {
  if (!env.WHATSAPP_QR_ACTIVO) return;
  await Promise.all(lineasConfiguradas().map((l) => sesionDe(l.id).arrancarSiHayGuardada()));
}

/** Mandar por la línea pedida; sin línea, la de por defecto (TVS). Nunca se «cae» a otra línea en silencio. */
export function enviarTextoQr(para: string, texto: string, linea?: string | null | undefined): Promise<string> {
  return sesionDe(linea).enviarTexto(para, texto);
}

export function enviarMediaQr(params: { para: string; tipo: TipoMediaQr; link: string; caption?: string | null; linea?: string | null | undefined }): Promise<string> {
  return sesionDe(params.linea).enviarMedia(params);
}

/** El mensaje pertenece a la línea que lo recibió: se busca en todas. */
function sesionDelMensaje(mensajeId: string): SesionLinea | null {
  for (const s of sesiones.values()) if (s.mensajesRecientes.has(mensajeId)) return s;
  return null;
}

/**
 * Por QR no se marca «leído» ni se muestra «escribiendo…»: el CRM es un dispositivo vinculado, y si marca leído (o aparece en
 * línea) el celular del negocio pierde la notificación y el globito de no leído, y parece que el mensaje no le llegó.
 */
export async function marcarLeidoYEscribiendoQr(_mensajeId: string): Promise<void> {}

/** Baja la foto o el documento de un mensaje reciente (el «mediaId» de la conexión QR es el id del mensaje). */
export async function descargarMediaQr(mensajeId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const s = sesionDelMensaje(mensajeId);
  if (!s) throw new AppError("El archivo ya no está disponible para descargar", "whatsapp_qr_media_vencida", 410);
  return s.descargarMedia(mensajeId);
}
