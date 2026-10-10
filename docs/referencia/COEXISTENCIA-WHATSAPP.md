# Coexistencia: el teléfono de ventas en la app WhatsApp Business **y** en el CRM

Fecha de referencia: **10-oct-2026**. Lo que no se pudo confirmar dice **NO VERIFICADO**.

## Qué es y qué NO es

- **Es:** *un número de negocio* (p. ej. el de ventas de TVS, 998 758 4160) que sigue usándose en la app WhatsApp
  Business del celular **y** a la vez está conectado a la API (el CRM y el bot). Lo que el equipo escribe desde el celular
  aparece en el panel; lo que se manda desde el panel o el bot aparece en la app.
- **No es:** conectar el WhatsApp *personal* de cada vendedor. La API no admite números personales. Cada vendedor puede
  atender desde el panel (con su usuario) o desde el celular de ventas.

## Qué hace el bot (ya implementado)

| Evento de Meta | Qué hace el bot |
|---|---|
| `messages` | Igual que siempre: el cliente escribe → bot o asesor. |
| `smb_message_echoes` | El equipo escribió desde el celular → se guarda en el chat como mensaje del **equipo** (rótulo «Equipo · celular» en el panel) y el chat pasa a **«Yo»** para que el bot no le hable encima. Si la persona escribió primero desde el celular, el chat se abre en el panel. Fotos, videos, audios y documentos se guardan con su pie. |
| `history`, `smb_app_state_sync` | Se reciben y se **anotan en el log** (cuántos elementos), pero **no se importan**: llenarían el panel de chats viejos. Si se quisiera, es un cambio aparte. |

Código: `bot/src/whatsapp/parser.ts` (`parseEcosApp`, `resumenSincronizacion`), `bot/src/agent/handleEcoApp.ts`,
`bot/src/routes/webhook.ts`. Pruebas: `bot/tests/coexistenciaWhatsapp.test.ts`.

## Qué falta fuera del código (lo hace una persona, con Meta)

1. **El alta la hace un Tech Provider o BSP** (el «broder»). Nuestra app «Mundo Motos» no puede activarla desde el panel
   de Meta: el alta usa el registro embebido (*Embedded Signup*) con `featureType: whatsapp_business_app_onboarding`.
   Antes de la reunión, preguntarle: ¿es Tech Provider?, ¿el número del cliente (México) es elegible?, ¿a qué URL
   entrega los webhooks?
2. **Requisitos del número** (Meta): app WhatsApp Business **2.24.17 o más nueva**, número de un país soportado
   (**México: NO VERIFICADO**; el propio alta lo dice), y que la cuenta **no** sea «Cuenta oficial» (insignia azul).
3. **Webhooks.** Hay que suscribir `messages`, `smb_message_echoes`, `history` y `smb_app_state_sync`.
   - Si el alta se hace con **nuestra** app: suscribir esos campos en *WhatsApp → Configuration → Webhook fields*.
   - Si la hace **el broder con su app**: sus webhooks deben apuntar a `https://<bot>/webhook` (puede usar
     `override_callback_uri` en la WABA). **Ojo:** el bot valida la firma con `WHATSAPP_APP_SECRET`; los eventos firmados
     con el secreto de *otra* app darían `401` («Firma de webhook inválida o ausente» en el log). En ese caso hay que
     aceptar también ese secreto: se agrega aparte.
4. **Variables del bot** con los datos del número del cliente: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` y un
   `WHATSAPP_ACCESS_TOKEN` (usuario del sistema) con acceso a **esa** WABA. El bot atiende **un solo número**; para dos
   (TVS y Mundo de Motos) hace falta soporte multi-número.
5. **Hoy el bot usa el número de prueba de Meta** (+1 555-639-6588, «Test Number»): solo escribe a 5 teléfonos de una
   lista (error 131030 con cualquier otro).

## Efectos que hay que avisar al cliente (Meta)

- Al vincular se **desvinculan WhatsApp Web y las apps de escritorio**; hay que volver a vincularlas.
- Se pierden listas de difusión, mensajes temporales y ubicación en tiempo real.
- Un mensaje enviado desde la app **no abre la ventana de 24 h** de la API: para escribir con texto libre desde el panel
  a alguien que no escribió en 24 h hace falta una plantilla aprobada.
- Mensajes enviados desde un cliente «compañero» no soportado no generan eco.

## Prueba después del alta

1. Un cliente (tu celular) escribe al número → llega al panel y el bot responde.
2. Desde el celular de ventas se le contesta → en el panel aparece «Equipo · celular» y el chat pasa a **Yo**.
3. Desde el panel se le manda un mensaje → aparece en la app y el chat **no** cambia ni se duplica. (Si Meta devolviera
   como eco los mensajes de la API, el log mostraría «Mensaje del equipo desde la app…» por cada envío del panel.)
