import { beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn(async () => "wamid");
vi.mock("../src/config/env.js", () => ({ env: { LOG_LEVEL: "silent", ESCALATION_PHONE: "51900000000" } }));
vi.mock("../src/db/client.js", () => ({ supabase: {} }));
vi.mock("../src/whatsapp/window.js", () => ({ sendTextIfWindowOpen: enviar }));

const { esErrorDeSaldo, avisarSinSaldo, reiniciarAvisoSaldo } = await import("../src/lib/saldoAnthropic.js");

describe("esErrorDeSaldo", () => {
  it("reconoce el error real de Anthropic", () => {
    const err = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
    );
    expect(esErrorDeSaldo(err)).toBe(true);
  });

  it("no confunde otras fallas con falta de saldo", () => {
    expect(esErrorDeSaldo(new Error("429 rate_limit_error"))).toBe(false);
    expect(esErrorDeSaldo(new Error("fetch failed"))).toBe(false);
    expect(esErrorDeSaldo("algo raro")).toBe(false);
  });
});

describe("avisarSinSaldo", () => {
  beforeEach(() => {
    enviar.mockClear();
    reiniciarAvisoSaldo();
  });

  it("avisa al número de escalamiento", async () => {
    await avisarSinSaldo();
    expect(enviar).toHaveBeenCalledOnce();
    expect(enviar.mock.calls[0]![1]).toContain("saldo");
  });

  it("no repite el aviso en la misma hora aunque escriban 30 clientas", async () => {
    await Promise.all(Array.from({ length: 30 }, () => avisarSinSaldo()));
    expect(enviar).toHaveBeenCalledOnce();
  });
});
