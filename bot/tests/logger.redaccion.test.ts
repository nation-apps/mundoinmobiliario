import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({ env: { LOG_LEVEL: "silent" } }));

const { opcionesLogger } = await import("../src/lib/logger.js");

function registrar(objeto: Record<string, unknown>): string {
  let salida = "";
  const destino = new Writable({
    write(chunk, _enc, cb) {
      salida += String(chunk);
      cb();
    },
  });
  pino({ ...opcionesLogger, level: "info" }, destino).warn(objeto, "prueba");
  return salida;
}

describe("redacción del logger", () => {
  it("enmascara la clave `telefono` (la que usa whatsapp/window.ts)", () => {
    const salida = registrar({ telefono: "51999888777", lastInboundAt: null });
    expect(salida).not.toContain("51999888777");
    expect(salida).toContain("519***77");
  });

  it("enmascara `telefono` anidado un nivel", () => {
    expect(registrar({ cliente: { telefono: "51999888777" } })).not.toContain("51999888777");
  });
});
