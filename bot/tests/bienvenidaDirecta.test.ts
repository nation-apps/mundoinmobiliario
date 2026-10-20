import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("../src/config/env.js", () => ({ env: { BUSINESS_TIMEZONE: "America/Cancun" } }));
vi.mock("../src/db/repositories/bienvenida.js", () => ({ leerBienvenida: vi.fn() }));
vi.mock("../src/db/repositories/etiquetas.js", () => ({ clienteAnulado: vi.fn() }));
vi.mock("../src/db/repositories/mensajes.js", () => ({ guardarMensaje: vi.fn(), tieneRespuestaDelEquipo: vi.fn() }));
vi.mock("../src/db/repositories/staff.js", () => ({ nombreDeStaff: vi.fn() }));
vi.mock("../src/whatsapp/window.js", () => ({ sendTextIfWindowOpen: vi.fn() }));
vi.mock("../src/whatsapp/client.js", () => ({ sendText: vi.fn() }));
vi.mock("../src/db/repositories/conversaciones.js", () => ({}));

const { armarBienvenidaDirecta } = await import("../src/agent/bienvenidaDirecta.js");

describe("bienvenida a quien escribe por primera vez", () => {
  const datos = { nombreContacto: "MARCOS GONZALEZ", marca: "TVS", asesor: "Ventas Cancún 2 - Hanna" };

  it("apagada o sin texto: nada", () => {
    expect(armarBienvenidaDirecta({ directo_activo: false, directo_texto: "Hola" }, datos)).toBeNull();
    expect(armarBienvenidaDirecta({ directo_activo: true, directo_texto: null }, datos)).toBeNull();
    expect(armarBienvenidaDirecta({ directo_activo: true, directo_texto: "   " }, datos)).toBeNull();
  });

  it("encendida: el texto del administrador con el nombre, la marca y el asesor", () => {
    expect(
      armarBienvenidaDirecta(
        { directo_activo: true, directo_texto: "Hola {{nombre}} 👋 Bienvenido a {{marca}}. Te atiende {{asesor}}." },
        datos,
      ),
    ).toBe("Hola Marcos 👋 Bienvenido a TVS. Te atiende Hanna.");
  });

  it("sin nombre ni asesor no deja huecos raros", () => {
    expect(
      armarBienvenidaDirecta(
        { directo_activo: true, directo_texto: "Hola {{nombre}}, soy {{asesor}} de {{marca}}." },
        { nombreContacto: null, marca: "Mundo de Motos", asesor: null },
      ),
    ).toBe("Hola, soy tu asesor de Mundo de Motos.");
  });
});
