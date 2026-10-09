import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config/env.js", () => ({ env: { META_PAGE_ID: "PAGE_ID_TEST" } }));

const clientes = { registrarLeadWeb: vi.fn() };
const conversaciones = { getOrCreateConversacionAbierta: vi.fn() };
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
  formulario: "Seminario gratuito",
  anuncio: "Video Luis",
  campana: null,
  plataforma: "ig",
  esOrganico: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  metaClient.obtenerLead.mockResolvedValue(lead);
  clientes.registrarLeadWeb.mockResolvedValue({ id: "cliente-1" });
  conversaciones.getOrCreateConversacionAbierta.mockResolvedValue({ id: "conv-1" });
  mensajes.guardarMensaje.mockResolvedValue({ id: "msg-1" });
});

describe("handleLeadFormulario", () => {
  it("registra al lead y lo deja en su propio hilo de formulario de anuncio", async () => {
    await handleLeadFormulario(evento);

    expect(metaClient.obtenerLead).toHaveBeenCalledWith("444", "555");
    expect(clientes.registrarLeadWeb).toHaveBeenCalledWith({ telefono: "525512345678", nombre: "Ana López", email: undefined });
    expect(conversaciones.getOrCreateConversacionAbierta).toHaveBeenCalledWith({
      clienteId: "cliente-1",
      canal: "web",
      origen: "formulario",
      hiloExterno: "facebook_lead_ads",
      cuentaId: "PAGE_ID_TEST",
    });
    expect(mensajes.guardarMensaje).toHaveBeenCalledWith(
      expect.objectContaining({
        conversacionId: "conv-1",
        rol: "user",
        externalId: "leadgen:444",
        contenido: "Nombre: Ana López\nTeléfono: +525512345678",
        metadata: expect.objectContaining({
          origen: "facebook_lead_ads",
          formulario: "Seminario gratuito",
          anuncio: "Video Luis",
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
});
