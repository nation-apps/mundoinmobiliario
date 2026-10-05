# Encender WhatsApp en el bot de B&B Escuela

Punto de partida: el número del bot **ya está agregado** en la app de Meta for Developers, y el bot ya corre
en `https://bot.bybescuela.com` (Railway) con Supabase configurado — si no, primero los pasos 1 y 2 de
[`GUIA-INSTALACION.md`](../GUIA-INSTALACION.md).

El canal se enciende con **cuatro variables** (`src/config/env.ts` las declara opcionales a propósito: sin
ellas el bot arranca, el panel y los leads del formulario web funcionan, y solo WhatsApp queda apagado). En
cuanto están cargadas y el servicio reinicia, el canal se enciende sin volver a desplegar.

Fecha de referencia de todo lo de Meta: **26-sep-2026**. Lo que no se pudo confirmar en la documentación
oficial dice **NO VERIFICADO**.

> **Urgente:** método de pago en la cuenta de WhatsApp Business **antes del 30-sep-2026** (§9).

## 1. Qué es cada cosa

| Variable | Qué es | De dónde sale |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | ID interno del número (largo, **no** es el teléfono) | App Dashboard → WhatsApp → **API Setup** (o **Use cases → Customize → API Setup** si la app se creó con el caso de uso "Connect with customers through WhatsApp") |
| `WHATSAPP_ACCESS_TOKEN` | Token **permanente** de un usuario del sistema | Business Settings (§3) |
| `WHATSAPP_APP_SECRET` | Llave con la que el bot valida la firma `X-Hub-Signature-256` de cada webhook | App settings → Basic → **App secret** |
| `WHATSAPP_VERIFY_TOKEN` | Contraseña del saludo de verificación del webhook | **La inventas tú**: `openssl rand -hex 24` |
| `WHATSAPP_WABA_ID` | Cuenta de WhatsApp Business: de ella cuelgan las plantillas | API Setup, junto al número. Sin ella `GET /admin/plantillas` responde `500 waba_id_no_configurado` |
| `WHATSAPP_TEMPLATE_RECORDATORIO` | Nombre de la plantilla de recordatorio | Default `recordatorio_asesoria` (§8) |
| `WHATSAPP_TEMPLATE_LANG` | Idioma **exacto** de esa plantilla | Default `es`; `es_PE` si la creaste en "Spanish (PER)" |

Número y cuenta: comprueba que el que elegiste en API Setup sea el **número real** y no el de prueba que Meta
crea al empezar (ese solo escribe a 5 destinatarios de una lista; con cualquier otro da error **131030**).

## 2. El número: ¿dedicado o compartido con el celular?

Un número conectado a la Cloud API **no puede seguir usándose en la app WhatsApp / WhatsApp Business** del
celular (Meta: "Numbers already in use with WhatsApp cannot be registered unless they are deleted first").

La **coexistencia** (mismo número en la app y en la API, con historial sincronizado) existe y Perú está
soportado según fuentes secundarias, pero **solo se activa mediante el registro embebido de un Solution
Partner o Tech Provider**; una app propia como la de AZ no puede activarla desde el App Dashboard. Si algún
día se quisiera: throughput fijo de 20 mensajes/s, los mensajes enviados desde la app no abren la ventana de la
API, y se pierden listas de difusión, mensajes temporales y ubicación en tiempo real.

Lo simple para AZ: **número dedicado al bot**. El 51902666102 del sitio puede seguir atendido por una persona
en la app, o apuntarse al bot cambiando `NEXT_PUBLIC_WHATSAPP` en el sitio (guía de instalación, paso 8).

## 3. Token permanente (usuario del sistema)

El token de API Setup es temporal ("expire quickly"): con él el bot se cae al día siguiente.

1. https://business.facebook.com/latest/settings → **Usuarios → Usuarios del sistema → Agregar** → nombre
   `az-bot`, rol **Admin** (Employee también sirve; Admin evita peleas de permisos en un solo negocio).
2. **Asignar activos**: la **app** con control total ("Manage app") y la **cuenta de WhatsApp** con control
   total ("Manage WhatsApp Business accounts"). Para Messenger/Instagram, además la Página y la cuenta de IG
   (ver `CONFIGURAR-META.md`).
3. **Generar token** → elige la app → vencimiento **Nunca** (etiqueta exacta NO VERIFICADA) → permisos
   `business_management`, `whatsapp_business_messaging`, `whatsapp_business_management`.
4. Comprueba que no vence (`data.expires_at` = `0`) y que tiene los permisos:

   ```bash
   curl -s "https://graph.facebook.com/v26.0/debug_token?input_token=$WHATSAPP_ACCESS_TOKEN&access_token=$WHATSAPP_ACCESS_TOKEN"
   ```

El token deja de servir (error **190**) si alguien le quita un activo al usuario del sistema o Meta lo revoca.

## 4. Registrar el número (con PIN)

"Agregado" en el panel no es lo mismo que **registrado** en la Cloud API. Revisa el estado:

```bash
curl -s "https://graph.facebook.com/v26.0/$WHATSAPP_PHONE_NUMBER_ID?fields=status,code_verification_status,name_status,verified_name,quality_rating,throughput" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
```

- `status` = `CONNECTED` para enviar y recibir; `code_verification_status` = `VERIFIED`.
- Si no, o si un envío da **133010** ("Phone number not registered"):

  ```bash
  curl -s -X POST "https://graph.facebook.com/v26.0/$WHATSAPP_PHONE_NUMBER_ID/register" \
    -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" -H "Content-Type: application/json" \
    -d '{"messaging_product":"whatsapp","pin":"NNNNNN"}'
  ```

- El `pin`: si el número ya tiene verificación en dos pasos, es ese; si no, el que mandes **pasa a ser** el PIN
  de dos pasos. Guárdalo en el gestor de contraseñas. Se cambia con `POST /{PHONE_NUMBER_ID}` y
  `{"pin":"NNNNNN"}`; no existe forma de desactivarlo por API.
- Límite: 10 llamadas a `/register` por número cada 72 h (error **133016** y bloqueo de 72 h). Otros errores:
  133005 PIN incorrecto, 133006 falta verificar el número (SMS/llamada), 133008/133009 demasiados intentos,
  133015 número recién borrado.

## 5. Cargar las variables en Railway

Railway → servicio del bot → **Variables** → las 4 de §1 + `WHATSAPP_WABA_ID`. Al guardar, Railway reinicia.
En los logs, "WhatsApp" ya no aparece en el aviso `⚠ Arrancando sin: …`.

Con la CLI (`railway variables --set NOMBRE=valor`), pon un espacio delante del comando para que no quede en
el historial del shell.

## 6. Webhook

App Dashboard → **WhatsApp → Configuration** (o **Use cases → Customize → Configuration**):

- **Callback URL**: `https://bot.bybescuela.com/webhook`
- **Verify token**: el valor de `WHATSAPP_VERIFY_TOKEN`
- **Verify and save** → Meta hace `GET /webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` y el
  bot responde `200` con el challenge (o `403 Forbidden` si el token no coincide).
- **Webhook fields**: suscribe **`messages`**. Trae los mensajes entrantes y los estados de entrega; el bot
  procesa texto, botones/listas, audio (responde que no escucha audios), **imágenes y documentos** (se guardan
  en el bucket privado `adjuntos` y el bot acusa recibo una vez) y los estados `failed` (marca el mensaje con
  error en el panel).
  Los demás campos (`message_template_status_update`, `phone_number_name_update`, `account_update`…) no los
  procesa: no rompen nada, pero cada evento deja un aviso "no calzó con el esquema" en el log. Suscríbelos solo
  si te sirven para mirar el log.

Pruébalo tú mismo:

```bash
curl -s "https://bot.bybescuela.com/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=12345"
# 12345
```

Cómo trata el bot cada webhook (`src/routes/webhook.ts`): valida la firma con el **cuerpo crudo** y
`timingSafeEqual`, responde `200` de inmediato y procesa en segundo plano, y deduplica por id (Meta reintenta
hasta 7 días y puede repetir notificaciones). Meta exige certificado TLS válido (no autofirmado): el dominio de
Railway lo cumple.

## 7. Suscribir la WABA a la app

Si la WABA no está suscrita, el botón "Test" del panel de Meta llega pero los mensajes reales **no** (pasa
típicamente cuando el número real vive en una WABA distinta de la de prueba). Siempre revísalo:

```bash
# data: [] = no está suscrita
curl -s "https://graph.facebook.com/v26.0/$WHATSAPP_WABA_ID/subscribed_apps" -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
# Suscribir (idempotente)
curl -s -X POST "https://graph.facebook.com/v26.0/$WHATSAPP_WABA_ID/subscribed_apps" -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN"
```

## 8. Plantilla de recordatorio

Fuera de la ventana de 24 h desde el último mensaje del cliente, el texto libre se rechaza (**131047**). El bot
(`src/notifications/recordatorios.ts`, cada 15 min) manda el recordatorio de cita como texto libre si la
ventana está abierta (con modalidad, dirección si es presencial o enlace si es videollamada) y, si está cerrada,
con la plantilla. Parámetros, en este orden: `{{1}}` nombre, `{{2}}` tipo de asesoría (el nombre del servicio
agendado), `{{3}}` fecha y hora. Cuántas horas antes se edita en el panel (Disponibilidad → Recordatorios).

Crear en **WhatsApp Manager → Plantillas de mensajes**:

- Categoría **UTILITY** · nombre `recordatorio_asesoria` · idioma **Spanish** (`es`).
- Variables **posicionales** (el bot manda los parámetros en orden, no con nombre).
- Cuerpo (redacción propia, no promocional, no empieza ni termina en variable):

  ```
  Hola {{1}}, te recordamos tu {{2}} con B&B Escuela el {{3}}. Si necesitas cambiar la hora, responde a este mensaje y lo coordinamos.
  ```

- Ejemplos: `{{1}}` Carla · `{{2}}` maquillaje social · `{{3}}` martes 30 de septiembre a
  las 10:00. Pie opcional "B&B Escuela". Sin botones (que los botones de respuesta rápida funcionen sin
  parámetros está NO VERIFICADO).
- Evita "oferta", "descuento", "gratis" en el cuerpo: Meta recategoriza a MARKETING las utility con intención
  promocional (guía general de Meta; la lista de palabras es NO VERIFICADA).
- La revisión tarda hasta 24 h. El estado se ve en WhatsApp Manager; en el panel, las `APPROVED` aparecen para
  elegir en "Escribir por WhatsApp" y en Promociones (las lista `GET /admin/plantillas`).

Otras plantillas útiles:

- **Primer contacto** con leads del formulario web (p. ej. `primer_contacto`, UTILITY, 1 variable: nombre): a
  quien nunca escribió por WhatsApp solo se le puede llegar por plantilla. El panel las lista en "Escribir por
  WhatsApp" (`POST /admin/clientes/:id/whatsapp`).
- **Promociones** (`PromoDialog` del panel, `POST /admin/promociones`): plantillas MARKETING; se cobran por
  mensaje y solo a contactos que aceptaron recibirlas.

Errores de plantilla: **132000** cantidad de variables distinta; **132001** no existe en ese idioma o no está
aprobada (revisa `WHATSAPP_TEMPLATE_LANG`); **132015** pausada por baja calidad.

## 9. Nombre visible, pago, verificación, modo Live

- **Nombre visible**: WhatsApp Manager → Herramientas de la cuenta → Números de teléfono → número → Perfil.
  "ByB Escuela" (WhatsApp rechazó el "&"), coherente con la web (aprobación tal cual NO VERIFICADA). Hasta 10 cambios cada 30 días;
  tras aprobar un cambio hay **14 días** para re-registrar el número (§4) o no se aplica. Completa foto, descripción,
  dirección, horario, correo y web.
- **Método de pago** (antes del **30-sep-2026**): Business Settings / WhatsApp Manager → Facturación. Desde el
  1-oct-2026 Meta cobra los *service messages* y, sin método de pago, deja de entregarlos. Perú se factura como
  mercado propio y hay facturación en PEN.
- **Verificación del negocio** (Business Settings → Centro de seguridad): sube el límite de contactos nuevos fuera
  de ventana de **250 → 2.000** por 24 h (compartido por todo el portafolio desde el 7-oct-2025), de 2 a 20
  números y hasta 6.000 plantillas; requisito de App Review para Messenger/Instagram. Documentos para Perú:
  sugerido Ficha RUC + recibo de servicio con la dirección (lista exacta NO VERIFICADA). Para AZ, 250 alcanza al
  inicio: las respuestas del bot van dentro de ventana y no cuentan.
- **Modo Live**: App settings → Basic → política de privacidad `https://bybescuela.com/politica-de-privacidad`,
  instrucciones de eliminación de datos (misma página, derechos ARCO), ícono, categoría → **Publish**. En modo
  Dev Meta no envía algunos webhooks.

## 10. Probar

```bash
curl -s https://bot.bybescuela.com/health        # {"status":"ok",...}
```

1. Desde tu celular escribe "Hola" al número del bot. En Railway → logs aparece el mensaje; con
   `ANTHROPIC_API_KEY` cargada el bot responde presentándose como asistente virtual de AZ; en el panel aparece en
   **Conversaciones**.
2. Con la ventana abierta, un envío directo (debe llegarte):

   ```bash
   curl -s -X POST "https://graph.facebook.com/v26.0/$WHATSAPP_PHONE_NUMBER_ID/messages" \
     -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" -H "Content-Type: application/json" \
     -d '{"messaging_product":"whatsapp","to":"51XXXXXXXXX","type":"text","text":{"body":"Prueba del bot de AZ"}}'
   ```

3. Responde desde el panel → te llega. Manda una foto → aparece como documento en el hilo.
4. Desde el celular de `ESCALATION_PHONE`, escríbele al bot: WhatsApp solo deja al bot avisarle de escalamientos
   si esa persona le escribió en las últimas 24 h.

## 11. Política de Meta y del bot

- Los términos de la WhatsApp Business Platform prohíben desde el 15-ene-2026 a los proveedores cuyo producto
  principal es un chatbot de IA general. Un bot **del propio negocio** para atención y reservas (el de AZ) está
  permitido. Tampoco se pueden usar datos de la plataforma para entrenar modelos.
- Opt-in: solo escribir a quien te dio su número y aceptó mensajes tuyos. Quien escribe primero cuenta; para
  recordatorios, que el formulario/agenda diga que se le escribirá por WhatsApp.
- Respetar bajas y bloqueos. La automatización debe tener salida a una persona: el bot tiene la tool
  `escalar_a_humano` y el staff toma la conversación desde el panel.
- El bot no da asesoría tributaria personalizada, nunca pide Clave SOL y no analiza los documentos que recibe:
  se los pasa al contador.

## 12. Limitación conocida: usernames de WhatsApp (BSUID)

Desde 2026, cuando un usuario activa su nombre de usuario y no habló con el negocio en 30 días, Meta puede
omitir `messages[].from` y `contacts[].wa_id` (llega un `user_id` tipo `PE.1234…`). `src/whatsapp/parser.ts`
exige el teléfono: un solo mensaje así hace descartar el webhook completo (se ve como "no calzó con el esquema"
en el log). Mientras no se desarrolle el soporte (identidad `bsuid` + envío con `recipient`), esos usuarios no
serán atendidos por el bot.

Diagnóstico de los demás errores: tabla "Solución de problemas" de
[`GUIA-INSTALACION.md`](../GUIA-INSTALACION.md).
