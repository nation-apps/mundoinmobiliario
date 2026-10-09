import { beforeEach, describe, expect, it, vi } from "vitest";

const env: Record<string, string | undefined> = {};
vi.mock("../src/config/env.js", () => ({ env }));
vi.mock("../src/lib/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { paginasMeta, marcaDePagina, tokenDePagina, tokensParaAnuncios, _reiniciarPaginas } = await import("../src/meta/paginas.js");

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k];
  _reiniciarPaginas();
});

/** Mundo de Motos anuncia desde dos páginas: cada lead se lee con el token de su página y lleva su marca. */
describe("páginas de Meta", () => {
  it("cada página con su marca y su token", () => {
    env.META_PAGINAS = JSON.stringify([
      { id: "111", marca: "TVS", token: "t-tvs" },
      { id: "222", marca: "Mundo de Motos", token: "t-mundo" },
    ]);
    expect(marcaDePagina("111")).toBe("TVS");
    expect(marcaDePagina("222")).toBe("Mundo de Motos");
    expect(tokenDePagina("222")).toBe("t-mundo");
    expect(marcaDePagina("999")).toBeNull();
  });

  it("la página principal usa META_PAGE_ACCESS_TOKEN aunque no esté en la lista", () => {
    env.META_PAGE_ID = "111";
    env.META_PAGE_ACCESS_TOKEN = "t-principal";
    expect(tokenDePagina("111")).toBe("t-principal");
    expect(tokenDePagina("222")).toBeNull();
  });

  it("para los anuncios prueba primero el token de anuncios, sin repetir", () => {
    env.META_ADS_TOKEN = "t-ads";
    env.META_PAGE_ACCESS_TOKEN = "t-tvs";
    env.META_PAGINAS = JSON.stringify([{ id: "111", marca: "TVS", token: "t-tvs" }]);
    expect(tokensParaAnuncios()).toEqual(["t-ads", "t-tvs"]);
  });

  it("un META_PAGINAS roto se ignora en vez de tumbar el bot", () => {
    env.META_PAGINAS = "{no es json";
    expect(paginasMeta()).toEqual([]);
  });
});
