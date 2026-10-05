import { describe, expect, it } from "vitest";
import { enCola } from "../src/lib/porConversacion.js";

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("enCola", () => {
  it("las tareas de la misma clave corren una detrás de otra, en orden", async () => {
    const orden: string[] = [];
    const a = enCola("conv-1", async () => {
      orden.push("a:inicio");
      await pausa(30);
      orden.push("a:fin");
    });
    const b = enCola("conv-1", async () => {
      orden.push("b:inicio");
      orden.push("b:fin");
    });
    await Promise.all([a, b]);
    expect(orden).toEqual(["a:inicio", "a:fin", "b:inicio", "b:fin"]);
  });

  it("claves distintas corren en paralelo", async () => {
    const orden: string[] = [];
    const a = enCola("conv-1", async () => {
      orden.push("a:inicio");
      await pausa(30);
      orden.push("a:fin");
    });
    const b = enCola("conv-2", async () => {
      orden.push("b");
    });
    await Promise.all([a, b]);
    expect(orden).toEqual(["a:inicio", "b", "a:fin"]);
  });

  it("una tarea que falla no bloquea a la siguiente y su error le llega a quien la pidió", async () => {
    const a = enCola("conv-1", async () => {
      throw new Error("falló");
    });
    const b = enCola("conv-1", async () => "ok");
    await expect(a).rejects.toThrow("falló");
    await expect(b).resolves.toBe("ok");
  });
});
