import { afterEach, describe, expect, it } from "vitest";
import {
  LINEA_POR_DEFECTO,
  esLineaValida,
  idsDeLineas,
  lineaPorFuente,
  lineaPorMarca,
  lineasConfiguradas,
  marcaDeLinea,
} from "../src/lib/lineas.js";
import { fuentePorCanal, fuenteWhatsappDirecto } from "../src/lib/fuente.js";

afterEach(() => {
  delete process.env.WHATSAPP_LINEAS;
});

describe("líneas de WhatsApp", () => {
  it("hay dos: TVS y Mundo de Motos, con el número del documento del cliente", () => {
    expect(lineasConfiguradas().map((l) => [l.id, l.marca, l.telefono])).toEqual([
      ["tvs", "TVS", "529987584160"],
      ["mundo", "Mundo de Motos", "529988706920"],
    ]);
    expect(LINEA_POR_DEFECTO).toBe("tvs");
    expect(idsDeLineas()).toEqual(["tvs", "mundo"]);
  });

  it("la marca de una línea, y la línea de una marca", () => {
    expect(marcaDeLinea("tvs")).toBe("TVS");
    expect(marcaDeLinea("mundo")).toBe("Mundo de Motos");
    expect(marcaDeLinea("otra")).toBeNull();
    expect(marcaDeLinea(null)).toBeNull();
    expect(lineaPorMarca("TVS")).toBe("tvs");
    expect(lineaPorMarca(" mundo de motos ")).toBe("mundo");
    expect(lineaPorMarca(null)).toBeNull();
  });

  it("valida los identificadores que llegan de fuera", () => {
    expect(esLineaValida("tvs")).toBe(true);
    expect(esLineaValida("mundo")).toBe(true);
    expect(esLineaValida("TVS")).toBe(false);
    expect(esLineaValida("x; drop")).toBe(false);
    expect(esLineaValida(undefined)).toBe(false);
  });

  it("la línea que le toca a un lead sale de su origen", () => {
    expect(lineaPorFuente("Campaña Formulario Meta TVS")).toBe("tvs");
    expect(lineaPorFuente("Campaña WhatsApp Meta TVS")).toBe("tvs");
    expect(lineaPorFuente("WhatsApp Directo TVS")).toBe("tvs");
    expect(lineaPorFuente("Campaña Formulario Meta Mundo de Motos")).toBe("mundo");
    expect(lineaPorFuente("WhatsApp Directo Mundo de Motos")).toBe("mundo");
    expect(lineaPorFuente("Formulario web")).toBeNull();
    expect(lineaPorFuente("WhatsApp directo")).toBeNull();
    expect(lineaPorFuente(null)).toBeNull();
  });

  it("WHATSAPP_LINEAS cambia o suma líneas; un JSON malo se ignora", () => {
    process.env.WHATSAPP_LINEAS = JSON.stringify([{ id: "otra", marca: "Otra", telefono: "+52 999 999 9999" }]);
    expect(lineasConfiguradas()).toEqual([{ id: "otra", marca: "Otra", etiqueta: "Otra", telefono: "529999999999" }]);
    process.env.WHATSAPP_LINEAS = "{no es json";
    expect(idsDeLineas()).toEqual(["tvs", "mundo"]);
    process.env.WHATSAPP_LINEAS = JSON.stringify([{ id: "MAL", marca: "x" }]);
    expect(idsDeLineas()).toEqual(["tvs", "mundo"]);
  });
});

describe("origen de quien escribe directo a una línea", () => {
  it("«WhatsApp Directo TVS» y «WhatsApp Directo Mundo de Motos»", () => {
    expect(fuentePorCanal("whatsapp", "dm", null, "tvs")).toBe("WhatsApp Directo TVS");
    expect(fuentePorCanal("whatsapp", "dm", null, "mundo")).toBe("WhatsApp Directo Mundo de Motos");
  });

  it("sin saber la línea queda como siempre", () => {
    expect(fuentePorCanal("whatsapp", "dm")).toBe("WhatsApp directo");
    expect(fuenteWhatsappDirecto(null)).toBe("WhatsApp directo");
  });

  it("los demás canales no cambian", () => {
    expect(fuentePorCanal("messenger", "dm", null, "tvs")).toBe("Messenger");
    expect(fuentePorCanal("web", "formulario", null, "tvs")).toBe("Formulario web");
  });
});
