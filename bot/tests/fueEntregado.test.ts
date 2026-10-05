import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({ env: { LOG_LEVEL: "silent" } }));
vi.mock("../src/db/client.js", () => ({ supabase: {} }));

const { fueEntregado } = await import("../src/db/repositories/mensajes.js");

describe("fueEntregado: lo que la persona llegó a recibir", () => {
  it("sus propios mensajes siempre cuentan", () => {
    expect(fueEntregado({ rol: "user", error_entrega: null })).toBe(true);
  });
  it("una respuesta del bot enviada con éxito cuenta", () => {
    expect(fueEntregado({ rol: "assistant", error_entrega: null })).toBe(true);
  });
  it("una respuesta del bot o del equipo que falló al enviarse NO cuenta", () => {
    expect(fueEntregado({ rol: "assistant", error_entrega: "fetch failed" })).toBe(false);
    expect(fueEntregado({ rol: "humano", error_entrega: "ventana cerrada" })).toBe(false);
  });
});
