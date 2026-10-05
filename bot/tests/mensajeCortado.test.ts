import { beforeEach, describe, expect, it, vi } from "vitest";

const runAgent = vi.fn(async () => "Respuesta del modelo");
const enviarTexto = vi.fn(async () => ({ externalId: "wamid.1" }));
const guardarMensaje = vi.fn(async () => ({ id: "m1" }));
const getHistorialReciente = vi.fn(async () => [] as { rol: string; contenido: string }[]);

vi.mock("../src/config/env.js", () => ({ env: { RITMO_HUMANO: false, RITMO_FACTOR: 1, LOG_LEVEL: "silent" } }));
vi.mock("../src/agent/flujoConversacion.js", () => ({
  buscarRespuestaDeFlujo: vi.fn(async () => null),
  enviarQrYapeDelFlujo: vi.fn(async () => {}),
  registrarEntradaDelFlujo: vi.fn(async () => {}),
}));
vi.mock("../src/db/repositories/etiquetas.js", () => ({
  clienteAnulado: vi.fn(async () => false),
  clientesAnulados: vi.fn(async () => new Set<string>()),
}));
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/db/repositories/conversaciones.js", () => ({ escalarConversacion: vi.fn() }));
vi.mock("../src/db/repositories/mensajes.js", () => ({ guardarMensaje, getHistorialReciente, fueEntregado: () => true, hayMensajeNuevoDeLaPersona: vi.fn(async () => false) }));
vi.mock("../src/db/repositories/canales.js", () => ({ getCanalConfig: vi.fn(async () => ({ activo: true, ia_activa: true })) }));
vi.mock("../src/lib/porConversacion.js", () => ({ enCola: (_id: string, fn: () => Promise<void>) => fn() }));
vi.mock("../src/canales/index.js", () => ({ getCanalAdapter: () => ({ canal: "whatsapp", enviarTexto }) }));
vi.mock("../src/agent/runner.js", () => ({ FALLBACK_MESSAGE: "Disculpa, tuve un problema", runAgent }));

const { esMensajeCortado, RESPUESTA_MENSAJE_CORTADO } = await import("../src/agent/mensajeCortado.js");
const { handleInbound } = await import("../src/agent/handleInbound.js");

const entrante = (texto: string) =>
  ({
    conversacion: { id: "c1", cliente_id: "k1", estado: "activa" },
    canal: "whatsapp",
    destinatarioId: "51900000001",
    telefono: "51900000001",
    contactName: undefined,
    texto,
    externalId: "wamid.in",
  }) as unknown as Parameters<typeof handleInbound>[0];

describe("esMensajeCortado", () => {
  it.each(["H", "h", "Ho", "Hol", "q", " ho "])("%j es un fragmento", (t) => expect(esMensajeCortado(t)).toBe(true));

  it.each(["Sí", "si", "No", "ok", "ya", "ja", "hi", "ola", "vip", "Hola", "precio", "👍", "?", "1", "499", "", "   ", "h o"])(
    "%j NO es un fragmento (va al modelo)",
    (t) => expect(esMensajeCortado(t)).toBe(false),
  );

  it("con el contexto del anuncio pegado, el modelo sí tiene qué contestar", () => {
    expect(esMensajeCortado('H\n\n(Llegó desde un anuncio de Meta: "Star Beauty · Entradas desde S/ 499")')).toBe(false);
  });
});

describe("handleInbound con un fragmento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHistorialReciente.mockResolvedValue([]);
  });

  it("responde con el texto fijo y no llama al modelo", async () => {
    await handleInbound(entrante("H"));
    expect(runAgent).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect((enviarTexto.mock.calls[0] as unknown as [{ texto: string }])[0].texto).toBe(RESPUESTA_MENSAJE_CORTADO);
    // Queda guardado en el chat como cualquier respuesta del bot.
    expect(guardarMensaje.mock.calls.some((c) => (c[0] as { rol: string; contenido: string }).contenido === RESPUESTA_MENSAJE_CORTADO)).toBe(true);
  });

  it("si ya se le mandó ese aviso y vuelve a mandar otro fragmento, interviene el modelo", async () => {
    getHistorialReciente.mockResolvedValue([
      { rol: "user", contenido: "H" },
      { rol: "assistant", contenido: RESPUESTA_MENSAJE_CORTADO },
    ]);
    await handleInbound(entrante("Ho"));
    expect(runAgent).toHaveBeenCalledOnce();
  });

  it("un mensaje normal va al modelo como siempre", async () => {
    await handleInbound(entrante("Hola, ¿cuánto cuesta?"));
    expect(runAgent).toHaveBeenCalledOnce();
  });

  it("'Sí' y 'ok' también van al modelo", async () => {
    await handleInbound(entrante("Sí"));
    await handleInbound(entrante("ok"));
    expect(runAgent).toHaveBeenCalledTimes(2);
  });
});
