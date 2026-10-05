import { describe, expect, it } from "vitest";
import { parseInboundMessages } from "../src/whatsapp/parser.js";

const baseValue = {
  messaging_product: "whatsapp" as const,
  metadata: { phone_number_id: "123456" },
  contacts: [{ wa_id: "51999888777", profile: { name: "Cliente Test" } }],
};

function webhookPayload(messages: unknown[]) {
  return {
    object: "whatsapp_business_account" as const,
    entry: [
      {
        id: "entry-1",
        changes: [{ field: "messages", value: { ...baseValue, messages } }],
      },
    ],
  };
}

describe("parseInboundMessages", () => {
  it("extrae un mensaje de texto", () => {
    const payload = webhookPayload([
      { from: "51999888777", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "Hola" } },
    ]);
    const result = parseInboundMessages(payload);
    expect(result).toEqual([
      { kind: "text", id: "wamid.1", from: "51999888777", timestamp: "1700000000", contactName: "Cliente Test", text: "Hola" },
    ]);
  });

  it("extrae una respuesta de botón interactivo", () => {
    const payload = webhookPayload([
      {
        from: "51999888777",
        id: "wamid.2",
        timestamp: "1700000001",
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "confirmar", title: "Confirmar" } },
      },
    ]);
    const result = parseInboundMessages(payload);
    expect(result).toEqual([
      {
        kind: "interactive_reply",
        id: "wamid.2",
        from: "51999888777",
        timestamp: "1700000001",
        contactName: "Cliente Test",
        replyId: "confirmar",
        replyTitle: "Confirmar",
      },
    ]);
  });

  it("marca como unsupported un tipo de mensaje no manejado (ej. sticker)", () => {
    const payload = webhookPayload([
      { from: "51999888777", id: "wamid.3", timestamp: "1700000002", type: "sticker" },
    ]);
    const result = parseInboundMessages(payload);
    expect(result).toEqual([
      {
        kind: "unsupported",
        id: "wamid.3",
        from: "51999888777",
        timestamp: "1700000002",
        contactName: "Cliente Test",
        messageType: "sticker",
      },
    ]);
  });

  it("extrae un mensaje de imagen (foto de un comprobante, una ficha RUC…)", () => {
    const payload = webhookPayload([
      {
        from: "51999888777",
        id: "wamid.4",
        timestamp: "1700000003",
        type: "image",
        image: { id: "media-abc", mime_type: "image/jpeg" },
      },
    ]);
    const result = parseInboundMessages(payload);
    expect(result).toEqual([
      {
        kind: "image",
        id: "wamid.4",
        from: "51999888777",
        timestamp: "1700000003",
        contactName: "Cliente Test",
        mediaId: "media-abc",
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("conserva el texto que acompaña a una imagen", () => {
    const payload = webhookPayload([
      {
        from: "51999888777",
        id: "wamid.5",
        timestamp: "1700000004",
        type: "image",
        image: { id: "media-def", mime_type: "image/png", caption: "facturas de septiembre" },
      },
    ]);
    expect(parseInboundMessages(payload)[0]).toMatchObject({ kind: "image", caption: "facturas de septiembre" });
  });

  it("extrae un documento (PDF, Excel…) con su nombre de archivo y su texto", () => {
    const payload = webhookPayload([
      {
        from: "51999888777",
        id: "wamid.6",
        timestamp: "1700000005",
        type: "document",
        document: {
          id: "media-doc",
          mime_type: "application/pdf",
          filename: "ficha-ruc.pdf",
          caption: "mi ficha RUC",
        },
      },
    ]);
    expect(parseInboundMessages(payload)).toEqual([
      {
        kind: "document",
        id: "wamid.6",
        from: "51999888777",
        timestamp: "1700000005",
        contactName: "Cliente Test",
        mediaId: "media-doc",
        mimeType: "application/pdf",
        filename: "ficha-ruc.pdf",
        caption: "mi ficha RUC",
      },
    ]);
  });

  it("un documento sin MIME ni nombre se acepta igual (se guarda como binario)", () => {
    const payload = webhookPayload([
      { from: "51999888777", id: "wamid.7", timestamp: "1700000006", type: "document", document: { id: "media-x" } },
    ]);
    expect(parseInboundMessages(payload)).toEqual([
      {
        kind: "document",
        id: "wamid.7",
        from: "51999888777",
        timestamp: "1700000006",
        contactName: "Cliente Test",
        mediaId: "media-x",
        mimeType: "application/octet-stream",
      },
    ]);
  });

  it("devuelve una lista vacía para eventos de estado de entrega/lectura", () => {
    const payload = {
      object: "whatsapp_business_account" as const,
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "messages",
              value: { ...baseValue, statuses: [{ id: "wamid.1", status: "delivered" }] },
            },
          ],
        },
      ],
    };
    expect(parseInboundMessages(payload)).toEqual([]);
  });

  it("devuelve una lista vacía para un payload que no coincide con el esquema", () => {
    expect(parseInboundMessages({ foo: "bar" })).toEqual([]);
  });
});

describe("mensajes sin teléfono (usuarios con nombre de usuario)", () => {
  it("omite el mensaje sin `from` pero conserva los demás del mismo webhook", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "10" },
                contacts: [{ user_id: "BSUID.1", profile: { name: "Sin número" } }, { wa_id: "51999888777", profile: { name: "Ana" } }],
                messages: [
                  { from_user_id: "BSUID.1", id: "wamid.A", timestamp: "1", type: "text", text: { body: "hola" } },
                  { from: "51999888777", id: "wamid.B", timestamp: "2", type: "text", text: { body: "hola" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const r = parseInboundMessages(payload);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "wamid.B", from: "51999888777", contactName: "Ana" });
  });

  it("conserva el anuncio de origen (referral) de un clic a WhatsApp", () => {
    const payload = webhookPayload([
      {
        from: "51999888777",
        id: "wamid.ref",
        timestamp: "1700000009",
        type: "text",
        text: { body: "¡Hola! Me gustaría conseguir más información sobre esto." },
        referral: {
          source_url: "https://fb.me/abc",
          source_id: "120249532675150707",
          source_type: "ad",
          headline: "Tu empresa en 7 días · Desde S/ 899",
          body: "¿Sigues vendiendo con tu DNI?",
        },
      },
    ]);
    const [msg] = parseInboundMessages(payload);
    expect(msg).toMatchObject({
      kind: "text",
      referral: {
        sourceId: "120249532675150707",
        headline: "Tu empresa en 7 días · Desde S/ 899",
        body: "¿Sigues vendiendo con tu DNI?",
        sourceUrl: "https://fb.me/abc",
      },
    });
  });
});
