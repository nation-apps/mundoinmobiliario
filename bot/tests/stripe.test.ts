import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
const envFalso = { STRIPE_SECRET_KEY: "sk_test_123456789", STRIPE_PRICE_ID: undefined as string | undefined, STRIPE_PRECIO_CENTAVOS: 3900 };
vi.mock("../src/config/env.js", () => ({ env: envFalso }));

const repo = {
  leerSuscripcion: vi.fn(),
  registrarEventoStripe: vi.fn(async () => true),
  olvidarEventoStripe: vi.fn(async () => {}),
  guardarSuscripcion: vi.fn(async () => {}),
};
vi.mock("../src/db/repositories/suscripcion.js", () => repo);

const { verificarFirmaStripe } = await import("../src/stripe/firma.js");
const { estadoDesdeStripe, cambioDesdeEvento, accesoPermitido } = await import("../src/stripe/estado.js");
const { aplicarEventoStripe } = await import("../src/stripe/aplicar.js");
const { crearCheckout, crearPortal, codificarFormulario } = await import("../src/stripe/cliente.js");

const SECRETO = "whsec_prueba_1234567890";
function firmar(cuerpo: string, t: number, secreto = SECRETO) {
  const v1 = createHmac("sha256", secreto).update(`${t}.${cuerpo}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.registrarEventoStripe.mockResolvedValue(true);
  repo.leerSuscripcion.mockResolvedValue({
    estado: "sin_suscripcion", stripe_customer_id: null, stripe_subscription_id: null, periodo_fin: null,
    cancela_al_final: false, pendiente_desde: null, email: null, ultimo_evento_at: null,
  });
});

describe("firma del webhook de Stripe", () => {
  const ahora = 1_760_000_000_000;
  const t = Math.floor(ahora / 1000);
  const cuerpo = JSON.stringify({ id: "evt_1", type: "invoice.paid" });

  it("acepta una firma correcta", () => {
    expect(verificarFirmaStripe(Buffer.from(cuerpo), firmar(cuerpo, t), SECRETO, ahora)).toBe(true);
  });
  it("acepta si hay varias firmas y una es válida", () => {
    const enc = `${firmar(cuerpo, t)},v1=${"0".repeat(64)}`;
    expect(verificarFirmaStripe(Buffer.from(cuerpo), enc, SECRETO, ahora)).toBe(true);
  });
  it("rechaza otro secreto, otro cuerpo, sin encabezado y un aviso viejo", () => {
    expect(verificarFirmaStripe(Buffer.from(cuerpo), firmar(cuerpo, t, "whsec_otro_000000"), SECRETO, ahora)).toBe(false);
    expect(verificarFirmaStripe(Buffer.from(cuerpo + " "), firmar(cuerpo, t), SECRETO, ahora)).toBe(false);
    expect(verificarFirmaStripe(Buffer.from(cuerpo), undefined, SECRETO, ahora)).toBe(false);
    expect(verificarFirmaStripe(Buffer.from(cuerpo), firmar(cuerpo, t - 600), SECRETO, ahora)).toBe(false);
    expect(verificarFirmaStripe(undefined, firmar(cuerpo, t), SECRETO, ahora)).toBe(false);
    expect(verificarFirmaStripe(Buffer.from(cuerpo), firmar(cuerpo, t), undefined, ahora)).toBe(false);
  });
});

describe("estados", () => {
  it("traduce los estados de Stripe", () => {
    expect(estadoDesdeStripe("active")).toBe("activa");
    expect(estadoDesdeStripe("trialing")).toBe("en_prueba");
    expect(estadoDesdeStripe("past_due")).toBe("pago_pendiente");
    expect(estadoDesdeStripe("unpaid")).toBe("impago");
    expect(estadoDesdeStripe("canceled")).toBe("cancelada");
    expect(estadoDesdeStripe("incomplete")).toBe("incompleta");
    expect(estadoDesdeStripe("lo-que-sea")).toBe("sin_suscripcion");
  });

  it("lee la suscripción: cliente, fin de periodo (en la suscripción o en el ítem) y cancelación al final", () => {
    const a = cambioDesdeEvento({
      id: "e", type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "active", customer: "cus_1", current_period_end: 1_760_000_000, cancel_at_period_end: true } },
    });
    expect(a).toEqual({
      estado: "activa", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1",
      periodo_fin: new Date(1_760_000_000_000).toISOString(), cancela_al_final: true,
    });
    const b = cambioDesdeEvento({
      id: "e", type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "active", customer: { id: "cus_1" }, items: { data: [{ current_period_end: 1_770_000_000 }] } } },
    });
    expect(b?.periodo_fin).toBe(new Date(1_770_000_000_000).toISOString());
    expect(b?.stripe_customer_id).toBe("cus_1");
  });

  it("ignora lo que no interesa y trata una baja como cancelada", () => {
    expect(cambioDesdeEvento({ id: "e", type: "charge.succeeded", data: { object: {} } })).toBeNull();
    expect(cambioDesdeEvento({ id: "e", type: "checkout.session.completed", data: { object: { mode: "payment" } } })).toBeNull();
    expect(cambioDesdeEvento({ id: "e", type: "customer.subscription.deleted", data: { object: { id: "s", status: "canceled" } } })?.estado).toBe("cancelada");
    expect(cambioDesdeEvento({ id: "e", type: "invoice.payment_failed", data: { object: {} } })).toEqual({ estado: "pago_pendiente" });
  });

  it("acceso: activa y en prueba sí; pago pendiente con gracia de 5 días; el resto no", () => {
    const ahora = new Date("2026-10-20T12:00:00Z");
    expect(accesoPermitido({ estado: "activa", pendiente_desde: null }, ahora)).toBe(true);
    expect(accesoPermitido({ estado: "en_prueba", pendiente_desde: null }, ahora)).toBe(true);
    expect(accesoPermitido({ estado: "pago_pendiente", pendiente_desde: "2026-10-17T12:00:00Z" }, ahora)).toBe(true);
    expect(accesoPermitido({ estado: "pago_pendiente", pendiente_desde: "2026-10-14T11:00:00Z" }, ahora)).toBe(false);
    expect(accesoPermitido({ estado: "pago_pendiente", pendiente_desde: null }, ahora)).toBe(true);
    for (const e of ["sin_suscripcion", "impago", "cancelada", "incompleta"] as const) {
      expect(accesoPermitido({ estado: e, pendiente_desde: null }, ahora)).toBe(false);
    }
  });
});

describe("aplicar eventos", () => {
  const sub = (status: string, extra: Record<string, unknown> = {}) => ({
    id: "evt_x", type: "customer.subscription.updated", created: 1_760_000_100,
    data: { object: { id: "sub_1", status, customer: "cus_1", current_period_end: 1_762_000_000, ...extra } },
  });

  it("guarda el estado nuevo y limpia «pendiente_desde»", async () => {
    expect(await aplicarEventoStripe(sub("active"))).toBe("aplicado");
    expect(repo.guardarSuscripcion).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "activa", stripe_customer_id: "cus_1", pendiente_desde: null }),
    );
  });

  it("al volverse pendiente fija la fecha y no la mueve en los reintentos", async () => {
    await aplicarEventoStripe(sub("past_due"));
    const primera = (repo.guardarSuscripcion.mock.calls[0] as unknown as [{ pendiente_desde: string }])[0].pendiente_desde;
    expect(primera).toBe(new Date(1_760_000_100_000).toISOString());

    repo.leerSuscripcion.mockResolvedValue({
      estado: "pago_pendiente", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", periodo_fin: null,
      cancela_al_final: false, pendiente_desde: primera, email: null, ultimo_evento_at: primera,
    });
    await aplicarEventoStripe({ ...sub("past_due"), id: "evt_y", created: 1_760_050_000 });
    const segunda = (repo.guardarSuscripcion.mock.calls[1] as unknown as [{ pendiente_desde: string }])[0].pendiente_desde;
    expect(segunda).toBe(primera);
  });

  it("no aplica dos veces el mismo evento", async () => {
    repo.registrarEventoStripe.mockResolvedValue(false);
    expect(await aplicarEventoStripe(sub("active"))).toBe("repetido");
    expect(repo.guardarSuscripcion).not.toHaveBeenCalled();
  });

  it("descarta un aviso más viejo que el último aplicado", async () => {
    repo.leerSuscripcion.mockResolvedValue({
      estado: "activa", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", periodo_fin: null,
      cancela_al_final: false, pendiente_desde: null, email: null, ultimo_evento_at: new Date(1_760_000_500_000).toISOString(),
    });
    expect(await aplicarEventoStripe(sub("past_due"))).toBe("viejo");
    expect(repo.guardarSuscripcion).not.toHaveBeenCalled();
  });

  it("no deja que una suscripción anterior pise a la vigente", async () => {
    repo.leerSuscripcion.mockResolvedValue({
      estado: "activa", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_NUEVA", periodo_fin: null,
      cancela_al_final: false, pendiente_desde: null, email: null, ultimo_evento_at: null,
    });
    const viejo = { id: "evt_z", type: "customer.subscription.deleted", created: 1_760_000_100, data: { object: { id: "sub_VIEJA", status: "canceled", customer: "cus_1" } } };
    expect(await aplicarEventoStripe(viejo)).toBe("otra_suscripcion");
    expect(repo.guardarSuscripcion).not.toHaveBeenCalled();
  });

  it("el cobro completado liga ids sin pisar un estado ya activo", async () => {
    repo.leerSuscripcion.mockResolvedValue({
      estado: "activa", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", periodo_fin: null,
      cancela_al_final: false, pendiente_desde: null, email: null, ultimo_evento_at: null,
    });
    await aplicarEventoStripe({
      id: "evt_c", type: "checkout.session.completed", created: 1_760_000_100,
      data: { object: { mode: "subscription", customer: "cus_1", subscription: "sub_1", customer_email: "a@b.mx" } },
    });
    const parche = repo.guardarSuscripcion.mock.calls[0]![0] as Record<string, unknown>;
    expect(parche.estado).toBeUndefined();
    expect(parche).toMatchObject({ stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", email: "a@b.mx" });
  });

  it("si falla al guardar, olvida el evento para que Stripe lo reintente", async () => {
    repo.guardarSuscripcion.mockRejectedValueOnce(new Error("base caída"));
    await expect(aplicarEventoStripe(sub("active"))).rejects.toThrow("base caída");
    expect(repo.olvidarEventoStripe).toHaveBeenCalledWith("evt_x");
  });
});

describe("cliente de Stripe", () => {
  it("codifica el formulario anidado como lo espera Stripe", () => {
    const partes = codificarFormulario({ mode: "subscription", line_items: [{ quantity: 1, price_data: { currency: "usd" } }] });
    expect(decodeURIComponent(partes.join("&"))).toBe(
      "mode=subscription&line_items[0][quantity]=1&line_items[0][price_data][currency]=usd",
    );
  });

  it("crea la sesión de pago de 39 USD al mes con el correo de quien paga", async () => {
    const fetchFalso = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }) }));
    vi.stubGlobal("fetch", fetchFalso);
    const r = await crearCheckout({ correo: "admin@negocio.mx", clienteId: null, volverA: "https://panel.test/admin/suscripcion" });
    expect(r.url).toContain("checkout.stripe.com");
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.headers.Authorization).toBe("Bearer sk_test_123456789");
    const cuerpo = decodeURIComponent(init.body);
    expect(cuerpo).toContain("mode=subscription");
    expect(cuerpo).toContain("line_items[0][price_data][unit_amount]=3900");
    expect(cuerpo).toContain("line_items[0][price_data][recurring][interval]=month");
    expect(cuerpo).toContain("line_items[0][price_data][currency]=usd");
    expect(cuerpo).toContain("customer_email=admin@negocio.mx");
    expect(cuerpo).toContain("success_url=https://panel.test/admin/suscripcion?pago=ok");
  });

  it("reutiliza al cliente de Stripe y usa el precio configurado", async () => {
    envFalso.STRIPE_PRICE_ID = "price_abc";
    const fetchFalso = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ url: "https://x" }) }));
    vi.stubGlobal("fetch", fetchFalso);
    await crearCheckout({ correo: "a@b.mx", clienteId: "cus_9", volverA: "https://p/admin/suscripcion" });
    const cuerpo = decodeURIComponent((fetchFalso.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(cuerpo).toContain("line_items[0][price]=price_abc");
    expect(cuerpo).toContain("customer=cus_9");
    expect(cuerpo).not.toContain("customer_email");
    envFalso.STRIPE_PRICE_ID = undefined;
  });

  it("un error de Stripe sale sin datos y el portal pide al cliente", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: "resource_missing", message: "No such customer: cus_1" } }) })));
    await expect(crearPortal({ clienteId: "cus_1", volverA: "https://p" })).rejects.toThrow("resource_missing");
  });
});
