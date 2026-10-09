import { describe, expect, it } from "vitest";
import { esFuenteDeCampana, fuenteCampana, fuentePorCanal } from "../src/lib/fuente.js";

/** Las etiquetas del campo «origen» que pidió el cliente (y las mismas que rellena 0006_fuente_lead.sql). */
describe("fuente (origen del lead)", () => {
  it("campañas con la marca de la página", () => {
    expect(fuenteCampana("Formulario", "TVS")).toBe("Campaña Formulario Meta TVS");
    expect(fuenteCampana("WhatsApp", "TVS")).toBe("Campaña WhatsApp Meta TVS");
    expect(fuenteCampana("Formulario", "Mundo de Motos")).toBe("Campaña Formulario Meta Mundo de Motos");
    expect(fuenteCampana("WhatsApp", "Mundo de Motos")).toBe("Campaña WhatsApp Meta Mundo de Motos");
  });

  it("si no se sabe la página, queda la campaña sin marca (no se inventa)", () => {
    expect(fuenteCampana("WhatsApp", null)).toBe("Campaña WhatsApp Meta");
  });

  it("lo que no es campaña sale del canal", () => {
    expect(fuentePorCanal("whatsapp", "dm")).toBe("WhatsApp directo");
    expect(fuentePorCanal("instagram", "dm")).toBe("Instagram");
    expect(fuentePorCanal("messenger", "dm")).toBe("Messenger");
    expect(fuentePorCanal("web", "formulario")).toBe("Formulario web");
    expect(fuentePorCanal("web", "formulario", "facebook_lead_ads")).toBe("Campaña Formulario Meta");
    expect(fuentePorCanal("instagram", "comentario")).toBe("Comentario Instagram");
    expect(fuentePorCanal("messenger", "comentario")).toBe("Comentario Facebook");
  });

  it("distingue una campaña de un contacto directo", () => {
    expect(esFuenteDeCampana("Campaña WhatsApp Meta TVS")).toBe(true);
    expect(esFuenteDeCampana("WhatsApp directo")).toBe(false);
    expect(esFuenteDeCampana(null)).toBe(false);
  });
});
