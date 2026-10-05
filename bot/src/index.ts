import Fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import { env, metaConfigurado, whatsappConfigurado } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { AppError } from "./lib/errors.js";
import { healthRoutes } from "./routes/health.js";
import { webhookRoutes } from "./routes/webhook.js";
import { metaWebhookRoutes } from "./routes/metaWebhook.js";
import { adminRoutes } from "./routes/admin.js";
import { publicRoutes } from "./routes/public.js";
import { estadoConexion } from "./meta/client.js";
import { actualizarEstadoCanal } from "./db/repositories/canales.js";
import { registrarNumeroSiHaceFalta } from "./whatsapp/registro.js";
import { iniciarReenvios } from "./seguimientos/reenvios.js";

// Sin el log automático de requests: Fastify escribe `req.url` completo y el
// handshake de Meta trae el token de verificación en la query
// (`hub.verify_token`). Se reemplaza por un hook que loguea la ruta sin query.
const app = Fastify({
  loggerInstance: logger,
  trustProxy: true,
  logController: new LogController({ disableRequestLogging: true }),
});

app.addHook("onResponse", (request, reply, done) => {
  request.log.info(
    { method: request.method, ruta: request.routeOptions.url ?? request.url.split("?")[0], statusCode: reply.statusCode },
    "request atendido",
  );
  done();
});

// Captura el body crudo antes de parsearlo como JSON: la validación de
// firma de Meta (X-Hub-Signature-256) se calcula sobre los bytes exactos
// del request, no sobre el objeto ya parseado.
app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
  request.rawBody = body as Buffer;
  try {
    const json = body.length ? JSON.parse(body.toString("utf8")) : {};
    done(null, json);
  } catch (err) {
    done(err as Error, undefined);
  }
});

// El panel llama al bot
// desde el servidor (sin CORS), pero se deja la lista blanca por si se
// llama desde el navegador. Sin nada configurado no se permite ningún
// origen cruzado; los webhooks de Meta no usan CORS.
const corsOrigins = [...env.ADMIN_ORIGINS.split(","), ...env.WEB_ORIGINS.split(",")].map((o) => o.trim()).filter(Boolean);

await app.register(cors, {
  origin: corsOrigins,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

await app.register(healthRoutes);
await app.register(webhookRoutes);
await app.register(metaWebhookRoutes);
await app.register(adminRoutes);
await app.register(publicRoutes);

app.setErrorHandler((err, request, reply) => {
  if (err instanceof AppError) {
    logger.warn({ err: err.message, code: err.code, url: request.url.split("?")[0] }, "Error controlado");
    return reply.status(err.statusCode).send({ error: err.code });
  }
  logger.error({ err, url: request.url.split("?")[0] }, "Error no manejado");
  return reply.status(500).send({ error: "internal_error" });
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info({ port: env.PORT }, "byb-escuela-bot escuchando");
} catch (err) {
  logger.error({ err }, "No se pudo iniciar el servidor");
  process.exit(1);
}

// Nada de esto bloquea el arranque: el healthcheck de Railway no debe
// depender de Meta.
if (whatsappConfigurado) {
  registrarNumeroSiHaceFalta().catch((err: unknown) => logger.error({ err }, "Falló el registro del número de WhatsApp"));
}

iniciarReenvios();

if (metaConfigurado) {
  estadoConexion()
    .then((estado) => {
      if (!estado) return;
      const escrituras: Promise<void>[] = [];
      if (estado.pagina) {
        escrituras.push(actualizarEstadoCanal("messenger", { cuentaId: estado.pagina.id, cuentaNombre: estado.pagina.nombre ?? undefined }));
      }
      if (estado.instagram) {
        escrituras.push(
          actualizarEstadoCanal("instagram", { cuentaId: estado.instagram.id, cuentaNombre: estado.instagram.username ?? undefined }),
        );
      }
      return Promise.all(escrituras);
    })
    .catch((err: unknown) => logger.error({ err }, "No se pudo consultar el estado inicial de conexión de Meta"));
}
