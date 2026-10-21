import { describe, expect, it } from "vitest";
import { datosDelFormularioEnMensaje } from "../src/agent/formularioEnMensaje.js";

const MENSAJE = `¡Hola! Completé el formulario y me gustaría obtener más información sobre el negocio.

Full name: Jesus Eduardo Sanchez diaz
¿Cuándo tienes pensado comprar tu moto?: Solo estoy comparando opciones
Phone number: +529987925472
¿Qué modelo TVS te interesa?: Apache RTR 200 4V 2027
Email: O.Brandy1994@gmail.com`;

describe("datosDelFormularioEnMensaje", () => {
  it("saca el teléfono y el correo que la persona puso en el formulario", () => {
    expect(datosDelFormularioEnMensaje(MENSAJE)).toEqual({ telefono: "529987925472", email: "o.brandy1994@gmail.com" });
  });

  it("unifica el formato del teléfono (521… → 52…)", () => {
    expect(datosDelFormularioEnMensaje("Completé el formulario\nPhone number: +5219987925472")).toEqual({ telefono: "529987925472", email: null });
  });

  it("un mensaje cualquiera no cuenta, aunque traiga un teléfono", () => {
    expect(datosDelFormularioEnMensaje("Hola, mi teléfono: 9987925472")).toBeNull();
  });

  it("el mensaje del formulario sin teléfono ni correo no sirve para encontrar a nadie", () => {
    expect(datosDelFormularioEnMensaje("¡Hola! Completé el formulario y quiero información")).toBeNull();
  });
});
