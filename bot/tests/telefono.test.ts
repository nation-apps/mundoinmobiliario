import { describe, expect, it } from "vitest";
import { normalizarTelefono, telefonoParaEnvio, variantesTelefono } from "../src/lib/telefono.js";

describe("teléfonos de México", () => {
  it.each([
    ["55 1234 5678", "525512345678"],
    ["5512345678", "525512345678"],
    ["+52 55 1234 5678", "525512345678"],
    ["525512345678", "525512345678"],
    ["5215512345678", "525512345678"],
    ["+52 1 55 1234 5678", "525512345678"],
    ["0052 55 1234 5678", "525512345678"],
  ])("%j se guarda como 52 + 10 dígitos", (crudo, esperado) => {
    expect(normalizarTelefono(crudo)).toBe(esperado);
  });

  it("un número demasiado corto no vale", () => {
    expect(normalizarTelefono("1234")).toBeNull();
  });

  it("un número de otro país se guarda tal cual, solo con dígitos", () => {
    expect(normalizarTelefono("+1 (305) 555-0123")).toBe("13055550123");
  });

  it("busca las dos formas con las que Meta puede entregar un móvil mexicano", () => {
    expect(variantesTelefono("525512345678")).toEqual(["525512345678", "5215512345678"]);
    expect(variantesTelefono("5215512345678")).toEqual(["525512345678", "5215512345678"]);
    expect(variantesTelefono("13055550123")).toEqual(["13055550123"]);
  });

  it("para enviar usa 52 + 10, y con el '1' solo si Meta lo exige", () => {
    expect(telefonoParaEnvio("525512345678")).toBe("525512345678");
    expect(telefonoParaEnvio("525512345678", true)).toBe("5215512345678");
    expect(telefonoParaEnvio("13055550123", true)).toBe("13055550123");
  });
});
