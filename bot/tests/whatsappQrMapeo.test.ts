import { describe, expect, it } from "vitest";
import { aEco, aMensajeEntrante, esChatIndividual, telefonoDeClave, telefonoDeJid, telefonoDelBot, textoDe } from "../src/whatsapp-qr/mapeo.js";

const clave = (extra: Record<string, unknown> = {}) => ({ id: "ABC123", remoteJid: "5219981234567@s.whatsapp.net", fromMe: false, ...extra });

describe("teléfonos de WhatsApp por QR", () => {
  it("saca los dígitos del jid, también con sufijo de dispositivo", () => {
    expect(telefonoDeJid("5219981234567@s.whatsapp.net")).toBe("5219981234567");
    expect(telefonoDeJid("5219981234567:12@s.whatsapp.net")).toBe("5219981234567");
  });

  it("no toma grupos, difusiones ni identificadores @lid como teléfono", () => {
    expect(telefonoDeJid("120363@g.us")).toBeNull();
    expect(telefonoDeJid("status@broadcast")).toBeNull();
    expect(telefonoDeJid("1234567890@lid")).toBeNull();
    expect(telefonoDeJid(null)).toBeNull();
  });

  it("con un @lid usa el teléfono alterno", () => {
    expect(telefonoDeClave({ remoteJid: "99887766@lid", remoteJidAlt: "5219981234567@s.whatsapp.net" })).toBe("5219981234567");
    expect(telefonoDeClave({ remoteJid: "99887766@lid" })).toBeNull();
  });

  it("solo son chats individuales los de teléfono o @lid", () => {
    expect(esChatIndividual("5219981234567@s.whatsapp.net")).toBe(true);
    expect(esChatIndividual("99887766@lid")).toBe(true);
    expect(esChatIndividual("120363@g.us")).toBe(false);
    expect(esChatIndividual("status@broadcast")).toBe(false);
    expect(esChatIndividual("123@newsletter")).toBe(false);
  });

  it("guarda los móviles mexicanos como 52 + 10 dígitos", () => {
    expect(telefonoDelBot("5219981234567")).toBe("529981234567");
    expect(telefonoDelBot("529981234567")).toBe("529981234567");
  });
});

describe("mensajes entrantes por QR", () => {
  it("un texto simple", () => {
    const m = aMensajeEntrante({ key: clave(), pushName: "Ana", messageTimestamp: 1_790_000_000 }, { conversation: " Hola " }, "529981234567");
    expect(m).toEqual({ kind: "text", id: "ABC123", from: "529981234567", timestamp: "1790000000", contactName: "Ana", text: "Hola" });
  });

  it("un texto largo (extendedTextMessage)", () => {
    const m = aMensajeEntrante({ key: clave() }, { extendedTextMessage: { text: "¿Cuánto cuesta la RTR 310?" } }, "529981234567");
    expect(m).toMatchObject({ kind: "text", text: "¿Cuánto cuesta la RTR 310?" });
  });

  it("una foto trae su pie y usa el id del mensaje como mediaId", () => {
    const m = aMensajeEntrante({ key: clave() }, { imageMessage: { caption: "mi INE", mimetype: "image/png" } }, "529981234567");
    expect(m).toMatchObject({ kind: "image", mediaId: "ABC123", mimeType: "image/png", caption: "mi INE" });
  });

  it("un documento conserva el nombre del archivo", () => {
    const m = aMensajeEntrante({ key: clave() }, { documentMessage: { fileName: "recibo.pdf", mimetype: "application/pdf" } }, "529981234567");
    expect(m).toMatchObject({ kind: "document", filename: "recibo.pdf", mimeType: "application/pdf" });
  });

  it("un audio se marca como audio", () => {
    expect(aMensajeEntrante({ key: clave() }, { audioMessage: { mimetype: "audio/ogg" } }, "529981234567")).toMatchObject({ kind: "audio" });
  });

  it("la respuesta a un botón llega como respuesta interactiva", () => {
    const m = aMensajeEntrante({ key: clave() }, { buttonsResponseMessage: { selectedButtonId: "op_1", selectedDisplayText: "Crédito" } }, "529981234567");
    expect(m).toMatchObject({ kind: "interactive_reply", replyTitle: "Crédito", replyId: "op_1" });
  });

  it("un sticker o un video sin texto es «no soportado»; sin id o sin contenido no hay mensaje", () => {
    expect(aMensajeEntrante({ key: clave() }, { stickerMessage: {} }, "529981234567")).toMatchObject({ kind: "unsupported", messageType: "sticker" });
    expect(aMensajeEntrante({ key: clave({ id: null }) }, { conversation: "hola" }, "529981234567")).toBeNull();
    expect(aMensajeEntrante({ key: clave() }, undefined, "529981234567")).toBeNull();
  });

  it("el texto de una foto cuenta como texto del mensaje", () => {
    expect(textoDe({ imageMessage: { caption: "mira" } })).toBe("mira");
    expect(textoDe({})).toBeNull();
  });
});

describe("mensajes del equipo desde el celular (eco)", () => {
  it("un texto escrito desde el celular", () => {
    const e = aEco({ key: clave({ fromMe: true }), messageTimestamp: 1_790_000_100 }, { conversation: "Claro, te marco" }, "529981234567");
    expect(e).toEqual({ id: "ABC123", to: "529981234567", timestamp: "1790000100", texto: "Claro, te marco", tipoOriginal: "text" });
  });

  it("una foto trae su archivo para guardarlo", () => {
    const e = aEco({ key: clave({ fromMe: true }) }, { imageMessage: { caption: "catálogo", mimetype: "image/jpeg" } }, "529981234567");
    expect(e).toMatchObject({ texto: "catálogo", tipoOriginal: "image", media: { tipo: "image", mediaId: "ABC123", mimeType: "image/jpeg" } });
  });

  it("un video se refleja sin archivo", () => {
    const e = aEco({ key: clave({ fromMe: true }) }, { videoMessage: { caption: "recorrido" } }, "529981234567");
    expect(e).toMatchObject({ texto: "recorrido", tipoOriginal: "video" });
    expect(e?.media).toBeUndefined();
  });
});
