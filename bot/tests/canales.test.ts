import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({
  env: { LOG_LEVEL: "silent", META_GRAPH_VERSION: "v26.0", META_HUMAN_AGENT_APROBADO: false },
}));
vi.mock("../src/db/client.js", () => ({ supabase: {} }));

const sendText = vi.fn();
vi.mock("../src/whatsapp/client.js", () => ({ sendText, sendMedia: vi.fn() }));
const enviarTextoMeta = vi.fn();
vi.mock("../src/meta/client.js", () => ({ enviarTexto: enviarTextoMeta, enviarAdjunto: vi.fn() }));

const { getCanalAdapter } = await import("../src/canales/index.js");

describe("getCanalAdapter — canales sin respuesta directa", () => {
  it("web: nunca llama a ninguna API y explica que se responde por WhatsApp", async () => {
    const r = await getCanalAdapter("web").enviarTexto({
      destinatarioId: "51987654321",
      texto: "Hola",
      rol: "humano",
      ultimoMensajeAt: new Date().toISOString(),
    });
    expect(r.externalId).toBeNull();
    expect(r.motivoCierre).toContain("formulario del sitio web");
    expect(r.motivoCierre).toContain("WhatsApp");
    expect(sendText).not.toHaveBeenCalled();
    expect(enviarTextoMeta).not.toHaveBeenCalled();
  });

  it("tiktok: los DMs no se envían (TikTok no está conectado al bot de B&B) y lo dice", async () => {
    const adapter = getCanalAdapter("tiktok");
    expect(adapter.canal).toBe("tiktok");
    const r = await adapter.enviarMedia({
      destinatarioId: "tt_1",
      tipo: "image",
      url: "https://example.com/a.png",
      rol: "assistant",
      ultimoMensajeAt: new Date().toISOString(),
    });
    expect(r).toEqual({ externalId: null, motivoCierre: expect.stringContaining("TikTok") });
    expect(r.motivoCierre).toContain("no está conectado");
  });

  it("los canales existentes siguen con su adapter real", () => {
    expect(getCanalAdapter("whatsapp").canal).toBe("whatsapp");
    expect(getCanalAdapter("messenger").canal).toBe("messenger");
    expect(getCanalAdapter("instagram").canal).toBe("instagram");
  });
});
