import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config/env.js", () => ({ env: { ESCALATION_PHONE: "529987584160" } }));

const conversaciones = { escalarConversacion: vi.fn() };
const ventana = { sendTextIfWindowOpen: vi.fn() };
vi.mock("../src/db/repositories/conversaciones.js", () => conversaciones);
vi.mock("../src/db/repositories/eventos.js", () => ({ registrarEvento: vi.fn(async () => undefined) }));
vi.mock("../src/whatsapp/window.js", () => ventana);

const { escalarAHumanoTool } = await import("../src/agent/tools/escalarAHumano.js");

const ctx = { canal: "whatsapp" as const, conversacionId: "conv-1", clienteId: "c-1", telefono: "525512345678", contactName: "Ana" };

beforeEach(() => {
  vi.clearAllMocks();
  ventana.sendTextIfWindowOpen.mockResolvedValue(undefined);
});

/** El reparto automático asigna cada lead a un vendedor: el aviso al equipo tiene que decir a quién le toca. */
describe("escalar_a_humano con reparto", () => {
  it("el aviso dice a quién está asignada la conversación", async () => {
    conversaciones.escalarConversacion.mockResolvedValue({ asignadaNombre: "Ventas Cancún 2" });
    await escalarAHumanoTool.handler({ motivo: "Quiere cotizar una TVS" }, ctx);
    expect(ventana.sendTextIfWindowOpen).toHaveBeenCalledWith("529987584160", expect.stringContaining("Asignada a: Ventas Cancún 2."));
  });

  it("sin asignación el aviso sale igual, sin esa parte", async () => {
    conversaciones.escalarConversacion.mockResolvedValue({ asignadaNombre: null });
    await escalarAHumanoTool.handler({ motivo: "Pide un asesor" }, ctx);
    const texto = ventana.sendTextIfWindowOpen.mock.calls[0]?.[1] as string;
    expect(texto).not.toContain("Asignada a");
    expect(texto).toContain("Motivo: Pide un asesor");
  });
});
