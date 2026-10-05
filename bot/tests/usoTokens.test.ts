import { describe, expect, it } from "vitest";
import { pesoDeUso } from "../src/lib/usoTokens.js";

describe("pesoDeUso", () => {
  it("leer de caché pesa 10 % y escribir en la de 1 hora, el doble", () => {
    // Un mensaje en frío: el prompt se escribe en la caché de 1 h.
    const frio = pesoDeUso({
      input_tokens: 600,
      output_tokens: 200,
      cache_creation_input_tokens: 18_000,
      cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 18_000 },
    });
    expect(frio).toBe(600 + 200 + 36_000);
    // El mismo mensaje con la caché caliente: el prompt se lee.
    const caliente = pesoDeUso({ input_tokens: 600, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 18_000 });
    expect(caliente).toBe(600 + 200 + 1_800);
    expect(frio / caliente).toBeGreaterThan(10);
  });

  it("sin desglose por duración trata la escritura como la de 5 minutos (125 %)", () => {
    expect(pesoDeUso({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000 })).toBe(1250);
  });

  it("tolera campos ausentes", () => {
    expect(pesoDeUso({ input_tokens: 10, output_tokens: 5 })).toBe(15);
  });
});
