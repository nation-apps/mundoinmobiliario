import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El número de prueba de Meta guarda los móviles mexicanos como 521 + 10 dígitos y rechaza 52 + 10 con el error 131030.
vi.mock("../src/config/env.js", () => ({
  env: { META_GRAPH_VERSION: "v26.0", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ACCESS_TOKEN: "token", LOG_LEVEL: "silent" },
}));
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { sendText } = await import("../src/whatsapp/client.js");

const ok = (id = "wamid.ok") => ({ ok: true, status: 200, json: async () => ({ messages: [{ id }] }), text: async () => "" });
const noPermitido = () => ({
  ok: false,
  status: 400,
  json: async () => ({}),
  text: async () => JSON.stringify({ error: { code: 131030, message: "Recipient phone number not in allowed list" } }),
});
const otroError = () => ({ ok: false, status: 400, json: async () => ({}), text: async () => JSON.stringify({ error: { code: 100 } }) });

const destinoDeLaLlamada = (fetchMock: ReturnType<typeof vi.fn>, n: number) =>
  (JSON.parse((fetchMock.mock.calls[n]![1] as { body: string }).body) as { to: string }).to;

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("envío a móviles mexicanos", () => {
  it("si Meta rechaza 52+10 con 131030, reintenta con 521+10 y el mensaje sale", async () => {
    fetchMock.mockResolvedValueOnce(noPermitido()).mockResolvedValueOnce(ok("wamid.mx"));
    await expect(sendText("525512345601", "Hola")).resolves.toBe("wamid.mx");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(destinoDeLaLlamada(fetchMock, 0)).toBe("525512345601");
    expect(destinoDeLaLlamada(fetchMock, 1)).toBe("5215512345601");
  });

  it("recuerda el formato que funcionó: el siguiente envío al mismo número va directo con 521", async () => {
    fetchMock.mockResolvedValueOnce(noPermitido()).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok("wamid.2"));
    await sendText("525512345602", "Uno");
    await sendText("525512345602", "Dos");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(destinoDeLaLlamada(fetchMock, 2)).toBe("5215512345602");
  });

  it("si con 521 también falla, no se queda con el formato y se rinde sin ciclos", async () => {
    fetchMock.mockResolvedValue(noPermitido());
    await expect(sendText("525512345603", "Hola")).rejects.toThrow("No se pudo enviar");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(noPermitido());
    await expect(sendText("525512345603", "Hola")).rejects.toThrow("No se pudo enviar");
    expect(destinoDeLaLlamada(fetchMock, 0)).toBe("525512345603");
  });

  it("otros errores de Meta no provocan el reintento con 521", async () => {
    fetchMock.mockResolvedValue(otroError());
    await expect(sendText("525512345604", "Hola")).rejects.toThrow("No se pudo enviar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("los números de otros países no se tocan", async () => {
    fetchMock.mockResolvedValue(noPermitido());
    await expect(sendText("51900000001", "Hola")).rejects.toThrow("No se pudo enviar");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(destinoDeLaLlamada(fetchMock, 0)).toBe("51900000001");
  });
});
