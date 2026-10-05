import { describe, expect, it, vi } from "vitest";

// handleMessage importa config/env.js, que valida las variables al cargar y
// hace process.exit(1) si faltan: se mockea como en los demás tests.
vi.mock("../src/config/env.js", () => ({
  env: { LOG_LEVEL: "silent", META_GRAPH_VERSION: "v26.0", META_HUMAN_AGENT_APROBADO: false, RATE_LIMIT_MAX_PER_MINUTE: 20 },
}));
vi.mock("../src/db/client.js", () => ({ supabase: {} }));

const { anotarAnuncio, metadataAnuncio } = await import("../src/agent/handleMessage.js");

describe("anotarAnuncio", () => {
  it("deja el texto igual si no vino de un anuncio", () => {
    expect(anotarAnuncio("Hola", undefined)).toBe("Hola");
  });

  it("agrega título y primera línea del anuncio", () => {
    const out = anotarAnuncio("Hola, quiero más información", {
      headline: "Tu empresa en 7 días · Desde S/ 899",
      body: "\n¿Sigues vendiendo con tu DNI? 🤔\n\nTen tu empresa con RUC 20",
    });
    expect(out).toBe(
      'Hola, quiero más información\n\n(Llegó desde un anuncio de Meta: "Tu empresa en 7 días · Desde S/ 899 — ¿Sigues vendiendo con tu DNI? 🤔")',
    );
  });

  it("anota aunque el anuncio no traiga título ni texto", () => {
    expect(anotarAnuncio("Hola", { sourceId: "123" })).toBe("Hola\n\n(Llegó desde un anuncio de Meta)");
  });
});

describe("metadataAnuncio", () => {
  it("no anota nada si no vino de un anuncio", () => {
    expect(metadataAnuncio(undefined)).toBeUndefined();
  });

  it("guarda el id del anuncio con su título", () => {
    expect(metadataAnuncio({ sourceId: "120250772736580504", headline: "Star Beauty · Entradas desde S/ 499" })).toEqual({
      anuncio: { id: "120250772736580504", titulo: "Star Beauty · Entradas desde S/ 499" },
    });
  });
});
