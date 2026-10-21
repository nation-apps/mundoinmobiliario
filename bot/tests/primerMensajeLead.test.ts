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
vi.mock("../src/db/repositories/bienvenida.js", () => ({ leerBienvenida: vi.fn() }));

const { armarSaludo, esperaParaEnviar, horaLocal, interesDelLead, nombreDelAsesor, nombreParaSaludo, rellenarPlantilla, textoPrimerMensaje } = await import(
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
    expect(interesDelLead(FORMULARIO_TVS)).toEqual({ frase: "la moto TVS RTR 310", tipo: "tvs" });
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

describe("nombre del asesor", () => {
  it("sale de lo que va después del guion en «Ventas Cancún 1 - Giovanny»", () => {
    expect(nombreDelAsesor("Ventas Cancún 1 - Giovanny")).toBe("Giovanny");
    expect(nombreDelAsesor("Ventas Cancún 3 - YAEL")).toBe("Yael");
    expect(nombreDelAsesor("Alonso")).toBe("Alonso");
  });
  it("sin un nombre que se pueda leer, null", () => {
    expect(nombreDelAsesor("Ventas Cancún 4")).toBe("Ventas");
    expect(nombreDelAsesor(null)).toBeNull();
    expect(nombreDelAsesor("")).toBeNull();
  });
});

describe("texto del primer mensaje", () => {
  it("TVS: con las palabras del cliente, firmado por el asesor asignado y con salida «NO»", () => {
    const texto = textoPrimerMensaje({ nombre: "MARCOS GONZALEZ", campos: FORMULARIO_TVS, marca: "TVS", asesor: "Ventas Cancún 1 - Giovanny" });
    expect(texto).toContain("Hola Marcos");
    expect(texto).toContain("¡Felicidades por registrarte en TVS Motor Cancún!");
    expect(texto).toContain("Sabemos que estás interesado en la moto TVS RTR 310.");
    expect(texto).toContain("Mi nombre es Giovanny y te atenderé con mucho gusto.");
    expect(texto).toContain("responde NO");
  });

  it("sin asesor asignado no inventa un nombre", () => {
    const texto = textoPrimerMensaje({ nombre: "Marcos", campos: FORMULARIO_TVS, marca: "TVS", asesor: null });
    expect(texto).toContain("Un asesor te atenderá con mucho gusto.");
    expect(texto).not.toContain("Mi nombre es");
  });

  it("refacciones: pide pieza, modelo y año sin prometer precio", () => {
    const texto = textoPrimerMensaje({ nombre: "Ana", campos: FORMULARIO_REFACCIONES, marca: "Mundo de Motos", asesor: "Hanna" });
    expect(texto).toContain("en Mundo de Motos");
    expect(texto).toContain("Sabemos que estás buscando balatas / pastillas de freno para tu Italika FT150.");
    expect(texto).toContain("Mi nombre es Hanna");
    expect(texto).toContain("revisar disponibilidad?");
    expect(texto).not.toMatch(/precio/);
  });

  it("sin nombre ni respuestas, un saludo general", () => {
    const texto = textoPrimerMensaje({ nombre: null, campos: [], marca: null });
    expect(texto.startsWith("Hola 👋 ¡Felicidades por registrarte en Mundo de Motos!")).toBe(true);
    expect(texto).toContain("dejaste tus datos en nuestro anuncio");
  });

  it("un texto propio se rellena con nombre, marca, interés y asesor", () => {
    const texto = textoPrimerMensaje({
      nombre: "Marcos",
      campos: FORMULARIO_TVS,
      marca: "TVS",
      plantilla: "Hola {{nombre}}, de {{marca}}: vimos tu interés en {{interes}}. Te atiende {{asesor}}.",
    });
    expect(texto).toBe("Hola Marcos, de TVS Motor Cancún: vimos tu interés en la moto TVS RTR 310. Te atiende tu asesor.");
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

describe("saludo a leads de formulario según la configuración del administrador", () => {
  const datos = { nombre: "Marcos", campos: FORMULARIO_TVS, marca: "TVS", asesor: "Ventas Cancún 1 - Giovanny" };

  it("apagado: no hay saludo", () => {
    expect(armarSaludo({ formulario_activo: false, formulario_texto: "Hola {{nombre}}" }, datos)).toBeNull();
  });

  it("encendido sin texto: el que el bot arma con las respuestas del formulario", () => {
    const texto = armarSaludo({ formulario_activo: true, formulario_texto: null }, datos);
    expect(texto).toContain("Sabemos que estás interesado en la moto TVS RTR 310.");
    expect(texto).toContain("Mi nombre es Giovanny");
    expect(armarSaludo({ formulario_activo: true, formulario_texto: "   " }, datos)).toBe(texto);
  });

  it("encendido con el texto del administrador: ese texto, con sus datos puestos", () => {
    const texto = armarSaludo(
      { formulario_activo: true, formulario_texto: "¡Hola {{nombre}}! Soy {{asesor}} de {{marca}}. ¿Sigues interesado en {{interes}}?" },
      datos,
    );
    expect(texto).toBe("¡Hola Marcos! Soy Giovanny de TVS Motor Cancún. ¿Sigues interesado en la moto TVS RTR 310?");
  });
});

describe("camposDelContenido", () => {
  it("recupera las respuestas del texto guardado y de ahí sale el interés", async () => {
    const { camposDelContenido } = await import("../src/meta/leadAds.js");
    const { interesDelLead } = await import("../src/agent/primerMensajeLead.js");
    const campos = camposDelContenido(
      "Nombre: Brandy\n¿Cuándo tienes pensado comprar tu moto?: Solo estoy comparando opciones\n¿Qué modelo tvs te interesa?: tvs rtr 310\nCorreo: a@b.com",
    );
    expect(campos).toHaveLength(4);
    expect(interesDelLead(campos)).toEqual({ frase: "la moto TVS RTR 310", tipo: "tvs" });
  });

  it("sin respuestas no inventa campos", async () => {
    const { camposDelContenido } = await import("../src/meta/leadAds.js");
    expect(camposDelContenido("Envió el formulario del anuncio sin respuestas.")).toEqual([]);
  });
});
