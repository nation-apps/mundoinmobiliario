import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * GET /admin/canales/estado — el bloque `webhooks` que la página "Canales"
 * del panel muestra para copiar en Meta (contrato `WebhooksInfo` del sitio).
 *
 * Los valores de aquí son de mentira: ningún token real pasa por los tests.
 */

type EnvFalso = {
  PUBLIC_BASE_URL: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  META_VERIFY_TOKEN?: string;
};

const requireStaff = vi.fn(async () => ({ id: "staff-1", email: null }));
const estadoConexion = vi.fn();

/**
 * Cada caso arma su propio entorno: `metaVerifyToken` se calcula al importar
 * config/env.js, así que hay que volver a cargar los módulos con otro mock.
 */
async function levantarApp(envFalso: EnvFalso) {
  vi.resetModules();

  vi.doMock("../src/config/env.js", () => ({
    env: {
      LOG_LEVEL: "silent",
      META_GRAPH_VERSION: "v26.0",
      META_HUMAN_AGENT_APROBADO: false,
      WHATSAPP_TEMPLATE_LANG: "es",
      ...envFalso,
    },
    whatsappConfigurado: false,
    metaConfigurado: false,
    instagramConfigurado: false,
    anthropicConfigurado: false,
    // Misma regla que config/env.ts: el de Meta cae al de WhatsApp.
    metaVerifyToken: envFalso.META_VERIFY_TOKEN ?? envFalso.WHATSAPP_VERIFY_TOKEN,
  }));
  vi.doMock("../src/db/client.js", () => ({ supabase: {} }));
  vi.doMock("../src/lib/adminAuth.js", () => ({ requireStaff }));
  vi.doMock("../src/agent/runner.js", () => ({ runAgent: vi.fn() }));
  vi.doMock("../src/whatsapp/client.js", () => ({
    sendTemplate: vi.fn(),
    listarPlantillas: vi.fn(),
    sendText: vi.fn(),
    sendMedia: vi.fn(),
  }));
  vi.doMock("../src/meta/client.js", () => ({
    responderComentarioPublico: vi.fn(),
    responderComentarioPrivado: vi.fn(),
    estadoConexion,
    marcarVisto: vi.fn(),
    enviarTexto: vi.fn(),
    enviarAdjunto: vi.fn(),
  }));

  const { adminRoutes } = await import("../src/routes/admin.js");
  const app = Fastify();
  await app.register(adminRoutes);
  return app;
}

async function pedirEstado(envFalso: EnvFalso) {
  const app = await levantarApp(envFalso);
  try {
    const res = await app.inject({
      method: "GET",
      url: "/admin/canales/estado",
      headers: { authorization: "Bearer sesion-de-prueba" },
    });
    return { status: res.statusCode, body: res.json() as Record<string, unknown> };
  } finally {
    await app.close();
  }
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /admin/canales/estado — webhooks", () => {
  it("devuelve las URLs de webhook y el token de verificación para copiar en Meta", async () => {
    const { status, body } = await pedirEstado({
      PUBLIC_BASE_URL: "https://bot.ejemplo.test",
      WHATSAPP_VERIFY_TOKEN: "verificacion-de-prueba",
    });

    expect(status).toBe(200);
    expect(requireStaff).toHaveBeenCalledWith("Bearer sesion-de-prueba");
    expect(body.webhooks).toEqual({
      whatsapp: "https://bot.ejemplo.test/webhook",
      meta: "https://bot.ejemplo.test/webhook/meta",
      verifyToken: "verificacion-de-prueba",
      // Sin META_VERIFY_TOKEN, Messenger/Instagram usan el mismo de WhatsApp.
      verifyTokenMeta: "verificacion-de-prueba",
    });
  });

  it("no deja doble barra si PUBLIC_BASE_URL termina en '/'", async () => {
    const { body } = await pedirEstado({
      PUBLIC_BASE_URL: "https://bot.ejemplo.test/",
      WHATSAPP_VERIFY_TOKEN: "verificacion-de-prueba",
    });

    expect(body.webhooks).toMatchObject({
      whatsapp: "https://bot.ejemplo.test/webhook",
      meta: "https://bot.ejemplo.test/webhook/meta",
    });
  });

  it("distingue el token de Messenger/Instagram cuando tiene el suyo", async () => {
    const { body } = await pedirEstado({
      PUBLIC_BASE_URL: "https://bot.ejemplo.test",
      WHATSAPP_VERIFY_TOKEN: "verificacion-de-prueba",
      META_VERIFY_TOKEN: "verificacion-meta-de-prueba",
    });

    expect(body.webhooks).toMatchObject({
      verifyToken: "verificacion-de-prueba",
      verifyTokenMeta: "verificacion-meta-de-prueba",
    });
  });

  it("sin tokens cargados devuelve null (no undefined) y conserva el resto del estado", async () => {
    const { status, body } = await pedirEstado({ PUBLIC_BASE_URL: "https://bot.ejemplo.test" });

    expect(status).toBe(200);
    expect(body.webhooks).toEqual({
      whatsapp: "https://bot.ejemplo.test/webhook",
      meta: "https://bot.ejemplo.test/webhook/meta",
      verifyToken: null,
      verifyTokenMeta: null,
    });
    // Los campos que ya existían siguen ahí, sin cambios de forma.
    expect(body).toMatchObject({
      whatsapp: { configurado: false, numero: null, plantillasDisponibles: false },
      messenger: { configurado: false, pagina: null, suscrito: false, tokenVence: null },
      instagram: { configurado: false, cuenta: null, username: null },
      tiktok: { configurado: false, mensajesDirectos: false },
      web: { protegido: false },
      ia: { configurada: false },
      metaHumanAgentAprobado: false,
    });
    // Con Meta sin configurar no se consulta el Graph API.
    expect(estadoConexion).not.toHaveBeenCalled();
  });

  it("sin sesión de staff no entrega nada", async () => {
    requireStaff.mockRejectedValueOnce(new Error("Falta el token de sesión"));
    const app = await levantarApp({
      PUBLIC_BASE_URL: "https://bot.ejemplo.test",
      WHATSAPP_VERIFY_TOKEN: "verificacion-de-prueba",
    });
    try {
      const res = await app.inject({ method: "GET", url: "/admin/canales/estado" });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.body).not.toContain("verificacion-de-prueba");
      expect(res.body).not.toContain("webhooks");
    } finally {
      await app.close();
    }
  });
});
