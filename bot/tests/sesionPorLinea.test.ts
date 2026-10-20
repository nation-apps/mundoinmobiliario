import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearSupabaseFalso } from "./helpers/supabaseFalso.js";

const falso = crearSupabaseFalso();
vi.mock("../src/db/client.js", () => ({ supabase: falso.supabase }));

const { borrarSesionGuardada, haySesionGuardada } = await import("../src/whatsapp-qr/authSupabase.js");

beforeEach(() => falso.reiniciar());

describe("sesión guardada por línea", () => {
  it("la línea de TVS usa las claves de siempre (la sesión que ya estaba conectada no se pierde)", async () => {
    falso.busqueda = [{ clave: "creds" }];
    expect(await haySesionGuardada("tvs")).toBe(true);
    expect(falso.filtro("eq", "clave")?.args[1]).toBe("creds");
  });

  it("las demás líneas guardan lo suyo con su prefijo", async () => {
    falso.busqueda = [null];
    expect(await haySesionGuardada("mundo")).toBe(false);
    expect(falso.filtro("eq", "clave")?.args[1]).toBe("mundo:creds");
  });

  it("desvincular Mundo de Motos solo borra lo que lleva su prefijo", async () => {
    await borrarSesionGuardada("mundo");
    expect(falso.filtros).toContainEqual({ op: "like", args: ["clave", "mundo:%"] });
    expect(falso.filtros.find((f) => f.op === "neq")).toBeUndefined();
  });

  it("desvincular TVS borra todo MENOS lo de las otras líneas", async () => {
    await borrarSesionGuardada("tvs");
    expect(falso.filtros).toContainEqual({ op: "not", args: ["clave", "like", "mundo:%"] });
    expect(falso.filtros.find((f) => f.op === "like")).toBeUndefined();
  });
});
