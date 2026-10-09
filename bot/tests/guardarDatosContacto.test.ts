import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "../src/agent/tools/types.js";

vi.mock("../src/lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const clientes = {
  getClienteByTelefono: vi.fn(),
  guardarTelefonoCliente: vi.fn(),
  guardarNombreCliente: vi.fn(),
  guardarEmailCliente: vi.fn(),
  guardarInteresCliente: vi.fn(),
  fusionarClientes: vi.fn(),
  INTERESES: ["moto_nueva", "seminueva", "financiamiento", "taller", "refacciones", "otro"] as const,
};
vi.mock("../src/db/repositories/clientes.js", () => clientes);

const { guardarDatosContactoTool } = await import("../src/agent/tools/guardarDatosContacto.js");

function contexto(canal: AgentContext["canal"], telefono: string | null = null): AgentContext {
  return { canal, conversacionId: "conv-1", clienteId: "lead-1", telefono, contactName: undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientes.getClienteByTelefono.mockResolvedValue(null);
  clientes.guardarTelefonoCliente.mockResolvedValue(undefined);
  clientes.guardarNombreCliente.mockResolvedValue(undefined);
  clientes.guardarEmailCliente.mockResolvedValue(undefined);
  clientes.guardarInteresCliente.mockResolvedValue(undefined);
});

/**
 * El número que dice alguien en el chat no está verificado. Antes, decir un
 * número ajeno fusionaba la ficha del que escribe dentro de la del dueño real
 * y el resto del turno operaba como ese cliente (sus citas, sus matrículas,
 * su nombre y correo).
 */
describe("guardar_datos_contacto", () => {
  it("no fusiona ni cambia de cliente cuando el número ya es de otro", async () => {
    clientes.getClienteByTelefono.mockResolvedValue({ id: "victima", telefono: "525512345678" });
    const ctx = contexto("instagram");

    const resultado = (await guardarDatosContactoTool.handler({ telefono: "55 1234 5678", nombre: "Otra Persona" }, ctx)) as {
      ok: boolean;
      error?: string;
    };

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe("telefono_no_verificable");
    expect(clientes.fusionarClientes).not.toHaveBeenCalled();
    expect(clientes.guardarTelefonoCliente).not.toHaveBeenCalled();
    expect(ctx.clienteId).toBe("lead-1");
    expect(ctx.telefono).toBeNull();
    // El nombre se guarda en la ficha propia, nunca en la del dueño del número.
    expect(clientes.guardarNombreCliente).toHaveBeenCalledWith("lead-1", "Otra Persona");
  });

  it("guarda un número libre en la ficha del lead", async () => {
    const ctx = contexto("instagram");

    const resultado = (await guardarDatosContactoTool.handler({ telefono: "55 9876 5432" }, ctx)) as { ok: boolean };

    expect(resultado.ok).toBe(true);
    expect(clientes.guardarTelefonoCliente).toHaveBeenCalledWith("lead-1", "525598765432");
    expect(ctx.telefono).toBe("525598765432");
    expect(ctx.clienteId).toBe("lead-1");
  });

  it("en WhatsApp ignora el teléfono del texto: el número es el del remitente", async () => {
    clientes.getClienteByTelefono.mockResolvedValue({ id: "victima", telefono: "525512345678" });
    const ctx = contexto("whatsapp", "525511111111");

    const resultado = (await guardarDatosContactoTool.handler({ telefono: "5512345678", email: "a@b.mx" }, ctx)) as { ok: boolean };

    expect(resultado.ok).toBe(true);
    expect(clientes.getClienteByTelefono).not.toHaveBeenCalled();
    expect(clientes.fusionarClientes).not.toHaveBeenCalled();
    expect(clientes.guardarTelefonoCliente).not.toHaveBeenCalled();
    expect(ctx.telefono).toBe("525511111111");
    expect(ctx.clienteId).toBe("lead-1");
    expect(clientes.guardarEmailCliente).toHaveBeenCalledWith("lead-1", "a@b.mx");
  });
});
