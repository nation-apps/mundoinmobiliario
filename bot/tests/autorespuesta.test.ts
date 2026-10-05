import { describe, expect, it } from "vitest";
import { esRespuestaAutomatica } from "../src/lib/autorespuesta.js";

describe("respuesta automática de otro negocio", () => {
  it.each([
    "Gracias por comunicarte  con agathaskids.pe en breve te respondemos",
    "Gracias por comunicarte con Mi Tienda. En breve te atenderemos.",
    "Este es un mensaje automático, te responderemos pronto",
    "Respuesta automática: estamos fuera de horario",
    "Gracias por escribirnos con nosotros, en breve le respondemos",
  ])("%j se reconoce", (t) => expect(esRespuestaAutomatica(t)).toBe(true));

  it.each([
    "Hola, quiero información",
    "Gracias",
    "Gracias por la información, voy a pensarlo",
    "Precio para decidir",
    "Avísame más adelante",
    "¿Cuánto cuesta la entrada?",
    "Gracias por responder tan rápido",
  ])("%j es una persona", (t) => expect(esRespuestaAutomatica(t)).toBe(false));
});
