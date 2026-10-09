import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("../src/config/env.js", () => ({ env: { RATE_LIMIT_MAX_PER_MINUTE: 20 } }));

const mensajes = { guardarMensaje: vi.fn(), existeExternalId: vi.fn() };
const inbound = { handleInbound: vi.fn() };
const documento = { procesarDocumentoEntrante: vi.fn() };
vi.mock("../src/db/repositories/mensajes.js", () => mensajes);
vi.mock("../src/agent/handleInbound.js", () => inbound);
vi.mock("../src/agent/documentoEntrante.js", () => documento);
vi.mock("../src/agent/handleComentario.js", () => ({ handleComentario: vi.fn() }));
vi.mock("../src/agent/handleLeadFormulario.js", () => ({ handleLeadFormulario: vi.fn() }));
vi.mock("../src/lib/rateLimit.js", () => ({ isRateLimited: () => false }));
vi.mock("../src/meta/identidades.js", () => ({
  resolverIdentidad: vi.fn(async () => ({ cliente: { id: "c1", telefono: null }, identidad: { id: "i1", nombre_perfil: null } })),
}));
vi.mock("../src/db/repositories/conversaciones.js", () => ({ getOrCreateConversacionAbierta: vi.fn(async () => ({ id: "conv-1" })) }));
vi.mock("../src/meta/client.js", () => ({ descargarAdjunto: vi.fn() }));
vi.mock("../src/lib/adjuntos.js", () => ({ subirAdjunto: vi.fn(), mediaTypeDeAttachment: vi.fn() }));

const { parseEventosMeta } = await import("../src/meta/parser.js");
const { handleInboundMeta } = await import("../src/agent/handleInboundMeta.js");

beforeEach(() => vi.clearAllMocks());

/**
 * Cuando el equipo atiende desde la bandeja de Meta Business Suite, Meta manda los mensajes del cliente a las demás
 * apps como `standby`. Antes se ignoraban y en el panel solo se veían las respuestas del equipo.
 */
describe("mensajes en standby (el hilo lo atiende otra app)", () => {
  const payload = {
    object: "page",
    entry: [
      {
        id: "PAGINA",
        time: 1760000000000,
        standby: [
          { sender: { id: "PSID_ORESTES" }, recipient: { id: "PAGINA" }, timestamp: 1760000000000, message: { mid: "m.1", text: "Hola, ¿precio de la RTR 160?" } },
        ],
      },
    ],
  };

  it("el parser los entrega marcados como en espera", () => {
    const [evento] = parseEventosMeta(payload);
    expect(evento).toMatchObject({ kind: "dm_texto", remitenteId: "PSID_ORESTES", texto: "Hola, ¿precio de la RTR 160?", enEspera: true });
  });

  it("se guardan en el panel sin que el bot responda", async () => {
    const [evento] = parseEventosMeta(payload);
    await handleInboundMeta(evento!);
    expect(mensajes.guardarMensaje).toHaveBeenCalledWith(
      expect.objectContaining({ conversacionId: "conv-1", rol: "user", contenido: "Hola, ¿precio de la RTR 160?", externalId: "m.1" }),
    );
    expect(inbound.handleInbound).not.toHaveBeenCalled();
    expect(documento.procesarDocumentoEntrante).not.toHaveBeenCalled();
  });
});
