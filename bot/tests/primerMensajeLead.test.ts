import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({ env: { BUSINESS_TIMEZONE: "America/Cancun", LOG_LEVEL: "silent" } }));
vi.mock("../src/lib/logger.js", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("../src/db/repositories/etiquetas.js", () => ({ clienteAnulado: vi.fn(async () => false) }));
vi.mock("../src/db/repositories/conversaciones.js", () => ({
  convertirEnWhatsapp: vi.fn(),
  leerConversacion: vi.fn(),
  tieneConversacionWhatsappAbierta: vi.fn(),
}));
vi.mock("../src/db/repositories/mensajes.js", () => ({ guardarMensaje: vi.fn() }));
vi.mock("../src/whatsapp/client.js", () => ({ sendText: vi.fn() }));

const { esperaParaEnviar, horaLocal, interesDelLead, nombreParaSaludo, rellenarPlantilla, textoPrimerMensaje } = await import(
  "../src/agent/primerMensajeLead.js"
);

const campo = (name: string, ...values: string[]) => ({ name, values });

const FORMULARIO_TVS = [
  campo("full_name", "MARCOS GONZALEZ"),
  campo("¿qué_modelo_tvs_te_interesa?", "tvs_rtr_310"),
  campo("¿cuándo_tienes_pensado_comprar_tu_moto?", "esta_semana"),
  campo("phone_number", "+529981234567"),
];

const FORMULARIO_REFACCIONES = [
  campo("full_name", "Ana"),
  campo("¿qué_refacción_estás_buscando?", "balatas_/_pastillas_de_freno"),
  campo("¿qué_marca_es_tu_moto?", "italika"),
  campo("¿qué_modelo_tienes?", "ft150"),
  campo("¿de_qué_año_es_tu_moto?", "2024"),
];

describe("nombre para el saludo", () => {
  it("usa el primer nombre bien escrito", () => {
    expect(nombreParaSaludo("MARCOS GONZALEZ")).toBe("Marcos");
    expect(nombreParaSaludo("  ana  maría ")).toBe("Ana");
  });
  it("sin un nombre legible no saluda por nombre", () => {
    expect(nombreParaSaludo("")).toBe("");
    expect(nombreParaSaludo(null)).toBe("");
    expect(nombreParaSaludo("🏍️")).toBe("");
    expect(nombreParaSaludo("x")).toBe("");
  });
});

describe("lo que le interesa al lead", () => {
  it("el modelo TVS elegido, con siglas en mayúsculas", () => {
    expect(interesDelLead(FORMULARIO_TVS)).toEqual({ frase: "la TVS RTR 310", tipo: "tvs" });
  });
  it("si no está seguro del modelo TVS, no inventa uno", () => {
    const campos = [campo("¿qué_modelo_tvs_te_interesa?", "aún_no_estoy_seguro")];
    expect(interesDelLead(campos)).toEqual({ frase: null, tipo: "tvs" });
  });
  it("refacciones: la pieza y la moto", () => {
    expect(interesDelLead(FORMULARIO_REFACCIONES)).toEqual({ frase: "balatas / pastillas de freno para tu Italika FT150", tipo: "refacciones" });
  });
  it("refacción «Otra» queda en refacciones a secas", () => {
    const campos = [campo("¿qué_refacción_estás_buscando?", "otra"), campo("¿qué_marca_es_tu_moto?", "otra")];
    expect(interesDelLead(campos)).toEqual({ frase: "refacciones", tipo: "refacciones" });
  });
  it("un formulario que no es de ninguno de los dos es general", () => {
    expect(interesDelLead([campo("full_name", "Ana")])).toEqual({ frase: null, tipo: "general" });
  });
});

describe("texto del primer mensaje", () => {
  it("TVS: saluda por nombre, menciona el modelo y deja salir con «NO»", () => {
    const texto = textoPrimerMensaje({ nombre: "MARCOS GONZALEZ", campos: FORMULARIO_TVS, marca: "TVS" });
    expect(texto).toContain("Hola Marcos");
    expect(texto).toContain("TVS Motor Cancún");
    expect(texto).toContain("te interesa la TVS RTR 310");
    expect(texto).toContain("responde NO");
  });

  it("refacciones: pide pieza, modelo y año sin prometer precio", () => {
    const texto = textoPrimerMensaje({ nombre: "Ana", campos: FORMULARIO_REFACCIONES, marca: "Mundo de Motos" });
    expect(texto).toContain("Mundo de Motos");
    expect(texto).toContain("buscas balatas / pastillas de freno para tu Italika FT150");
    expect(texto).toContain("disponibilidad y precio");
  });

  it("sin nombre ni respuestas, un saludo general", () => {
    const texto = textoPrimerMensaje({ nombre: null, campos: [], marca: null });
    expect(texto.startsWith("Hola 👋 Te escribimos de Mundo de Motos")).toBe(true);
  });

  it("un texto propio se rellena con nombre, marca e interés", () => {
    const texto = textoPrimerMensaje({
      nombre: "Marcos",
      campos: FORMULARIO_TVS,
      marca: "TVS",
      plantilla: "Hola {{nombre}}, de {{marca}}: vimos tu interés en {{interes}}.",
    });
    expect(texto).toBe("Hola Marcos, de TVS Motor Cancún: vimos tu interés en la TVS RTR 310.");
    expect(rellenarPlantilla("Hola {{nombre}} ¿{{interes}}?", { nombre: "", marca: "X", interes: null })).toBe("Hola ¿nuestras motos?");
  });
});

describe("cuándo se puede mandar", () => {
  const base = { desde: 8, hasta: 21, maxPorHora: 3 };
  const AHORA = Date.UTC(2026, 9, 20, 18, 0, 0);

  it("la hora se lee en la zona de Cancún (UTC−5)", () => {
    expect(horaLocal(Date.UTC(2026, 9, 20, 18, 0, 0), "America/Cancun")).toBe(13);
    expect(horaLocal(Date.UTC(2026, 9, 20, 3, 0, 0), "America/Cancun")).toBe(22);
  });

  it("dentro del horario y con cupo, ya", () => {
    expect(esperaParaEnviar({ ...base, ahora: AHORA, enviados: [], hora: 13 })).toBe(0);
  });

  it("de noche espera y vuelve a revisar", () => {
    expect(esperaParaEnviar({ ...base, ahora: AHORA, enviados: [], hora: 23 })).toBe(10 * 60_000);
    expect(esperaParaEnviar({ ...base, ahora: AHORA, enviados: [], hora: 6 })).toBe(10 * 60_000);
  });

  it("con el tope por hora lleno espera a que salga el más viejo", () => {
    const enviados = [AHORA - 50 * 60_000, AHORA - 30 * 60_000, AHORA - 10 * 60_000];
    const espera = esperaParaEnviar({ ...base, ahora: AHORA, enviados, hora: 13 });
    expect(espera).toBe(10 * 60_000 + 1000);
  });

  it("los envíos de hace más de una hora ya no cuentan", () => {
    const enviados = [AHORA - 90 * 60_000, AHORA - 80 * 60_000, AHORA - 70 * 60_000];
    expect(esperaParaEnviar({ ...base, ahora: AHORA, enviados, hora: 13 })).toBe(0);
  });
});
