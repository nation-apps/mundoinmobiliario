import { describe, expect, it } from "vitest";
import { quitarRayas } from "../src/lib/quitarRayas.js";

describe("quitarRayas", () => {
  it("cambia la raya larga entre frases por una coma", () => {
    expect(quitarRayas("Son cosas separadas — ese capital es lo que aportan.")).toBe(
      "Son cosas separadas, ese capital es lo que aportan.",
    );
    expect(quitarRayas("el RUC 20 ya viene incluido—no tienes que elegirlo")).toBe(
      "el RUC 20 ya viene incluido, no tienes que elegirlo",
    );
  });

  it("no duplica la puntuación ni deja comas colgando", () => {
    expect(quitarRayas("Listo. — Te llamamos el jueves")).toBe("Listo. Te llamamos el jueves");
    expect(quitarRayas("Precio cerrado —\nincluye todo")).toBe("Precio cerrado\nincluye todo");
    expect(quitarRayas("— Primer punto")).toBe("Primer punto");
  });

  it("respeta los rangos con raya corta sin espacios", () => {
    expect(quitarRayas("Atendemos de 9:00–18:00")).toBe("Atendemos de 9:00–18:00");
    expect(quitarRayas("EIRL – SAC")).toBe("EIRL, SAC");
  });

  it("deja igual un texto sin rayas", () => {
    expect(quitarRayas("Hola, ¿en qué te ayudo?")).toBe("Hola, ¿en qué te ayudo?");
  });
});
