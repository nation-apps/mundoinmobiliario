import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config/env.js", () => ({
  env: { LEADS_VENTANA_MIN: 120, LEADS_RECONCILIAR_ACTIVO: true, LEADS_RECONCILIAR_MIN: 5, META_GRAPH_VERSION: "v26.0" },
  metaConfigurado: true,
}));
vi.mock("../src/meta/client.js", () => ({ GRAPH_BASE_URL: "https://graph.test/v26.0" }));
const paginas = [
  { id: "TVS", marca: "TVS", token: "tok-tvs" },
  { id: "MX", marca: "Mundo de Motos", token: "tok-mx" },
];
vi.mock("../src/meta/paginas.js", () => ({ paginasMeta: () => paginas }));
const mensajes = { existeExternalId: vi.fn(async () => false) };
vi.mock("../src/db/repositories/mensajes.js", () => mensajes);
const lead = { handleLeadFormulario: vi.fn(async () => {}) };
vi.mock("../src/agent/handleLeadFormulario.js", () => lead);
vi.mock("../src/meta/completarAnuncios.js", () => ({ completarAnunciosDeLeads: vi.fn(async () => 0) }));

const { reconciliarLeads, listarLeadsRecientes } = await import("../src/meta/reconciliarLeads.js");

const AHORA = new Date("2026-10-14T18:00:00Z");
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString();

type Ruta = (url: string) => unknown;
function simularMeta(ruta: Ruta) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const r = ruta(url);
      if (r instanceof Error) return { ok: false, status: 400, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => r };
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mensajes.existeExternalId.mockResolvedValue(false);
});

describe("revisión de formularios de anuncios", () => {
  it("lista solo formularios activos y deja fuera lo anterior a la ventana", async () => {
    simularMeta((url) => {
      if (url.includes("/TVS/leadgen_forms"))
        return { data: [{ id: "F1", status: "ACTIVE" }, { id: "F2", status: "ARCHIVED" }] };
      if (url.includes("/F1/leads"))
        return { data: [{ id: "L1", created_time: hace(10), ad_id: "AD1" }, { id: "L0", created_time: hace(500) }] };
      return { data: [] };
    });
    const leads = await listarLeadsRecientes(paginas[0]!, new Date(AHORA.getTime() - 120 * 60_000));
    expect(leads).toEqual([{ id: "L1", formId: "F1", adId: "AD1", creado: new Date(hace(10)) }]);
    const urls = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.includes("/F2/leads"))).toBe(false);
    expect(urls.every((u) => u.includes("access_token=tok-tvs"))).toBe(true);
  });

  it("registra los que faltan, del más viejo al más nuevo, y no repite los ya guardados", async () => {
    simularMeta((url) => {
      if (url.includes("/TVS/leadgen_forms")) return { data: [{ id: "F1", status: "ACTIVE" }] };
      if (url.includes("/MX/leadgen_forms")) return { data: [] };
      if (url.includes("/F1/leads"))
        return { data: [{ id: "NUEVO", created_time: hace(5) }, { id: "YA", created_time: hace(30) }, { id: "VIEJO", created_time: hace(60) }] };
      return { data: [] };
    });
    mensajes.existeExternalId.mockImplementation(async (id: string) => id === "leadgen:YA");
    const r = await reconciliarLeads({ ahora: AHORA });
    expect(r).toMatchObject({ revisados: 3, nuevos: 2, fallidos: 0 });
    const ordenados = lead.handleLeadFormulario.mock.calls.map((c) => (c as unknown as [{ leadgenId: string }])[0].leadgenId);
    expect(ordenados).toEqual(["VIEJO", "NUEVO"]);
    expect(lead.handleLeadFormulario).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "lead_formulario", cuentaId: "TVS", externalId: "leadgen:NUEVO", formId: "F1" }),
    );
  });

  it("una página que falla no detiene a las demás", async () => {
    simularMeta((url) => {
      if (url.includes("/TVS/leadgen_forms")) return new Error("permiso");
      if (url.includes("/MX/leadgen_forms")) return { data: [{ id: "F9", status: "ACTIVE" }] };
      if (url.includes("/F9/leads")) return { data: [{ id: "MX1", created_time: hace(3) }] };
      return { data: [] };
    });
    const r = await reconciliarLeads({ ahora: AHORA });
    expect(r).toMatchObject({ nuevos: 1, fallidos: 1 });
    expect(lead.handleLeadFormulario).toHaveBeenCalledWith(expect.objectContaining({ cuentaId: "MX" }));
  });

  it("no inunda la bandeja: máximo 50 por vuelta", async () => {
    const muchos = Array.from({ length: 80 }, (_, i) => ({ id: `L${i}`, created_time: hace(i + 1) }));
    simularMeta((url) => {
      if (url.includes("/TVS/leadgen_forms")) return { data: [{ id: "F1", status: "ACTIVE" }] };
      if (url.includes("/MX/leadgen_forms")) return { data: [] };
      if (url.includes("/F1/leads")) return { data: muchos };
      return { data: [] };
    });
    const r = await reconciliarLeads({ ahora: AHORA });
    expect(r.nuevos).toBe(50);
    expect(r.recortado).toBe(true);
  });

  it("si el registro de un lead falla, sigue con los demás", async () => {
    simularMeta((url) => {
      if (url.includes("/TVS/leadgen_forms")) return { data: [{ id: "F1", status: "ACTIVE" }] };
      if (url.includes("/MX/leadgen_forms")) return { data: [] };
      if (url.includes("/F1/leads")) return { data: [{ id: "A", created_time: hace(20) }, { id: "B", created_time: hace(10) }] };
      return { data: [] };
    });
    lead.handleLeadFormulario.mockRejectedValueOnce(new Error("base caída"));
    const r = await reconciliarLeads({ ahora: AHORA });
    expect(r).toMatchObject({ nuevos: 1, fallidos: 1 });
  });
});
