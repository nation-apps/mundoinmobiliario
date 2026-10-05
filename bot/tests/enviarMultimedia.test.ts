import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMedia = vi.fn(async () => "wamid.img");
const yaSeEnvio = vi.fn();
vi.mock("../src/config/env.js", () => ({ env: { LOG_LEVEL: "silent" } }));
vi.mock("../src/db/client.js", () => ({ supabase: {} }));
vi.mock("../src/db/repositories/plantillasMedia.js", () => ({
  getPlantillaById: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", nombre: "QR de Yape", tipo: "image", storage_path: "qr.png", caption: "Yape", activo: true })),
  urlPublicaPlantilla: (p: string) => `https://x.supabase.co/storage/v1/object/public/plantillas-media/${p}`,
}));
vi.mock("../src/db/repositories/mensajes.js", () => ({ guardarMensaje: vi.fn(async () => ({ id: "m" })), yaSeEnvioMedia: yaSeEnvio }));
vi.mock("../src/whatsapp/window.js", () => ({ sendMediaIfWindowOpen: sendMedia }));

const { enviarMultimediaTool } = await import("../src/agent/tools/enviarMultimedia.js");
const ctx = { canal: "whatsapp", conversacionId: "c1", clienteId: "k1", telefono: "51900000001", contactName: undefined } as never;
const input = { plantilla_id: "11111111-1111-4111-8111-111111111111" };

beforeEach(() => vi.clearAllMocks());

describe("enviar_multimedia", () => {
  it("la primera vez manda el archivo", async () => {
    yaSeEnvio.mockResolvedValue(false);
    const r = (await enviarMultimediaTool.handler(input, ctx)) as { ok: boolean };
    expect(r.ok).toBe(true);
    expect(sendMedia).toHaveBeenCalledOnce();
  });

  it("no reenvía el mismo archivo a la misma persona", async () => {
    yaSeEnvio.mockResolvedValue(true);
    const r = (await enviarMultimediaTool.handler(input, ctx)) as { ok: boolean; ya_enviada?: boolean };
    expect(r).toMatchObject({ ok: true, ya_enviada: true });
    expect(sendMedia).not.toHaveBeenCalled();
  });
});
