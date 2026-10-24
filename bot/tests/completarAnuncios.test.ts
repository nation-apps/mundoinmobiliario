import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
const anuncioDeLead = vi.fn();
vi.mock("../src/meta/client.js", () => ({ anuncioDeLead }));

let filas: { id: string; metadata: Record<string, unknown> }[] = [];
const actualizaciones: { id: unknown; metadata: unknown }[] = [];
function builder() {
  let patch: unknown = null;
  const b: Record<string, unknown> = {};
  for (const op of ["select", "not", "is", "gte", "order", "limit"]) b[op] = () => b;
  b.update = (p: unknown) => ((patch = p), b);
  b.eq = (_c: string, v: unknown) => {
    actualizaciones.push({ id: v, metadata: (patch as { metadata: unknown }).metadata });
    return Promise.resolve({ error: null });
  };
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: filas, error: null });
  return b;
}
vi.mock("../src/db/client.js", () => ({ supabase: { from: () => builder() } }));

const { completarAnunciosDeLeads } = await import("../src/meta/completarAnuncios.js");

beforeEach(() => {
  filas = [];
  actualizaciones.length = 0;
  anuncioDeLead.mockReset();
});

describe("completarAnunciosDeLeads", () => {
  it("completa el formulario con el anuncio que Meta ya conoce, sin pisar lo que había", async () => {
    filas = [{ id: "m1", metadata: { leadgen_id: "L1", pagina_id: "P", formulario: "Encuentra tu próxima TVS" } }];
    anuncioDeLead.mockResolvedValue({ adId: "120", anuncio: "Encuentra tu próxima TVS - 2", campana: "CAMPAÑA TVS", plataforma: "fb", esOrganico: false });
    expect(await completarAnunciosDeLeads()).toBe(1);
    expect(actualizaciones[0]).toEqual({
      id: "m1",
      metadata: { leadgen_id: "L1", pagina_id: "P", formulario: "Encuentra tu próxima TVS", ad_id: "120", anuncio: "Encuentra tu próxima TVS - 2", campana: "CAMPAÑA TVS", plataforma: "fb" },
    });
  });

  it("si Meta todavía no lo tiene, no toca nada (se reintenta en la próxima vuelta)", async () => {
    filas = [{ id: "m1", metadata: { leadgen_id: "L1" } }];
    anuncioDeLead.mockResolvedValue({ adId: null, anuncio: null, campana: null, plataforma: null, esOrganico: false });
    expect(await completarAnunciosDeLeads()).toBe(0);
    expect(actualizaciones).toEqual([]);
  });

  it("un formulario orgánico se marca y no se vuelve a preguntar", async () => {
    filas = [{ id: "m1", metadata: { leadgen_id: "L1" } }, { id: "m2", metadata: { leadgen_id: "L2", organico: true } }];
    anuncioDeLead.mockResolvedValue({ adId: null, anuncio: null, campana: null, plataforma: null, esOrganico: true });
    await completarAnunciosDeLeads();
    expect(anuncioDeLead).toHaveBeenCalledTimes(1);
    expect(actualizaciones[0]).toEqual({ id: "m1", metadata: { leadgen_id: "L1", organico: true } });
  });

  it("un error de Meta no corta la vuelta", async () => {
    filas = [{ id: "m1", metadata: { leadgen_id: "L1" } }, { id: "m2", metadata: { leadgen_id: "L2" } }];
    anuncioDeLead.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ adId: "9", anuncio: null, campana: null, plataforma: null, esOrganico: false });
    expect(await completarAnunciosDeLeads()).toBe(1);
  });
});
