import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../src/meta/paginas.js", () => ({
  marcaDePagina: (id: string) => (id === "PAGE_ID_TEST" ? "TVS" : null),
  tokenDePagina: (id: string) => (id === "PAGE_ID_TEST" ? "token-de-prueba" : null),
}));

vi.mock("../src/config/env.js", () => ({ env: { LEADS_PRIMER_MENSAJE_TEXTO: undefined } }));
const primerMensaje = { encolarPrimerMensaje: vi.fn(), textoPrimerMensaje: vi.fn(() => "Hola 👋 texto armado") };
vi.mock("../src/agent/primerMensajeLead.js", () => primerMensaje);

const clientes = { registrarLeadWeb: vi.fn() };
const conversaciones = {
  getOrCreateConversacionAbierta: vi.fn(),
  conversacionWhatsappAbierta: vi.fn(),
  actualizarFuenteConversacion: vi.fn(),
};
const staff = { nombreDeStaff: vi.fn() };
vi.mock("../src/db/repositories/staff.js", () => staff);
const mensajes = { guardarMensaje: vi.fn() };
const metaClient = { obtenerLead: vi.fn() };
vi.mock("../src/db/repositories/clientes.js", () => clientes);
vi.mock("../src/db/repositories/conversaciones.js", () => conversaciones);
vi.mock("../src/db/repositories/mensajes.js", () => mensajes);
vi.mock("../src/meta/client.js", () => metaClient);

const { handleLeadFormulario } = await import("../src/agent/handleLeadFormulario.js");

const evento = {
  kind: "lead_formulario" as const,
  canal: "messenger" as const,
  cuentaId: "PAGE_ID_TEST",
  externalId: "leadgen:444",
  remitenteId: null,
  timestamp: new Date(),
  leadgenId: "444",
  formId: "555",
  adId: "666",
};

const lead = {
  id: "444",
  formId: "555",
  adId: "666",
  campos: [
    { name: "full_name", values: ["Ana López"] },
    { name: "phone_number", values: ["+525512345678"] },
  ],
  formulario: "Cotiza tu moto",
  anuncio: "Video moto nueva",
  campana: null,
  plataforma: "ig",
  esOrganico: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  metaClient.obtenerLead.mockResolvedValue(lead);
  clientes.registrarLeadWeb.mockResolvedValue({ id: "cliente-1" });
  conversaciones.getOrCreateConversacionAbierta.mockResolvedValue({ id: "conv-1", asignada_a: "staff-1" });
  conversaciones.conversacionWhatsappAbierta.mockResolvedValue(null);
  conversaciones.actualizarFuenteConversacion.mockResolvedValue(undefined);
  staff.nombreDeStaff.mockResolvedValue("Ventas Cancún 1 - Giovanny");
  mensajes.guardarMensaje.mockResolvedValue({ id: "msg-1" });
});

describe("handleLeadFormulario", () => {
  it("registra al lead y lo deja en su propio hilo de formulario de anuncio", async () => {
    await handleLeadFormulario(evento);

    // Se lee con el token de la página que publicó el formulario.
    expect(metaClient.obtenerLead).toHaveBeenCalledWith("444", "555", "PAGE_ID_TEST");
    expect(clientes.registrarLeadWeb).toHaveBeenCalledWith({ telefono: "525512345678", nombre: "Ana López", email: undefined });
    expect(conversaciones.getOrCreateConversacionAbierta).toHaveBeenCalledWith({
      clienteId: "cliente-1",
      canal: "web",
      origen: "formulario",
      hiloExterno: "facebook_lead_ads",
      cuentaId: "PAGE_ID_TEST",
      // El «origen» que pidió el cliente, con la marca de la página.
      fuente: "Campaña Formulario Meta TVS",
      // La línea de WhatsApp de su marca: por ahí se le escribe y de ella depende el reparto.
      linea: "tvs",
    });
    expect(mensajes.guardarMensaje).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacionId: "conv-1",
        rol: "user",
        externalId: "leadgen:444",
        contenido: "Nombre: Ana López\nTeléfono: +525512345678",
        metadata: expect.objectContaining({
          origen: "facebook_lead_ads",
          marca: "TVS",
          formulario: "Cotiza tu moto",
          anuncio: "Video moto nueva",
          plataforma: "ig",
        }),
      }),
    );
    // Lo que Meta no dio no se guarda como null.
    expect(mensajes.guardarMensaje.mock.calls[0]?.[0].metadata).not.toHaveProperty("campana");
  });

  it("si Meta no deja leer el lead, no registra nada a medias", async () => {
    metaClient.obtenerLead.mockRejectedValue(new Error("(#200) Requires leads_retrieval permission"));
    await expect(handleLeadFormulario(evento)).resolves.toBeUndefined();
    expect(clientes.registrarLeadWeb).not.toHaveBeenCalled();
    expect(mensajes.guardarMensaje).not.toHaveBeenCalled();
  });

  it("un aviso repetido que choca con el external_id ya guardado no es un error", async () => {
    mensajes.guardarMensaje.mockRejectedValue({ code: "23505" });
    await expect(handleLeadFormulario(evento)).resolves.toBeUndefined();
  });

  it("un lead nuevo con teléfono se pone en la cola del primer mensaje, con sus respuestas", async () => {
    await handleLeadFormulario(evento);

    expect(primerMensaje.textoPrimerMensaje).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Ana López", marca: "TVS", campos: lead.campos, asesor: "Ventas Cancún 1 - Giovanny" }),
    );
    expect(primerMensaje.encolarPrimerMensaje).toHaveBeenCalledWith({
      conversacionId: "conv-1",
      clienteId: "cliente-1",
      telefono: "525512345678",
      linea: "tvs",
      texto: "Hola 👋 texto armado",
      leadgenId: "444",
    });
  });

  it("sin teléfono no hay a quién escribirle", async () => {
    metaClient.obtenerLead.mockResolvedValue({ ...lead, campos: [{ name: "full_name", values: ["Ana López"] }] });
    await handleLeadFormulario(evento);
    expect(primerMensaje.encolarPrimerMensaje).not.toHaveBeenCalled();
  });

  it("un lead repetido no recibe un segundo mensaje", async () => {
    mensajes.guardarMensaje.mockRejectedValue({ code: "23505" });
    await handleLeadFormulario(evento);
    expect(primerMensaje.encolarPrimerMensaje).not.toHaveBeenCalled();
  });

  describe("si ya está hablando por WhatsApp", () => {
    const chat = { id: "wa-1", canal: "whatsapp", fuente: "WhatsApp Directo TVS" };

    it("el formulario se suma a ese chat y su origen pasa a ser el del formulario", async () => {
      conversaciones.conversacionWhatsappAbierta.mockResolvedValue(chat);
      await handleLeadFormulario(evento);

      expect(conversaciones.getOrCreateConversacionAbierta).not.toHaveBeenCalled();
      expect(mensajes.guardarMensaje).toHaveBeenCalledWith(expect.objectContaining({ conversacionId: "wa-1", rol: "user" }));
      expect(conversaciones.actualizarFuenteConversacion).toHaveBeenCalledWith("wa-1", "Campaña Formulario Meta TVS");
      expect(primerMensaje.encolarPrimerMensaje).not.toHaveBeenCalled();
    });

    it("si ya venía de una campaña de WhatsApp, esa se respeta", async () => {
      conversaciones.conversacionWhatsappAbierta.mockResolvedValue({ ...chat, fuente: "Campaña WhatsApp Meta TVS" });
      await handleLeadFormulario(evento);
      expect(conversaciones.actualizarFuenteConversacion).not.toHaveBeenCalled();
    });
  });

  it("si no se sabe la marca de la página, no se sabe por qué línea escribirle: no se pone en la cola", async () => {
    metaClient.obtenerLead.mockResolvedValue({ ...lead });
    await handleLeadFormulario({ ...evento, cuentaId: "PAGINA_SIN_MARCA" });
    expect(primerMensaje.encolarPrimerMensaje).not.toHaveBeenCalled();
    expect(conversaciones.getOrCreateConversacionAbierta).toHaveBeenCalledWith(expect.objectContaining({ linea: null }));
  });
});
