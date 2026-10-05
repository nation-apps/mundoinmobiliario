import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/client.js", () => ({ supabase: {} }));

const { esEtiquetaAnulado, ETIQUETA_ANULADO } = await import("../src/db/repositories/etiquetas.js");

describe("etiqueta «Anulado»", () => {
  it("el nombre oficial se reconoce", () => {
    expect(esEtiquetaAnulado(ETIQUETA_ANULADO)).toBe(true);
  });
  it.each(["anulado", "ANULADO", " Anulado ", "Ánulado"])("%j también (sin importar mayúsculas, espacios ni tildes)", (n) => {
    expect(esEtiquetaAnulado(n)).toBe(true);
  });
  it.each(["Curso online", "Novia", "VIP", "Anulada", "No anulado", ""])("%j NO anula", (n) => {
    expect(esEtiquetaAnulado(n)).toBe(false);
  });
});
