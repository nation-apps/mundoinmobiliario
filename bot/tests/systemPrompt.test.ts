import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({ env: { BUSINESS_TIMEZONE: "America/Mexico_City", LOG_LEVEL: "silent" } }));
vi.mock("../src/db/repositories/plantillasMedia.js", () => ({
  listActivePlantillas: vi.fn(async () => [
    { id: "p1", nombre: "Temario del programa", tipo: "document", descripcion_uso: "Cuando pida información del programa" },
  ]),
}));

const { buildSystemPrompt } = await import("../src/agent/systemPrompt.js");
const { quitarVoseo } = await import("../src/lib/voseo.js");

describe("prompt de Mundo Inmobiliario", () => {
  it("el propio prompt no usa voseo: el modelo imita lo que lee", async () => {
    // La regla que prohíbe el voseo cita las palabras prohibidas; se quita para no confundirla con voseo real.
    const p = (await buildSystemPrompt("whatsapp")).replace(/- NUNCA uses voseo[\s\S]*?"tú", "eres"\.\n/, "");
    expect(p).not.toMatch(/NUNCA uses voseo/);
    expect(quitarVoseo(p)).toBe(p);
  });

  it("todo dato pendiente se convierte en «no lo sabes, lo confirma un asesor» y no se inventa", async () => {
    const p = await buildSystemPrompt("whatsapp");
    expect(p).toMatch(/Precios de los programas: NO lo sabes todavía\. No lo inventes: di que un asesor te lo confirma/);
    expect(p).toMatch(/Fecha y hora del próximo seminario: NO lo sabes todavía/);
    expect(p).not.toMatch(/POR_DEFINIR/);
  });

  it("no inventa precios ni fechas, no da asesoría personalizada y no promete resultados", async () => {
    const p = await buildSystemPrompt("whatsapp");
    expect(p).toMatch(/No inventes precios, descuentos, fechas, promociones, duraciones/);
    expect(p).toMatch(/No des asesoría legal, fiscal ni financiera personalizada/);
    expect(p).toMatch(/No prometas resultados ni ganancias/);
    expect(p).toMatch(/NO vendes ni muestras propiedades/);
  });

  it("califica al cliente y deriva al asesor con un resumen", async () => {
    const p = await buildSystemPrompt("whatsapp");
    expect(p).toMatch(/guardar_perfil_inversionista/);
    expect(p).toMatch(/escalar_a_humano con un resumen claro/);
  });

  it("incluye la multimedia disponible y las reglas de voz humana", async () => {
    const p = await buildSystemPrompt("whatsapp");
    expect(p).toMatch(/id: p1 — "Temario del programa"/);
    expect(p).toMatch(/Voz humana/);
    expect(p).toMatch(/\[\[botones: Opción 1 \| Opción 2 \| Opción 3\]\]/);
  });

  it("el canal web solo redacta un primer mensaje para que lo revise una persona", async () => {
    const p = await buildSystemPrompt("web");
    expect(p).toMatch(/lo revisa y\s+lo envía una persona del equipo/);
  });
});
