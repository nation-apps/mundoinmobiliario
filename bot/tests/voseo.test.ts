import { describe, expect, it } from "vitest";
import { quitarVoseo } from "../src/lib/voseo.js";

describe("quitarVoseo", () => {
  it("corrige los imperativos y verbos más comunes", () => {
    expect(quitarVoseo("Contame, ¿qué te gustaría ver?")).toBe("Cuéntame, ¿qué te gustaría ver?");
    expect(quitarVoseo("Decime si querés separarla y avisame cuando tengas el Yape")).toBe("Dime si quieres separarla y avísame cuando tengas el Yape");
    expect(quitarVoseo("Mirá, vos sos de las que seguís aprendiendo")).toBe("Mira, tú eres de las que sigues aprendiendo");
    expect(quitarVoseo("¿Tenés tiempo? ¿Podés ir el lunes?")).toBe("¿Tienes tiempo? ¿Puedes ir el lunes?");
  });

  it("conserva la mayúscula inicial y no toca el resto", () => {
    expect(quitarVoseo("Querés que te cuente? Tenés dudas")).toBe("Quieres que te cuente? Tienes dudas");
    expect(quitarVoseo("Hola, ¿cómo estás? Te cuento del evento del 26 de octubre.")).toBe("Hola, ¿cómo estás? Te cuento del evento del 26 de octubre.");
  });

  it("no cambia palabras que solo contienen estas letras", () => {
    expect(quitarVoseo("Es un sosiego, y los vosotros no existen aquí. Contamos con 20 lugares")).toBe(
      "Es un sosiego, y los vosotros no existen aquí. Contamos con 20 lugares",
    );
  });

  it("deja igual un texto peruano correcto", () => {
    const t = "Cuéntame, ¿trabajas como maquilladora o recién empiezas? Puedes separar tu lugar con S/ 200.";
    expect(quitarVoseo(t)).toBe(t);
  });
});
