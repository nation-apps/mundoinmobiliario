import { describe, expect, it } from "vitest";
import { faltanteMs, pausaObjetivoMs } from "../src/lib/ritmoHumano.js";

const min = () => 0;
const max = () => 0.999999;

describe("ritmo humano de las respuestas", () => {
  it("la primera respuesta (desde un anuncio) sale entre 6 y 8 segundos, sea corta o larga", () => {
    for (const caracteres of [0, 80, 150, 400, 1000]) {
      for (const azar of [min, max, () => 0.5]) {
        const ms = pausaObjetivoMs({ caracteres, tipo: "primera", azar });
        expect(ms).toBeGreaterThanOrEqual(6_000);
        expect(ms).toBeLessThanOrEqual(8_000);
      }
    }
  });

  it("las demás respuestas salen entre 8 y 15 segundos y crecen con el largo", () => {
    const corta = pausaObjetivoMs({ caracteres: 60, tipo: "normal", azar: () => 0.5 });
    const media = pausaObjetivoMs({ caracteres: 200, tipo: "normal", azar: () => 0.5 });
    const larga = pausaObjetivoMs({ caracteres: 900, tipo: "normal", azar: () => 0.5 });
    for (const ms of [corta, media, larga]) {
      expect(ms).toBeGreaterThanOrEqual(8_000);
      expect(ms).toBeLessThanOrEqual(15_000);
    }
    expect(media).toBeGreaterThan(corta);
    expect(larga).toBe(15_000);
  });

  it("el texto fijo sale entre 3 y 4 segundos", () => {
    for (const azar of [min, max]) {
      const ms = pausaObjetivoMs({ caracteres: 180, tipo: "fija", azar });
      expect(ms).toBeGreaterThanOrEqual(3_000);
      expect(ms).toBeLessThanOrEqual(4_000);
    }
  });

  it("no es siempre idéntico: con distinto azar la pausa cambia", () => {
    const a = pausaObjetivoMs({ caracteres: 200, tipo: "normal", azar: min });
    const b = pausaObjetivoMs({ caracteres: 200, tipo: "normal", azar: max });
    expect(a).not.toBe(b);
  });

  it("el factor escala la pausa (0 la apaga)", () => {
    const base = pausaObjetivoMs({ caracteres: 200, tipo: "normal", azar: () => 0.5 });
    expect(pausaObjetivoMs({ caracteres: 200, tipo: "normal", azar: () => 0.5, factor: 0.5 })).toBe(Math.round(base * 0.5));
    expect(pausaObjetivoMs({ caracteres: 200, tipo: "normal", azar: () => 0.5, factor: 0 })).toBe(0);
  });

  it("solo se espera lo que falta tras el tiempo que ya tardó el modelo", () => {
    expect(faltanteMs(9_000, 4_000)).toBe(5_000);
    expect(faltanteMs(9_000, 12_000)).toBe(0);
  });
});
