import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({ env: { BUSINESS_TIMEZONE: "America/Mexico_City", LOG_LEVEL: "silent" } }));
vi.mock("../src/db/repositories/plantillasMedia.js", () => ({
  listActivePlantillas: vi.fn(async () => [
    { id: "p1", nombre: "Catálogo de motos", tipo: "document", descripcion_uso: "Cuando pida ver los modelos" },
  ]),
}));

const { buildSystemPrompt } = await import("../src/agent/systemPrompt.js");
const { quitarVoseo } = await import("../src/lib/voseo.js");

describe("prompt de Mundo Motos", () => {
  it("el propio prompt no usa voseo: el modelo imita lo que lee", async () => {
    // La regla que prohíbe el voseo cita las palabras prohibidas; se quita para no confundirla con voseo real.
    const p = (await buildSystemPrompt("whatsapp")).replace(/- NUNCA uses voseo[\s\S]*?"tú", "eres"\.\n/, "");
    expect(p).not.toMatch(/NUNCA uses voseo/);
    expect(quitarVoseo(p)).toBe(p);
  });

  it("todo dato pendiente se convierte en «no lo sabes, lo confirma un asesor» y no se inventa", async () => {
    const p = await buildSystemPrompt("whatsapp");
    expect(p).toMatch(/Precios de motos, refacciones y accesorios: NO lo sabes todavía\. No lo inventes: di que un asesor te lo confirma/);
    expect(p).toMatch(/Requisitos, enganche mínimo, plazos y financieras: NO lo sabes todavía/);
    expect(p).not.toMatch(/POR_DEFINIR/);
    // Lo mismo en el texto de cada canal (TikTok mencionaba el número del bot).
    for (const canal of ["messenger", "instagram", "tiktok", "web"] as const) {
      expect(await buildSystemPrompt(canal)).not.toMatch(/POR_DEFINIR/);
    }
  });

  it("no inventa modelos, precios ni crédito, y no promete aprobaciones", async () => {
    const p = await buildSystemPrompt("whatsapp");
    expect(p).toMatch(/No inventes modelos, precios, existencias/);
    expect(p).toMatch(/no prometas aprobación, crédito sin revisión de Buró, cero enganche/);
    expect(p).not.toMatch(/seminario|inmobiliari|inversionista/i);
  });

  it("aplica las reglas del documento del negocio", async () => {
    const p = await buildSystemPrompt("whatsapp");
    // Datos de la sucursal.
    expect(p).toMatch(/Avenida Yaxchilán 573, Cancún/);
    expect(p).toMatch(/lunes a viernes de 9 am a 6 pm y sábado de 9 am a 2 pm/);
    // Sin seminuevas, sin pruebas de manejo prometidas, sin lo que no hay en inventario.
    expect(p).toMatch(/No compramos, vendemos ni tomamos a cuenta motos usadas o seminuevas/);
    expect(p).toMatch(/Ofrece una visita para conocer la moto, no una prueba/);
    expect(p).toMatch(/No manejamos rines, llantas, cubre cárter ni cubrepuños/);
    // Filtro de ciudad sin descartar, y el taller no diagnostica por chat.
    expect(p).toMatch(/¿Vives en Cancún o podrías visitarnos en nuestra\s+sucursal\?/);
    expect(p).toMatch(/Nunca des un diagnóstico como definitivo por chat/);
  });

  it("califica al cliente y deriva al asesor con un resumen", async () => {
    const p = await buildSystemPrompt("whatsapp");
    expect(p).toMatch(/guardar_perfil_compra/);
    expect(p).toMatch(/escalar_a_humano con un resumen\s+claro/);
  });

  it("incluye la multimedia disponible y las reglas de voz humana", async () => {
    const p = await buildSystemPrompt("whatsapp");
    expect(p).toMatch(/id: p1 — "Catálogo de motos"/);
    expect(p).toMatch(/Voz humana/);
    expect(p).toMatch(/\[\[botones: Opción 1 \| Opción 2 \| Opción 3\]\]/);
  });

  it("el canal web solo redacta un primer mensaje para que lo revise una persona", async () => {
    const p = await buildSystemPrompt("web");
    expect(p).toMatch(/lo revisa y\s+lo envía una persona del equipo/);
  });
});
