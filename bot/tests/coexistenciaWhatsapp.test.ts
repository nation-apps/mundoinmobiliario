import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const mensajes = { guardarMensaje: vi.fn(async () => ({ id: "m1" })), existeExternalId: vi.fn(async () => false) };
vi.mock("../src/db/repositories/mensajes.js", () => mensajes);
const clientes = { findOrCreateByPhone: vi.fn(async () => ({ id: "cl-1", telefono: "529981234567" })) };
vi.mock("../src/db/repositories/clientes.js", () => clientes);
const conversaciones = {
  getOrCreateConversacionAbierta: vi.fn(async () => ({ id: "conv-1" })),
  pasarAPersona: vi.fn(async () => true),
};
vi.mock("../src/db/repositories/conversaciones.js", () => conversaciones);
const whatsapp = { descargarMedia: vi.fn(async () => ({ buffer: Buffer.from("x"), mimeType: "image/jpeg" })) };
vi.mock("../src/whatsapp/client.js", () => whatsapp);
const adjuntos = { subirAdjunto: vi.fn(async () => "conv-1/1.jpg") };
vi.mock("../src/lib/adjuntos.js", () => adjuntos);

const { parseEcosApp, resumenSincronizacion, describeParsePayloadError, parseInboundMessages } = await import("../src/whatsapp/parser.js");
const { handleEcoApp } = await import("../src/agent/handleEcoApp.js");

beforeEach(() => {
  vi.clearAllMocks();
  mensajes.existeExternalId.mockResolvedValue(false);
});

const metadata = { display_phone_number: "529987584160", phone_number_id: "PNID" };
const cambio = (field: string, value: Record<string, unknown>) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field, value: { messaging_product: "whatsapp", metadata, ...value } }] }],
});

describe("parser de coexistencia", () => {
  it("lee un mensaje de texto que el equipo mandó desde el celular", () => {
    const payload = cambio("smb_message_echoes", {
      message_echoes: [{ from: "529987584160", to: "529981234567", id: "wamid.ECO1", timestamp: "1760000000", type: "text", text: { body: "Hola, soy Karla de TVS" } }],
    });
    expect(describeParsePayloadError(payload)).toBeNull();
    expect(parseEcosApp(payload)).toEqual([
      { id: "wamid.ECO1", to: "529981234567", timestamp: "1760000000", tipoOriginal: "text", texto: "Hola, soy Karla de TVS" },
    ]);
    // No es un mensaje del cliente: el flujo normal no lo ve.
    expect(parseInboundMessages(payload)).toEqual([]);
  });

  it("lee fotos y documentos con su pie", () => {
    const payload = cambio("smb_message_echoes", {
      message_echoes: [
        { to: "529981234567", id: "wamid.F", type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "La RTR 160 en negro" } },
        { to: "529981234567", id: "wamid.D", type: "document", document: { id: "MEDIA2", filename: "Ficha RR 310.pdf" } },
      ],
    });
    const [foto, doc] = parseEcosApp(payload);
    expect(foto).toMatchObject({ texto: "La RTR 160 en negro", media: { tipo: "image", mediaId: "MEDIA1", mimeType: "image/jpeg" } });
    expect(doc).toMatchObject({ texto: null, media: { tipo: "document", mediaId: "MEDIA2", filename: "Ficha RR 310.pdf" } });
  });

  it("un eco raro no tumba a los demás ni al webhook", () => {
    const payload = cambio("smb_message_echoes", {
      message_echoes: [{ id: "sin-destino", type: "text" }, "basura", { to: "529981234567", id: "wamid.OK", type: "sticker" }],
    });
    expect(describeParsePayloadError(payload)).toBeNull();
    expect(parseEcosApp(payload)).toEqual([{ id: "wamid.OK", to: "529981234567", tipoOriginal: "sticker", texto: null }]);
  });

  it("cuenta el historial y los contactos sin leerlos", () => {
    const historial = cambio("history", { history: [{ metadata: { phase: 0 }, threads: [{ id: "529981234567", messages: [] }] }] });
    const contactos = cambio("smb_app_state_sync", { state_sync: [{ type: "contact", action: "add" }, { type: "contact", action: "add" }] });
    expect(resumenSincronizacion(historial)).toEqual([{ campo: "history", elementos: 1 }]);
    expect(resumenSincronizacion(contactos)).toEqual([{ campo: "smb_app_state_sync", elementos: 2 }]);
    expect(parseEcosApp(historial)).toEqual([]);
  });
});

describe("handleEcoApp", () => {
  const eco = { id: "wamid.ECO1", to: "529981234567", texto: "Hola, soy Karla de TVS", tipoOriginal: "text" };

  it("guarda el mensaje como del equipo y pasa el chat a «Yo»", async () => {
    await handleEcoApp(eco, 0);
    expect(clientes.findOrCreateByPhone).toHaveBeenCalledWith("529981234567");
    expect(mensajes.guardarMensaje).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacionId: "conv-1",
        rol: "humano",
        contenido: "Hola, soy Karla de TVS",
        externalId: "wamid.ECO1",
        metadata: { via: "whatsapp_business_app" },
      }),
    );
    expect(conversaciones.pasarAPersona).toHaveBeenCalledWith("conv-1");
  });

  it("no hace nada si el mensaje ya estaba (lo mandó el panel o el bot)", async () => {
    mensajes.existeExternalId.mockResolvedValue(true);
    await handleEcoApp(eco, 0);
    expect(mensajes.guardarMensaje).not.toHaveBeenCalled();
    expect(conversaciones.pasarAPersona).not.toHaveBeenCalled();
  });

  it("si el panel lo guarda durante la espera, tampoco lo duplica", async () => {
    mensajes.existeExternalId.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await handleEcoApp(eco, 0);
    expect(mensajes.guardarMensaje).not.toHaveBeenCalled();
  });

  it("guarda el archivo y su pie", async () => {
    await handleEcoApp({
      id: "wamid.F",
      to: "529981234567",
      texto: "La RTR 160 en negro",
      tipoOriginal: "image",
      media: { tipo: "image", mediaId: "MEDIA1", mimeType: "image/jpeg" },
    }, 0);
    expect(whatsapp.descargarMedia).toHaveBeenCalledWith("MEDIA1");
    expect(mensajes.guardarMensaje).toHaveBeenCalledWith(
      expect.objectContaining({ contenido: "La RTR 160 en negro", mediaPath: "conv-1/1.jpg", mediaType: "image" }),
    );
  });

  it("si el archivo no baja, conserva el mensaje con un marcador", async () => {
    whatsapp.descargarMedia.mockRejectedValueOnce(new Error("404"));
    await handleEcoApp({ id: "wamid.F2", to: "529981234567", texto: null, tipoOriginal: "image", media: { tipo: "image", mediaId: "M", mimeType: "image/jpeg" } }, 0);
    const llamada = mensajes.guardarMensaje.mock.calls[0]![0] as Record<string, unknown>;
    expect(llamada.contenido).toBe("[Imagen]");
    expect(llamada.mediaPath).toBeUndefined();
    expect(llamada.metadata).toMatchObject({ via: "whatsapp_business_app", error_descarga: "no se pudo descargar" });
  });

  it("un aviso repetido que choca con el índice único se ignora", async () => {
    mensajes.guardarMensaje.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    await expect(handleEcoApp(eco, 0)).resolves.toBeUndefined();
    expect(conversaciones.pasarAPersona).not.toHaveBeenCalled();
  });
});
