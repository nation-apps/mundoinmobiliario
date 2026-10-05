import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Con el ritmo humano encendido: la respuesta no sale al instante, "escribiendo…" sale de inmediato y la primera
// respuesta de una conversación es más rápida que las siguientes. Reloj simulado: no espera de verdad.
const enviarTexto = vi.fn(async () => ({ externalId: "wamid.out" }));
const indicarEscribiendo = vi.fn(async () => {});
const guardarMensaje = vi.fn(async () => ({ id: "m1" }));
const getHistorialReciente = vi.fn(async () => [] as { rol: string; contenido: string }[]);
const runAgent = vi.fn(async () => "x".repeat(150));
const hayMensajeNuevoDeLaPersona = vi.fn(async () => false);
const clienteAnulado = vi.fn(async () => false);

vi.mock("../src/config/env.js", () => ({ env: { RITMO_HUMANO: true, RITMO_FACTOR: 1, LOG_LEVEL: "silent" } }));
vi.mock("../src/agent/flujoConversacion.js", () => ({
  buscarRespuestaDeFlujo: vi.fn(async () => null),
  enviarQrYapeDelFlujo: vi.fn(async () => {}),
  registrarEntradaDelFlujo: vi.fn(async () => {}),
}));
vi.mock("../src/db/repositories/etiquetas.js", () => ({
  clienteAnulado,
  clientesAnulados: vi.fn(async () => new Set<string>()),
}));
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../src/db/repositories/conversaciones.js", () => ({ escalarConversacion: vi.fn() }));
vi.mock("../src/db/repositories/mensajes.js", () => ({ guardarMensaje, getHistorialReciente, fueEntregado: (m: { rol: string; error_entrega?: string | null }) => m.rol === "user" || !m.error_entrega, hayMensajeNuevoDeLaPersona }));
vi.mock("../src/db/repositories/canales.js", () => ({ getCanalConfig: vi.fn(async () => ({ activo: true, ia_activa: true })) }));
vi.mock("../src/lib/porConversacion.js", () => ({ enCola: (_id: string, fn: () => Promise<void>) => fn() }));
vi.mock("../src/canales/index.js", () => ({ getCanalAdapter: () => ({ canal: "whatsapp", enviarTexto, indicarEscribiendo }) }));
vi.mock("../src/agent/runner.js", () => ({ FALLBACK_MESSAGE: "Disculpa, tuve un problema", runAgent }));

const { handleInbound } = await import("../src/agent/handleInbound.js");

const entrante = {
  conversacion: { id: "c1", cliente_id: "k1", estado: "activa" },
  canal: "whatsapp",
  destinatarioId: "51900000001",
  telefono: "51900000001",
  contactName: undefined,
  texto: "Hola, ¿cuánto cuesta?",
  externalId: "wamid.in",
} as unknown as Parameters<typeof handleInbound>[0];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  getHistorialReciente.mockResolvedValue([]);
  hayMensajeNuevoDeLaPersona.mockResolvedValue(false);
  clienteAnulado.mockResolvedValue(false);
});
afterEach(() => vi.useRealTimers());

describe("ritmo humano en handleInbound", () => {
  it("muestra 'escribiendo…' enseguida y envía la primera respuesta entre 6 y 8 s", async () => {
    const p = handleInbound(entrante);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(indicarEscribiendo).toHaveBeenCalledWith("wamid.in");
    expect(enviarTexto).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000); // 6 s en total: aún puede faltar
    await vi.advanceTimersByTimeAsync(2_100); // 8,1 s: ya salió
    await p;
    expect(enviarTexto).toHaveBeenCalledOnce();
  });

  it("si ya hubo respuestas del bot, la pausa es la normal (8 a 15 s), no la rápida", async () => {
    getHistorialReciente.mockResolvedValue([
      { rol: "user", contenido: "Hola" },
      { rol: "assistant", contenido: "¡Hola!" },
    ]);
    const p = handleInbound(entrante);
    await vi.advanceTimersByTimeAsync(7_900);
    expect(enviarTexto).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(7_200); // 15,1 s
    await p;
    expect(enviarTexto).toHaveBeenCalledOnce();
  });

  it("si 'escribiendo…' falla, igual responde", async () => {
    indicarEscribiendo.mockRejectedValueOnce(new Error("Meta no lo acepta"));
    const p = handleInbound(entrante);
    await vi.advanceTimersByTimeAsync(8_100);
    await p;
    expect(enviarTexto).toHaveBeenCalledOnce();
  });

  it("el mensaje de falla no se retrasa", async () => {
    runAgent.mockResolvedValueOnce("Disculpa, tuve un problema");
    const p = handleInbound(entrante);
    await vi.advanceTimersByTimeAsync(1_700); // solo la espera para juntar mensajes, sin pausa de ritmo
    await p;
    expect(enviarTexto).toHaveBeenCalledOnce();
  });

  it("si llega otro mensaje enseguida, este turno no responde (contesta el último, una sola vez)", async () => {
    hayMensajeNuevoDeLaPersona.mockResolvedValue(true);
    const p = handleInbound(entrante);
    await vi.advanceTimersByTimeAsync(20_000);
    await p;
    expect(runAgent).not.toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it("si escribe de nuevo mientras se preparaba la respuesta, se descarta y no se envía", async () => {
    hayMensajeNuevoDeLaPersona.mockResolvedValueOnce(false).mockResolvedValue(true);
    const p = handleInbound(entrante);
    await vi.advanceTimersByTimeAsync(20_000);
    await p;
    expect(runAgent).toHaveBeenCalledOnce();
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it("la respuesta automática de otro negocio se guarda pero no se contesta (no hay bot hablándole a bot)", async () => {
    const p = handleInbound({ ...entrante, texto: "Gracias por comunicarte con agathaskids.pe en breve te respondemos" } as typeof entrante);
    await vi.advanceTimersByTimeAsync(20_000);
    await p;
    expect(guardarMensaje).toHaveBeenCalledOnce();
    expect(runAgent).not.toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
  });

  it("un contacto con la etiqueta «Anulado» queda guardado en el panel, pero el bot no contesta ni muestra 'escribiendo…'", async () => {
    clienteAnulado.mockResolvedValue(true);
    const p = handleInbound(entrante);
    await vi.advanceTimersByTimeAsync(20_000);
    await p;
    expect(guardarMensaje).toHaveBeenCalledOnce();
    expect(indicarEscribiendo).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    expect(enviarTexto).not.toHaveBeenCalled();
  });
});
