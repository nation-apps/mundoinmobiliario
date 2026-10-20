import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({ env: { BOT_ACTIVO_POR_DEFECTO: false } }));

type Llamada = { op: string; args: unknown[] };
const consultas: { filas: unknown[]; llamadas: Llamada[] }[] = [];
let filasPorTurno: unknown[][] = [];
let actualizaciones: Record<string, unknown>[] = [];
let errorDeActualizacion: { code: string } | null = null;

/** Un query builder que se puede esperar con `await` y que devuelve las filas del turno, como el de supabase-js. */
function builder() {
  const consulta = { filas: filasPorTurno.shift() ?? [], llamadas: [] as Llamada[] };
  consultas.push(consulta);
  let esActualizacion = false;
  const b: Record<string, unknown> = {};
  for (const op of ["select", "eq", "in", "order", "limit", "update"]) {
    b[op] = (...args: unknown[]) => {
      if (op === "update") {
        esActualizacion = true;
        actualizaciones.push(args[0] as Record<string, unknown>);
      }
      consulta.llamadas.push({ op, args });
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => unknown) =>
    resolve(esActualizacion ? { data: errorDeActualizacion ? null : consulta.filas, error: errorDeActualizacion } : { data: consulta.filas, error: null });
  return b;
}
vi.mock("../src/db/client.js", () => ({ supabase: { from: () => builder() } }));

const { unirFormularioConWhatsapp } = await import("../src/db/repositories/conversaciones.js");

beforeEach(() => {
  consultas.length = 0;
  filasPorTurno = [];
  actualizaciones = [];
  errorDeActualizacion = null;
});

describe("unirFormularioConWhatsapp", () => {
  it("sin un formulario abierto no hace nada", async () => {
    filasPorTurno = [[]];
    expect(await unirFormularioConWhatsapp("cli-1")).toBeNull();
    expect(actualizaciones).toEqual([]);
  });

  it("busca solo formularios abiertos del cliente, en el canal web", async () => {
    filasPorTurno = [[]];
    await unirFormularioConWhatsapp("cli-1");
    const llamadas = consultas[0]!.llamadas;
    expect(llamadas).toContainEqual({ op: "eq", args: ["cliente_id", "cli-1"] });
    expect(llamadas).toContainEqual({ op: "eq", args: ["canal", "web"] });
    expect(llamadas).toContainEqual({ op: "eq", args: ["origen", "formulario"] });
    expect(llamadas).toContainEqual({ op: "in", args: ["estado", ["activa", "escalada"]] });
  });

  it("el formulario se vuelve el chat de WhatsApp (conserva su origen: no se toca `fuente`)", async () => {
    filasPorTurno = [[{ id: "form-1" }], [], [{ id: "form-1" }]];
    expect(await unirFormularioConWhatsapp("cli-1")).toBe("form-1");
    expect(actualizaciones).toEqual([{ canal: "whatsapp", origen: "dm", hilo_externo: null, cuenta_id: null }]);
    expect(actualizaciones[0]).not.toHaveProperty("fuente");
  });

  it("si ya tiene otro chat de WhatsApp abierto, no lo toca (no habría dónde ponerlo)", async () => {
    filasPorTurno = [[{ id: "form-1" }], [{ id: "wa-1" }]];
    expect(await unirFormularioConWhatsapp("cli-1")).toBeNull();
    expect(actualizaciones).toEqual([]);
  });

  it("si la base rechaza el cambio por duplicado, devuelve null en vez de fallar", async () => {
    filasPorTurno = [[{ id: "form-1" }], [], []];
    errorDeActualizacion = { code: "23505" };
    expect(await unirFormularioConWhatsapp("cli-1")).toBeNull();
  });
});
