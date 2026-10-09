import { describe, expect, it } from "vitest";
import { contenidoDelLead, datosDelLead, type CampoLead } from "../src/meta/leadAds.js";

const campos: CampoLead[] = [
  { name: "¿cuál_es_tu_experiencia_invirtiendo?", values: ["ninguna,_quiero_empezar"] },
  { name: "full_name", values: ["Ana López"] },
  { name: "phone_number", values: ["+5215512345678"] },
  { name: "email", values: ["ana_lopez@correo.com"] },
];

describe("datosDelLead", () => {
  it("toma nombre, teléfono normalizado (52 + 10) y correo de los campos estándar", () => {
    expect(datosDelLead(campos)).toEqual({ nombre: "Ana López", telefono: "525512345678", email: "ana_lopez@correo.com" });
  });

  it("arma el nombre con nombre y apellido si no hay full_name", () => {
    const datos = datosDelLead([
      { name: "first_name", values: ["Ana"] },
      { name: "last_name", values: ["López"] },
    ]);
    expect(datos.nombre).toBe("Ana López");
  });

  it("si el formulario pide el WhatsApp con una pregunta propia, lo usa como teléfono", () => {
    const datos = datosDelLead([{ name: "¿cuál_es_tu_whatsapp?", values: ["55 1234 5678"] }]);
    expect(datos.telefono).toBe("525512345678");
  });

  it("sin teléfono ni correo válidos devuelve null en vez de inventar", () => {
    const datos = datosDelLead([
      { name: "full_name", values: ["Ana"] },
      { name: "email", values: ["no-es-correo"] },
    ]);
    expect(datos).toEqual({ nombre: "Ana", telefono: null, email: null });
  });
});

describe("contenidoDelLead", () => {
  it("una línea por respuesta, en el orden del formulario, con las preguntas propias legibles", () => {
    expect(contenidoDelLead(campos)).toBe(
      [
        "¿Cuál es tu experiencia invirtiendo?: Ninguna, quiero empezar",
        "Nombre: Ana López",
        "Teléfono: +5215512345678",
        // Un campo estándar no se toca: el guion bajo es parte del correo.
        "Correo: ana_lopez@correo.com",
      ].join("\n"),
    );
  });

  it("omite respuestas vacías y avisa si no quedó ninguna", () => {
    expect(contenidoDelLead([{ name: "city", values: [" "] }])).toBe("Envió el formulario del anuncio sin respuestas.");
  });
});
