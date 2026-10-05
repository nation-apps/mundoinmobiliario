import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Un envío que se pierde por un error de red dejó a una clienta sin su primera respuesta. Ahora se reintenta.
vi.mock("../src/config/env.js", () => ({
  env: { META_GRAPH_VERSION: "v26.0", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ACCESS_TOKEN: "token", LOG_LEVEL: "silent" },
}));
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { sendText } = await import("../src/whatsapp/client.js");

const ok = (id = "wamid.ok") => ({ ok: true, status: 200, json: async () => ({ messages: [{ id }] }), text: async () => "" });
const falla = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => "error de prueba" });

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("envío de WhatsApp con reintentos", () => {
  it("si la conexión cae una vez ('fetch failed'), reintenta y el mensaje sale", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok("wamid.2"));
    const p = sendText("51900000001", "Hola");
    await vi.advanceTimersByTimeAsync(700);
    await expect(p).resolves.toBe("wamid.2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reintenta hasta 3 veces en total y después se rinde con el error original", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const p = sendText("51900000001", "Hola");
    const resultado = expect(p).rejects.toThrow("fetch failed");
    await vi.advanceTimersByTimeAsync(5_000);
    await resultado;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("un 429 (demasiadas peticiones) también se reintenta", async () => {
    fetchMock.mockResolvedValueOnce(falla(429)).mockResolvedValueOnce(ok("wamid.3"));
    const p = sendText("51900000001", "Hola");
    await vi.advanceTimersByTimeAsync(700);
    await expect(p).resolves.toBe("wamid.3");
  });

  it("un rechazo real de Meta (400) NO se reintenta: reintentar no lo arregla", async () => {
    fetchMock.mockResolvedValue(falla(400));
    await expect(sendText("51900000001", "Hola")).rejects.toThrow("No se pudo enviar el mensaje de WhatsApp");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un 500 tampoco se reintenta: Meta pudo haber recibido el mensaje y se duplicaría", async () => {
    fetchMock.mockResolvedValue(falla(500));
    await expect(sendText("51900000001", "Hola")).rejects.toThrow("No se pudo enviar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
