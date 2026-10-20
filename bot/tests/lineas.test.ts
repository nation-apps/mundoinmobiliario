import { afterEach, describe, expect, it } from "vitest";
import { fijarLineaActual, marcaDeLaLinea } from "../src/lib/lineas.js";
import { fuentePorCanal, fuenteWhatsappDirecto } from "../src/lib/fuente.js";

afterEach(() => {
  fijarLineaActual(null);
  delete process.env.WHATSAPP_MARCA;
  delete process.env.WHATSAPP_LINEAS;
});

describe("marca de la línea de WhatsApp", () => {
  it("el número de TVS y el de Mundo de Motos, con o sin el «1» de México", () => {
    fijarLineaActual("529987584160");
    expect(marcaDeLaLinea()).toBe("TVS");
    fijarLineaActual("5219987584160");
    expect(marcaDeLaLinea()).toBe("TVS");
    fijarLineaActual("529988706920");
    expect(marcaDeLaLinea()).toBe("Mundo de Motos");
  });

  it("un número desconocido o sin conexión no tiene marca (no se inventa)", () => {
    fijarLineaActual("529999999999");
    expect(marcaDeLaLinea()).toBeNull();
    fijarLineaActual(null);
    expect(marcaDeLaLinea()).toBeNull();
  });

  it("WHATSAPP_MARCA manda sobre el número, y WHATSAPP_LINEAS suma números", () => {
    fijarLineaActual("529999999999");
    process.env.WHATSAPP_LINEAS = JSON.stringify({ "+52 999 999 9999": "Otra" });
    expect(marcaDeLaLinea()).toBe("Otra");
    process.env.WHATSAPP_MARCA = "TVS";
    expect(marcaDeLaLinea()).toBe("TVS");
  });

  it("un JSON mal escrito no rompe nada", () => {
    process.env.WHATSAPP_LINEAS = "{no es json";
    fijarLineaActual("529987584160");
    expect(marcaDeLaLinea()).toBe("TVS");
  });
});

describe("origen de quien escribe directo a la línea", () => {
  it("«WhatsApp Directo TVS» y «WhatsApp Directo Mundo de Motos»", () => {
    fijarLineaActual("529987584160");
    expect(fuentePorCanal("whatsapp", "dm")).toBe("WhatsApp Directo TVS");
    fijarLineaActual("529988706920");
    expect(fuentePorCanal("whatsapp", "dm")).toBe("WhatsApp Directo Mundo de Motos");
  });

  it("sin saber la línea queda como siempre", () => {
    expect(fuentePorCanal("whatsapp", "dm")).toBe("WhatsApp directo");
    expect(fuenteWhatsappDirecto(null)).toBe("WhatsApp directo");
  });

  it("los demás canales no cambian", () => {
    fijarLineaActual("529987584160");
    expect(fuentePorCanal("messenger", "dm")).toBe("Messenger");
    expect(fuentePorCanal("web", "formulario")).toBe("Formulario web");
  });
});
