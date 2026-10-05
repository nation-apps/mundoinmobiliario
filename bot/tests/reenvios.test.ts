import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({ env: { LOG_LEVEL: "silent", REENVIOS_ACTIVOS: true }, whatsappConfigurado: true }));
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../src/db/repositories/mensajes.js", () => ({
  hayMensajesPosteriores: vi.fn(),
  listarRespuestasSinEntregar: vi.fn(),
  registrarReenvio: vi.fn(),
}));
vi.mock("../src/canales/whatsapp.js", () => ({ whatsappAdapter: {} }));

const { proximoReenvio, reintentarEntregas, MAX_REENVIOS } = await import("../src/seguimientos/reenvios.js");

const MIN = 60_000;
const t0 = new Date("2026-10-04T15:00:00Z");
const despues = (min: number) => new Date(t0.getTime() + min * MIN);

describe("cuándo se reenvía una respuesta que no llegó", () => {
  const caso = (reintentos: number, ultimo: Date | null, ahora: Date) => proximoReenvio({ creadoAt: t0, reintentos, ultimoReintentoAt: ultimo, ahora });

  it("el primer reenvío espera 2 minutos desde el fallo", () => {
    expect(caso(0, null, despues(1))).toBe("esperar");
    expect(caso(0, null, despues(2))).toBe("ahora");
  });
  it("el segundo, 10 minutos después del primero; el tercero, 30 después del segundo", () => {
    expect(caso(1, despues(2), despues(11))).toBe("esperar");
    expect(caso(1, despues(2), despues(12))).toBe("ahora");
    expect(caso(2, despues(12), despues(41))).toBe("esperar");
    expect(caso(2, despues(12), despues(42))).toBe("ahora");
  });
  it("después de 3 intentos se rinde", () => {
    expect(caso(MAX_REENVIOS, despues(42), despues(500))).toBe("agotado");
  });
  it("pasadas 3 horas desde el fallo, la respuesta ya quedó vieja", () => {
    expect(caso(0, null, despues(181))).toBe("agotado");
  });
});

const respuesta = (extra: Record<string, unknown> = {}) => ({
  id: "m1",
  conversacionId: "c1",
  contenido: "¡Hola! Te cuento del evento…",
  creadoAt: t0.toISOString(),
  metadata: { ...extra },
  telefono: "51900000001",
  ultimoMensajeAt: t0.toISOString(),
});

function deps(over: Partial<Parameters<typeof reintentarEntregas>[1]> = {}) {
  return {
    listar: vi.fn(async () => [respuesta()]),
    hayPosteriores: vi.fn(async () => false),
    enviar: vi.fn(async () => ({ externalId: "wamid.nuevo" })),
    registrar: vi.fn(async () => {}),
    ...over,
  };
}

describe("reintentarEntregas", () => {
  it("reenvía a los 2 minutos y deja el mensaje como entregado", async () => {
    const d = deps();
    const r = await reintentarEntregas(despues(2), d);
    expect(r.reenviadas).toBe(1);
    expect(d.enviar).toHaveBeenCalledOnce();
    const [id, cambios] = d.registrar.mock.calls[0] as unknown as [string, { externalId?: string; metadata: Record<string, unknown> }];
    expect(id).toBe("m1");
    expect(cambios.externalId).toBe("wamid.nuevo");
    expect(cambios.metadata.reintentos).toBe(1);
  });

  it("antes de tiempo no hace nada", async () => {
    const d = deps();
    await reintentarEntregas(despues(1), d);
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it("si la clienta o alguien escribió después, la respuesta vieja se descarta (no se reenvía)", async () => {
    const d = deps({ hayPosteriores: vi.fn(async () => true) });
    const r = await reintentarEntregas(despues(2), d);
    expect(d.enviar).not.toHaveBeenCalled();
    expect(r.reenviadas).toBe(0);
    const [, cambios] = d.registrar.mock.calls[0] as unknown as [string, { metadata: Record<string, unknown> }];
    expect(cambios.metadata.reintentos).toBe(MAX_REENVIOS);
  });

  it("conserva los botones del mensaje original", async () => {
    const d = deps({ listar: vi.fn(async () => [respuesta({ botones: ["Sí, me pasa", "A veces", "No"] })]) });
    await reintentarEntregas(despues(2), d);
    expect(d.enviar.mock.calls[0]![1]).toEqual(["Sí, me pasa", "A veces", "No"]);
  });

  it("sin botones en el original, sale como texto", async () => {
    const d = deps();
    await reintentarEntregas(despues(2), d);
    expect(d.enviar.mock.calls[0]![1]).toBeNull();
  });

  it("si el envío vuelve a fallar, anota el intento y lo reintenta más tarde", async () => {
    const d = deps({ enviar: vi.fn(async () => { throw new Error("fetch failed"); }) });
    const r = await reintentarEntregas(despues(2), d);
    expect(r.falladas).toBe(1);
    const [, cambios] = d.registrar.mock.calls[0] as unknown as [string, { externalId?: string; metadata: Record<string, unknown> }];
    expect(cambios.externalId).toBeUndefined();
    expect(cambios.metadata.reintentos).toBe(1);
    expect(typeof cambios.metadata.ultimo_reintento_at).toBe("string");
  });

  it("si el canal dice que no se puede (ventana cerrada), deja de intentar", async () => {
    const d = deps({ enviar: vi.fn(async () => ({ externalId: null, motivoCierre: "Pasaron más de 24 horas" })) });
    await reintentarEntregas(despues(2), d);
    const [, cambios] = d.registrar.mock.calls[0] as unknown as [string, { nuevoError?: string; metadata: Record<string, unknown> }];
    expect(cambios.metadata.reintentos).toBe(MAX_REENVIOS);
    expect(cambios.nuevoError).toMatch(/24 horas/);
  });
});
