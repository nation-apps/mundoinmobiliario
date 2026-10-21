import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));

const fusionar = vi.fn(async () => {});
const agregarNota = vi.fn(async () => {});
const buscar = vi.fn();
vi.mock("../src/db/repositories/clientes.js", () => ({ fusionarClientes: fusionar, agregarNotaCliente: agregarNota }));
vi.mock("../src/db/repositories/conversaciones.js", () => ({ buscarFormularioAbiertoReciente: buscar }));

const { unirFormularioPorMensaje } = await import("../src/agent/unirFormularioPorMensaje.js");

const MENSAJE = "¡Hola! Completé el formulario y me gustaría obtener más información.\n\nPhone number: +529987925472\nEmail: o.brandy@gmail.com";

beforeEach(() => {
  fusionar.mockClear();
  agregarNota.mockClear();
  buscar.mockReset();
});

describe("unirFormularioPorMensaje", () => {
  it("escribe desde otro número: fusiona el registro del formulario con el del número que escribe", async () => {
    buscar.mockResolvedValue({ conversacionId: "conv-form", clienteId: "cli-form" });
    expect(await unirFormularioPorMensaje({ id: "cli-wa", telefono: "529381328913" }, MENSAJE)).toBe(true);
    expect(fusionar).toHaveBeenCalledWith("cli-form", "cli-wa");
    expect(buscar).toHaveBeenCalledWith(expect.objectContaining({ telefono: "529987925472", email: "o.brandy@gmail.com", excluirClienteId: "cli-wa" }));
    expect(agregarNota).toHaveBeenCalledOnce();
  });

  it("escribe desde el mismo número del formulario: no hace nada (lo une el flujo normal)", async () => {
    expect(await unirFormularioPorMensaje({ id: "cli-wa", telefono: "529987925472" }, MENSAJE)).toBe(false);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("sin formulario reciente que coincida no fusiona", async () => {
    buscar.mockResolvedValue(null);
    expect(await unirFormularioPorMensaje({ id: "cli-wa", telefono: "529381328913" }, MENSAJE)).toBe(false);
    expect(fusionar).not.toHaveBeenCalled();
  });

  it("un mensaje normal no consulta nada", async () => {
    expect(await unirFormularioPorMensaje({ id: "cli-wa", telefono: "529381328913" }, "Hola, quiero información")).toBe(false);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("si la fusión falla, no lanza: el chat sigue", async () => {
    buscar.mockResolvedValue({ conversacionId: "c", clienteId: "f" });
    fusionar.mockRejectedValueOnce(new Error("boom"));
    expect(await unirFormularioPorMensaje({ id: "cli-wa", telefono: "529381328913" }, MENSAJE)).toBe(false);
  });
});
