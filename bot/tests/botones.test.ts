import { beforeEach, describe, expect, it, vi } from "vitest";

// handleInbound y las tools importan config/env y la base: se simulan, como en los demás tests.
const guardarMensaje = vi.fn(async () => ({ id: "m1" }));
const enviarTexto = vi.fn();
const enviarBotones = vi.fn();
let botonesDelTurno: string[] | undefined;
let respuestaDelAgente = "¿La separamos hoy con S/ 200?";

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
vi.mock("../src/db/repositories/mensajes.js", () => ({ guardarMensaje, getHistorialReciente: vi.fn(async () => []), fueEntregado: () => true, hayMensajeNuevoDeLaPersona: vi.fn(async () => false) }));
vi.mock("../src/db/repositories/canales.js", () => ({ getCanalConfig: vi.fn(async () => ({ activo: true, ia_activa: true })) }));
vi.mock("../src/lib/porConversacion.js", () => ({ enCola: (_id: string, fn: () => Promise<void>) => fn() }));
vi.mock("../src/canales/index.js", () => ({ getCanalAdapter: () => ({ canal: "whatsapp", enviarTexto, enviarBotones }) }));
vi.mock("../src/agent/runner.js", () => ({
  FALLBACK_MESSAGE: "Disculpa, tuve un problema",
  runAgent: vi.fn(async (ctx: { botones?: string[] }) => {
    if (botonesDelTurno) ctx.botones = botonesDelTurno;
    return respuestaDelAgente;
  }),
}));

const { handleInbound } = await import("../src/agent/handleInbound.js");
const { extraerBotones } = await import("../src/lib/botones.js");

const params = {
  conversacion: { id: "c1", cliente_id: "k1", estado: "activa" },
  canal: "whatsapp",
  destinatarioId: "51900000001",
  telefono: "51900000001",
  contactName: undefined,
  texto: "Hola",
  externalId: "wamid.1",
} as unknown as Parameters<typeof handleInbound>[0];

beforeEach(() => {
  vi.clearAllMocks();
  botonesDelTurno = undefined;
  respuestaDelAgente = "¿La separamos hoy con S/ 200?";
  enviarTexto.mockResolvedValue({ externalId: "wamid.texto" });
  enviarBotones.mockResolvedValue({ externalId: "wamid.botones" });
});

describe("respuesta con botones", () => {
  it("si el asesor pidió botones, el mensaje sale con ellos y no como texto suelto", async () => {
    botonesDelTurno = ["Sí, separarla", "Tengo una duda"];
    await handleInbound(params);
    expect(enviarBotones).toHaveBeenCalledOnce();
    expect(enviarBotones.mock.calls[0]![0]).toMatchObject({
      texto: "¿La separamos hoy con S/ 200?",
      opciones: ["Sí, separarla", "Tengo una duda"],
    });
    expect(enviarTexto).not.toHaveBeenCalled();
    // Lo que se guarda en el chat lleva los botones en metadata, para el panel y para el historial.
    const guardado = guardarMensaje.mock.calls.find((c) => (c[0] as { rol: string }).rol === "assistant")![0] as { metadata?: unknown };
    expect(guardado.metadata).toEqual({ botones: ["Sí, separarla", "Tengo una duda"] });
  });

  it("sin botones pedidos, sale texto normal", async () => {
    await handleInbound(params);
    expect(enviarTexto).toHaveBeenCalledOnce();
    expect(enviarBotones).not.toHaveBeenCalled();
  });

  it("si Meta rechaza el mensaje con botones, la persona recibe igual la respuesta en texto", async () => {
    botonesDelTurno = ["Yape", "Transferencia"];
    enviarBotones.mockRejectedValueOnce(new Error("131009 parámetro inválido"));
    await handleInbound(params);
    expect(enviarTexto).toHaveBeenCalledOnce();
    const guardado = guardarMensaje.mock.calls.find((c) => (c[0] as { rol: string }).rol === "assistant")![0] as { errorEntrega?: string };
    expect(guardado.errorEntrega).toBeUndefined(); // llegó, aunque sin botones
  });

  it("el mensaje de falla nunca lleva botones", async () => {
    botonesDelTurno = ["Sí, separarla", "Tengo una duda"];
    respuestaDelAgente = "Disculpa, tuve un problema";
    await handleInbound(params);
    expect(enviarBotones).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
  });

  it("un solo botón no es una elección: sale como texto", async () => {
    botonesDelTurno = ["Sí"];
    await handleInbound(params);
    expect(enviarBotones).not.toHaveBeenCalled();
    expect(enviarTexto).toHaveBeenCalledOnce();
  });
});

describe("marca [[botones: ...]] en el texto del asesor", () => {
  it("se quita del mensaje y queda como botones", () => {
    const r = extraerBotones("¿Cómo prefieres pagar?\n[[botones: Yape | Transferencia]]");
    expect(r.texto).toBe("¿Cómo prefieres pagar?");
    expect(r.botones).toEqual(["Yape", "Transferencia"]);
  });

  it("acepta hasta 3 opciones y separa también con puntos medios", () => {
    expect(extraerBotones("¿A qué te dedicas?\n[[botones: Maquilladora · Estilista · Recién empiezo · Otra]]").botones).toEqual([
      "Maquilladora",
      "Estilista",
      "Recién empiezo",
    ]);
  });

  it("descarta títulos de más de 20 caracteres y no deja un solo botón", () => {
    expect(extraerBotones("Hola\n[[botones: Este título es demasiado largo | Sí]]").botones).toBeNull();
    expect(extraerBotones("Hola\n[[botones: Sí, separarla | Ver la otra entrada]]").botones).toEqual(["Sí, separarla", "Ver la otra entrada"]);
  });

  it("sin marca, el texto no cambia", () => {
    expect(extraerBotones("Hola, ¿cómo estás?")).toEqual({ texto: "Hola, ¿cómo estás?", botones: null });
  });

  it("una marca mal escrita o cortada igual se quita: la clienta nunca ve corchetes", () => {
    expect(extraerBotones("¿Te animas?\n[[botones: Sí | No").texto).toBe("¿Te animas?");
    expect(extraerBotones("¿Te animas?\n[[botones: ]]").texto).toBe("¿Te animas?");
    expect(extraerBotones("¿Te animas?\n[[BOTONES: Sí | No]]").botones).toEqual(["Sí", "No"]);
  });

  it("si la marca va en medio del texto, también se extrae", () => {
    const r = extraerBotones("Mira esto [[botones: Sí | No]] y dime");
    expect(r.texto).not.toContain("[[");
    expect(r.botones).toEqual(["Sí", "No"]);
  });
});
