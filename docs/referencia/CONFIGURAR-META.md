# Encender Messenger, Instagram y comentarios en el bot de B&B Escuela

El bot ya soporta los tres (`src/meta/`, `src/routes/metaWebhook.ts`, `src/canales/`) y arranca igual sin
ninguna de estas variables: mientras falten, esos canales quedan apagados y WhatsApp sigue normal. Esta guía
es para encenderlos, en el mismo espíritu que [`CONFIGURAR-WHATSAPP.md`](CONFIGURAR-WHATSAPP.md).

Qué hace el bot con cada canal:

| Evento | Qué pasa |
|---|---|
| DM de Messenger o Instagram | Conversación `origen='dm'`; el agente responde (si la IA del canal está activa) en la ventana de 24 h |
| Comentario en una publicación de Facebook o Instagram | Conversación **separada** `origen='comentario'` (un comentario es público, un DM no) |
| Comentario que pide una guía ("SUNAT", "EMPRESA"…) | Respuesta **privada** automática con la guía, solo si `canales.ia_comentarios_activa = true` (apagado por defecto: Meta permite **una** respuesta privada por comentario) |
| Foto o archivo por DM | Se guarda en el bucket privado `adjuntos`, evento `documento`, acuse único |
| Respuesta del equipo desde el panel | `POST /admin/mensajes` (DM) o `POST /admin/comentarios/:mensajeId/responder` (público o privado) |

Fecha de referencia: **26-sep-2026**. Lo no confirmado en la documentación oficial dice **NO VERIFICADO**.

## 1. La app de Meta

Lo normal es usar **la misma app** que ya tiene WhatsApp: un solo App secret y un solo usuario del sistema. En
developers.facebook.com → la app → **agregar los casos de uso** de Messenger e Instagram ("Engage with customers
on Messenger from Meta" / "Manage messaging & content on Instagram"; nombres NO VERIFICADOS).

Meta permite varios casos de uso en una app si son compatibles; que el de WhatsApp sea compatible con los de
Messenger/Instagram es NO VERIFICADO. **Si el panel no deja agregarlos**, crea una segunda app y carga en Railway
su `META_APP_SECRET` y un `META_VERIFY_TOKEN` propio (sin ellas el bot cae a `WHATSAPP_APP_SECRET` /
`WHATSAPP_VERIFY_TOKEN`).

En **App settings → Basic** (obligatorio para modo Live):

- Política de privacidad: `https://bybescuela.com/politica-de-privacidad`
- Instrucciones de eliminación de datos: la misma página (sección de derechos ARCO / supresión)
- Ícono y categoría

Antes de pedir App Review conviene que la política de privacidad mencione Messenger/Instagram y que las
conversaciones se procesan con IA (Anthropic): hoy `content/legal/privacidad.mdx` no lo dice.

## 2. Página e Instagram

- Instagram **profesional** (empresa o creador) y **pública** (Meta no manda webhooks de comentarios de cuentas
  privadas).
- **Vinculada a la Página de Facebook** de AZ (Meta Business Suite → Configuración → Cuentas vinculadas). El
  bot usa "Instagram API con Facebook Login": sin Página vinculada no funciona.
- En la app de Instagram: **Configuración → Mensajes y respuestas a historias → Controles de mensajes →
  Herramientas conectadas → Permitir acceso a los mensajes**. Si está apagado, los DMs **no llegan y no hay
  error**; al responder, Meta devuelve el subcódigo **2534041**.

## 3. El token

Mismo usuario del sistema que WhatsApp (Business Settings → Usuarios del sistema), con **la Página y la cuenta
de Instagram asignadas** con control total (nombre exacto del interruptor NO VERIFICADO). Quien genera el token
de Página debe poder hacer las tareas `MESSAGING` y `MODERATE` en la Página.

Genera un token **sin vencimiento** con estos permisos:

| Permiso | Para qué |
|---|---|
| `pages_messaging` | Enviar y recibir DMs (Messenger y, con Facebook Login, también Instagram) |
| `pages_manage_metadata` | Suscribir la Página a los webhooks (y recibir `feed`) |
| `pages_read_engagement` | Leer comentarios y datos de publicaciones |
| `pages_manage_engagement` | Responder comentarios de Facebook en público |
| `pages_show_list` | Listar las Páginas del negocio |
| `instagram_basic` | Datos básicos de la cuenta de Instagram |
| `instagram_manage_messages` | DMs de Instagram |
| `instagram_manage_comments` | Comentarios de Instagram (y respuesta privada) |
| `business_management` | Dependencia de `pages_messaging`, `pages_show_list` e `instagram_manage_messages` |
| `read_insights` | Métricas de la Página (pestaña Contenido del panel) |
| `instagram_manage_insights` | Métricas de Instagram |
| `leads_retrieval` | Leer las respuestas de los formularios de anuncios (§9) |
| `pages_manage_ads` | Leer los formularios de la Página (lo pide Meta junto con `leads_retrieval`) |
| `ads_management` | Nombre del anuncio y de la campaña de cada lead (opcional: sin él el lead llega igual) |

Con ese token, pide el **Page Access Token** de la Página de AZ (ese, no el del usuario del sistema, va en
`META_PAGE_ACCESS_TOKEN`):

```bash
curl -s "https://graph.facebook.com/v26.0/me/accounts?access_token=$TOKEN_USUARIO_SISTEMA"
# data[].id = META_PAGE_ID · data[].access_token = META_PAGE_ACCESS_TOKEN
```

Si el token del usuario del sistema no vence, el de Página tampoco (patrón habitual; NO VERIFICADO explícitamente
en 2026). El bot lo comprueba al arrancar con `debug_token` y el panel muestra el vencimiento en **Canales**
(`messenger.tokenVence`).

## 4. Las variables

| Variable | De dónde sale |
|---|---|
| `META_PAGE_ID` | `data[].id` de `/me/accounts` |
| `META_PAGE_ACCESS_TOKEN` | `data[].access_token` de `/me/accounts` |
| `META_IG_ACCOUNT_ID` | `GET /v26.0/{PAGE_ID}?fields=instagram_business_account&access_token={PAGE_TOKEN}` → `instagram_business_account.id` |
| `META_APP_SECRET` | **Vacía** si es la misma app que WhatsApp (cae a `WHATSAPP_APP_SECRET`); si es otra app, su App secret |
| `META_VERIFY_TOKEN` | Ídem, cae a `WHATSAPP_VERIFY_TOKEN` |
| `META_GRAPH_VERSION` | Default `v26.0` (la vigente) |
| `META_HUMAN_AGENT_APROBADO` | `false` hasta que Meta apruebe Human Agent (§7). Solo el texto exacto `true` la activa |

Messenger se enciende con `META_PAGE_ID` + `META_PAGE_ACCESS_TOKEN` (+ el App secret); Instagram, además, con
`META_IG_ACCOUNT_ID`. Carga en Railway y deja que reinicie: al arrancar, el bot consulta la conexión y rellena
nombre de Página y @usuario de IG en la tabla `canales`.

## 5. Webhooks

App Dashboard → Webhooks (o la sección Configuration de cada caso de uso):

- **Callback URL**: `https://bot.bybescuela.com/webhook/meta`
- **Verify token**: `META_VERIFY_TOKEN` (o `WHATSAPP_VERIFY_TOKEN` si se dejó vacía)
- **Objeto Page**: `messages`, `messaging_postbacks`, `message_echoes`, `feed`, `leadgen`
- **Objeto Instagram**: `messages`, `comments`, `messaging_postbacks`

Messenger e Instagram comparten ese endpoint. Después, **suscribe la Página a la app** (hace falta también para
Instagram con Facebook Login):

```bash
curl -s -X POST "https://graph.facebook.com/v26.0/$META_PAGE_ID/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_echoes,feed,leadgen&access_token=$META_PAGE_ACCESS_TOKEN"
curl -s "https://graph.facebook.com/v26.0/$META_PAGE_ID/subscribed_apps?access_token=$META_PAGE_ACCESS_TOKEN"
```

Ojo con las caídas: Meta exige `200` en ≤ 5 s (el bot responde al toque y procesa después). Si el endpoint falla
**durante 1 hora**, Meta **desuscribe** la app de la Página/IG ("Webhooks Disabled"): hay que volver a correr el
`POST …/subscribed_apps`. Con Railway caído mucho rato, revísalo al volver.

## 6. Conversation Routing (reemplaza al viejo "receptor principal")

El Handover Protocol ya no existe (Messenger, e Instagram desde el 23-oct-2025): ahora es **Conversation
Routing**. Con una sola app que recibe y responde:

- La app del bot debe ser la **app predeterminada** de la Página y de Instagram (Business Suite → configuración
  de enrutamiento de conversaciones; ruta exacta NO VERIFICADA, ayuda:
  https://www.facebook.com/business/help/321478556915081).
- La bandeja de Meta Business Suite cuenta como **otra app**: si alguien responde desde ahí o mueve el hilo a
  "Principal", ese hilo deja de pasar por el bot. **El equipo responde desde el panel de AZ**, no desde Business
  Suite ni la app de Instagram.

## 7. Modo Live, verificación y App Review

- Mientras la app no esté **Live** con **Advanced Access** aprobado, **solo llegan eventos de personas con rol en
  la app** (admin, developer, tester). Sirve para probar, no para atender clientes.
- La documentación de Meta se contradice (una página dice que App Review no hace falta para tu propia Página; el
  error 200 dice que sí). En la práctica:
  1. **Verificación del negocio** (Business Settings → Centro de seguridad).
  2. Publicar la app (**Live**).
  3. **App Review → Advanced Access** para `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`,
     `pages_manage_engagement`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`
     (+ `business_management`), con un video del flujo real: alguien escribe → el bot responde como asistente
     virtual de AZ → pide hablar con una persona → el equipo responde desde el panel.
  4. En el mismo review, la función **Human Agent** si se quiere responder entre 24 h y 7 días; al aprobarla,
     `META_HUMAN_AGENT_APROBADO=true`.
- Los comentarios de Instagram (`comments`) **requieren Advanced Access** para llegar por webhook.

## 8. Ventanas y mensajes fuera de plazo

- **24 h** desde el último mensaje de la persona: responde el bot o el equipo (`messaging_type: RESPONSE`).
- **24 h – 7 días**: solo una **persona**, con el tag `HUMAN_AGENT`, y solo si Meta lo aprobó (el panel lo ofrece
  cuando `/admin/canales/estado` trae `metaHumanAgentAprobado: true`). Nunca para mensajes automáticos.
- Los demás message tags de Messenger se deprecaron (9-feb-2026) y desde el 27-abr-2026 devuelven **error 100**.
  El bot no los usa. Messenger ofrece ahora *Utility Templates* para avisos fuera de ventana: no implementado.
- Por eso las promociones (`PromoDialog`) son solo para contactos con WhatsApp.
- Respuesta **privada** a un comentario: **una sola** por comentario, dentro de **7 días**; la conversación sigue
  solo si la persona contesta. Respuesta **pública**: sin ese límite.

## 9. Prueba de punta a punta

```bash
curl -s https://bot.bybescuela.com/health
# Verificación del webhook de Meta (debe imprimir 12345)
curl -s "https://bot.bybescuela.com/webhook/meta?hub.mode=subscribe&hub.verify_token=$META_VERIFY_TOKEN&hub.challenge=12345"
```

Sin depender todavía de Meta, puedes mandar un evento firmado igual que Meta con los fixtures del repo:

```bash
cd bot
META_APP_SECRET=<el App secret que usa el servidor> npm run simular:meta -- messenger-texto --url https://bot.bybescuela.com/webhook/meta
```

Con una cuenta **que tenga rol en la app**: DM a la Página (o a la cuenta de IG) → aparece en **Conversaciones**
→ responde desde el panel → le llega. Comenta en una publicación → aparece como comentario, con los botones de
responder en público y por privado. En **Canales** del panel: Messenger "configurado" con el nombre de la Página
y el vencimiento del token, Instagram con su @usuario.

## 10. Métricas de contenido

`src/meta/insights.ts` guarda cada 6 h una foto diaria de alcance, interacciones y seguidores en
`metricas_contenido_diarias` (panel: **Conversaciones → Métricas → Contenido**). Meta deprecó varias métricas de
Página (`page_impressions` → `page_media_view`, `page_fans` → `page_follows`); la vigencia de
`page_views_total` y `page_post_engagements`, que usa el código, está NO VERIFICADA. Si el log muestra "Insights
de Facebook rechazados por Meta" (o "de Instagram"), ajusta `METRICAS_FACEBOOK` / `METRICAS_INSTAGRAM` contra la referencia oficial vigente.

## 11. Limitaciones conocidas

- Desde el 27-abr-2026 los posts compartidos por DM en Instagram llegan como adjunto `ig_post`; el bot no lo
  reconoce todavía y lo trata como un archivo genérico.
- El `created_time` de los comentarios de Facebook (`feed`) llega en segundos Unix y el parser lo interpreta como
  milisegundos; hoy ese dato no se usa aguas abajo.

Errores comunes (`10/2018278`, `10/2534022`, `551`, `100/2534013`…) y diagnóstico general: tabla "Solución de
problemas" de [`GUIA-INSTALACION.md`](../GUIA-INSTALACION.md).

## 9. Formularios de anuncios (Lead Ads)

Cuando alguien llena el formulario instantáneo de un anuncio de Facebook o Instagram, Meta avisa por el webhook de
la Página (campo `leadgen`) con **solo el id del lead**. El bot pide las respuestas con
`GET /{leadgen_id}?fields=field_data` (`bot/src/meta/client.ts → obtenerLead`) y las deja en **Chats** como una
conversación «Web» rotulada *Formulario de anuncio* (`bot/src/agent/handleLeadFormulario.ts`). Si el teléfono ya
existe, se suma a esa ficha. El bot no le escribe solo: el asesor lo contacta por WhatsApp desde la conversación
(el primer mensaje a quien no ha escrito exige plantilla aprobada).

Para que lleguen:

1. **Permisos** `leads_retrieval` y `pages_manage_ads` (y `ads_management` para ver el nombre del anuncio) en la
   app y en el token de la Página (§3). Quien genera el token debe poder **anunciar** en la Página (tarea
   ADVERTISE). Si el token ya existía, vuelve a autorizar la app con los permisos nuevos y comprueba con
   `debug_token` que `scopes` incluya `leads_retrieval`. Atajo: genera el token de usuario en el Explorador de la
   Graph API, cópialo y corre `python3 scripts/conectar-pagina-meta.py <ID> --marca <marca>` una vez por página
   (Mundo de Motos: TVS Motor Cancún con `--marca TVS` y Mundo de Motos MX con `--marca "Mundo de Motos"`; la que
   atiende los DMs, con `--mensajes`). El script saca el token de la página (no vence), lo guarda en `META_PAGINAS`,
   suscribe la página y lista los formularios, sin mostrar ningún token.
2. **Webhook**: objeto Page, campo `leadgen` (§5), y la Página suscrita con `leadgen` en `subscribed_fields`.
3. **Acceso a clientes potenciales**: Business Settings → Integraciones → **Acceso a clientes potenciales**
   (Leads Access). Si el negocio personalizó el acceso, la app (o el usuario del sistema) debe estar en la lista
   de la Página; si no lo personalizó, cualquier administrador de la Página tiene acceso.
4. **App Review**: en modo desarrollo solo llegan leads de prueba. Para leads reales, `leads_retrieval` y
   `pages_manage_ads` con **Advanced Access**, la app en **Live** y el negocio verificado (§7).

Probar con la **Lead Ads Testing Tool** (https://developers.facebook.com/tools/lead-ads-testing): elegir la Página
y el formulario → *Create lead* → el lead debe aparecer en Chats en segundos. En **Canales** (tarjeta «Formulario
web y bot») se ve si el aviso `leadgen` está suscrito y si el token trae el permiso. Si el lead no aparece, el log
del bot dice «No se pudo leer el lead de Meta» con la respuesta de Meta (casi siempre falta `leads_retrieval` o el
acceso a clientes potenciales). Meta guarda los leads 90 días: lo que no entró se puede bajar en CSV desde el
Centro de clientes potenciales de Meta Business Suite.

## 10. Origen de cada lead (campo «origen»)

Cada conversación y cada cliente guardan de dónde vinieron (`conversaciones.fuente` / `clientes.fuente`, migración
0006; el cliente se queda con su primer contacto). Etiquetas (`bot/src/lib/fuente.ts`):

- **Campaña Formulario Meta <marca>**: formulario instantáneo; la marca es la de la página que publicó el formulario
  (`META_PAGINAS`).
- **Campaña WhatsApp Meta <marca>**: llegó por un anuncio de clic a WhatsApp; la página sale del anuncio
  (`GET /{ad_id}?fields=creative{actor_id}`), lo que necesita un token con acceso a la cuenta publicitaria
  (`--anuncios` en el script, o un token de página si alcanza). Si no se puede saber, queda «Campaña WhatsApp Meta».
- **WhatsApp directo**, **Instagram**, **Messenger**, **Formulario web**, **Comentario Facebook/Instagram**.

Los anuncios de WhatsApp solo llegan al panel si apuntan al número de WhatsApp conectado al bot.

