# Runbook: montar el bot de un negocio desde cero en Meta (WhatsApp + Messenger + Instagram + comentarios)

Escrito el 2026-10-01 a partir de dos instalaciones reales: **AZ Estudio Contable** y **Aura Studio** (migración
del número a una app nueva en el portafolio de la dueña). Sirve para una sesión nueva que tenga que dejar un bot
funcionando de punta a punta, o repetirlo para otro negocio.

Complementa, sin repetir, `RUNBOOK-META-DEVELOPERS.md` (WhatsApp + Railway + DNS, con los errores de AZ),
`bot/CONFIGURAR-META.md` (especificación técnica de Messenger/Instagram) y `bot/CONFIGURAR-WHATSAPP.md`.
Aquí está el **orden exacto**, lo que cambió en el panel nuevo de Meta («casos de uso») y todas las trampas.

> Regla de oro de toda la sesión: **un token, PIN o clave nunca se escribe en un chat, un commit ni una
> captura.** Se lee del portapapeles con `pbpaste` y se carga a Railway por CLI. Si alguno se expuso, se revoca.

---

## 0. Antes de empezar: quién es quién y qué pedir

| Pieza | Quién la tiene | Para qué |
|---|---|---|
| Portafolio comercial (Meta Business) del negocio | Dueño/a del negocio | Es **dueño** de la app, la página, el Instagram y el número. Debe estar **verificado**. |
| Cuenta de Facebook con control total del portafolio | Dueño/a | Entra a Meta Developers y Business Suite. **No uses una cuenta personal tuya**: si la app queda en tu portafolio, el negocio no es dueño de su bot. |
| Página de Facebook del negocio | Dueño/a | Messenger y comentarios de Facebook. |
| Instagram **profesional** vinculado a esa página | Dueño/a | Mensajes directos y comentarios. |
| Número de WhatsApp del bot | Dueño/a | Debe poder recibir SMS o llamada para el código (si es el número de otro portafolio, ver §3.3). |
| Repo del bot + Railway + Supabase + dominio (DNS) + llave Anthropic | Tú | Ver `GUIA-INSTALACION.md` §1 a §6. |

Cosas que **solo puede hacer una persona** (la automatización no las ve ni debe hacerlas):
cualquier diálogo emergente de Meta con credenciales o consentimiento (generar token, «Conectar página»,
aceptar permisos), códigos por SMS/correo, pagos con tarjeta, y aceptar la invitación de un rol de app.

---

## 1. Navegadores y herramientas (lo que más tiempo hizo perder)

- Cada persona tiene su Chrome con su sesión. Las herramientas del navegador a veces **renumeran** los
  navegadores («Browser 1/2/3») entre una llamada y otra. Antes de actuar: `list_connected_browsers` y comprobar
  en qué sesión se está (¿sale el portafolio correcto?). No navegues en una pestaña que el usuario tenga abierta
  con otra cosa.
- **Los diálogos emergentes de Meta no aparecen en las capturas** de la automatización (menús «Acciones»,
  generar token, asignar personas, conectar página). Cuando ocurra: abre el botón, pide a la persona que lo
  complete y confirma por **efecto** (leyendo la página con `get_page_text`, o por la Graph API), no por
  captura.
- Los paneles de Meta son lentos y a veces ignoran clics por coordenadas. Mejor: `find` + clic por `ref`, o
  `javascript_exec` para leer estado. Para escribir en campos de React, escribe con el teclado (`type`) sobre
  el campo enfocado; asignar `.value` por JavaScript se ve pero **no se guarda**. Siempre **recarga y relee**
  tras guardar.
- Listas largas (la tabla de webhooks) suelen estar dentro de un contenedor con scroll propio: el scroll de la
  página no las mueve. Usa `scroll_to` con un `ref`.
- Mac/zsh: `sleep` largo en una sola orden está bloqueado; usa bucles con `curl` cortos. Las variables sin
  comillas no se parten en palabras como en bash (haz un `for` explícito).
- Cuentas de CLI distintas: `gh` activo puede no ser el dueño del repo (`gh auth switch --user …`); el CLI de
  Railway puede ver otro proyecto que el que necesitas (entonces se usa el panel web). Comprueba con
  `gh auth status` / `railway status` antes de empujar o desplegar.

---

## 2. Crear la app (panel nuevo «casos de uso»)

En `developers.facebook.com` con la **cuenta de la dueña**:

1. **Crear app** → tipo **Empresa/Business**, nombre claro (`<Negocio> Bot`) y **asociada al portafolio del
   negocio** (selector «Portafolio comercial»). Anota el **App ID**.
2. **Casos de uso → Agregar** y añade los tres:
   - **Conectarte con los clientes a través de WhatsApp**
   - **Interactuar con los clientes en Messenger from Meta**
   - **Administrar mensajes y contenido en Instagram**
   Messenger e Instagram son **casos de uso separados**: cada uno trae sus propios permisos. Los permisos que
   no aparezcan en uno suelen estar en el otro (p. ej. `instagram_manage_comments` está en el de Instagram;
   la ventana «Conectar página» del caso de Messenger no lo concede).
3. Para **responder comentarios de Facebook** añade además **Administrar todos los aspectos de tu página**: es
   el caso de uso que trae `pages_manage_engagement` y `pages_read_user_content`.
4. En cada caso → **Permisos y funciones** → **Agregar** estos (quedan «Listo para la prueba»):
   `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`,
   `pages_manage_engagement`, `pages_read_user_content`, `instagram_basic`, `instagram_manage_messages`,
   `instagram_manage_comments`, `business_management`, función **Human Agent**, y los de WhatsApp
   (`whatsapp_business_messaging`, `whatsapp_business_management`).
5. **Configuración de la app → Básica:** icono, categoría, **URL de política de privacidad**, **URL de
   condiciones** y **URL de instrucciones de eliminación de datos** (sin las tres no deja publicar). Cada
   negocio necesita su propia página de eliminación de datos (para Aura: `/eliminacion-de-datos`).
6. **Publicar** (menú lateral). Una app sin publicar solo entrega mensajes de cuentas con rol.

IDs de referencia (no son secretos):

| | Aura Studio | AZ Estudio Contable |
|---|---|---|
| App | «Aura Studio Bot» `1880377483322781` | `2101956507360482` |
| Portafolio | `652584684606059` | `2157526708446875` |
| Página de Facebook | «Aura studio» `652579751273219` | (pendiente) |
| Instagram | @aurastudiope_ `17841474540702385` | (pendiente) |
| WABA | `973108941746654` | `1080767668146878` |
| Phone Number ID | `1449671438220681` (+51 960 142 567) | `1298346546700328` |
| Usuario del sistema | `aurabot` `61594847255388` | `az-bot` |
| Bot | `bot.aurastudio.pe` (Railway `aurastudio-bot`) | `bot.azestudiocontable.com` (Railway «intuitive-youthfulness») |

---

## 3. Verificación del negocio y número de WhatsApp

### 3.1 Verificación del negocio (Meta Business → Centro de seguridad → Verificación del negocio)
- Hace falta para el **acceso avanzado** y para usar la app con usuarios sin rol. Tarda ~2 días hábiles.
- Si Meta muestra una coincidencia pública con el nombre mal escrito, elige **«Mi negocio no aparece»** para
  que se use el nombre corregido.
- Si el código llega por correo/SMS y no llega, cambia a **verificación por dominio**: Meta da un TXT; créalo
  **en el DNS autoritativo** (donde apuntan los nameservers; en Aura es RCP.NET.PE, no SiteGround) y agrega
  antes el dominio en **Configuración del negocio → Seguridad de dominios**. Un TXT puesto en el DNS que no es
  el autoritativo nunca valida.
- Estado final esperado: **Verificada** (Centro de seguridad).

### 3.2 Usuario del sistema y token permanente de WhatsApp
Ver `RUNBOOK-META-DEVELOPERS.md` §2.4. Resumen: Usuario del sistema **Administrador**, activos asignados =
la app, la cuenta de WhatsApp, **la página y la cuenta de Instagram** (§5.2), token **sin vencimiento**.
Verifica en `developers.facebook.com/tools/debug/accesstoken/`: tipo *System User*, caducidad *Nunca*.

### 3.3 Mover el número desde otro portafolio (caso Aura)
1. Con el número en el portafolio viejo: WhatsApp Manager → desconéctalo (pide código de verificación al
   número; quien tenga el SIM debe estar presente).
2. En el portafolio nuevo: agrega el número a la nueva WABA, verifica con el código.
3. **Registra por API** (el botón «Registrar» falla sin detalle):
   `POST /{PHONE_NUMBER_ID}/register` con `{"messaging_product":"whatsapp","pin":"<PIN 6 dígitos>"}` y el
   token del usuario del sistema. El PIN se guarda fuera del repo.
4. `POST /{WABA_ID}/subscribed_apps` para suscribir la app a la WABA.
5. Cuidado con los IDs: el `Phone Number ID` **no** es el número ni el WABA. Se obtiene con
   `GET /{WABA_ID}/phone_numbers`. Una vez se confundieron `…641` y `…681`.
6. Recrear y reaprobar las **plantillas** (recordatorio de cita, etc.) en la nueva WABA, y poner su nombre en
   `WHATSAPP_TEMPLATE_RECORDATORIO`.

---

## 4. Desplegar el bot y cargar variables

`RUNBOOK-META-DEVELOPERS.md` §1 (Railway, Root Directory `/bot`, Watch Paths, dominio, DNS). Notas nuevas:

- **Las variables de entorno se leen solo al arrancar.** Cambiar una variable no cambia el proceso hasta que
  Railway reinicia: comprueba que `/health` reinicia su `uptime` (de miles de segundos a casi cero).
- El **push a GitHub no siempre despliega**. En Aura (`renzotech13/aurastudio-bot`) hay que desplegar con
  `railway up --service aurastudio-bot` desde una copia limpia del commit (`git worktree add`), para no subir
  cambios sin commitear del directorio de trabajo.
- Variables mínimas por canal:

```
# WhatsApp
WHATSAPP_ACCESS_TOKEN  WHATSAPP_PHONE_NUMBER_ID  WHATSAPP_WABA_ID
WHATSAPP_APP_SECRET    WHATSAPP_VERIFY_TOKEN      WHATSAPP_TEMPLATE_RECORDATORIO
# Messenger / Instagram / comentarios
META_PAGE_ID  META_PAGE_ACCESS_TOKEN  META_IG_ACCOUNT_ID  META_HUMAN_AGENT_APROBADO=false
# (META_APP_SECRET y META_VERIFY_TOKEN vacíos: usa los de WhatsApp, es la misma app)
# Núcleo
SUPABASE_URL  SUPABASE_SERVICE_ROLE_KEY  ANTHROPIC_API_KEY  DAILY_TOKEN_BUDGET
PUBLIC_BASE_URL  ESCALATION_PHONE  ADMIN_ORIGINS  WEB_ORIGINS
# Google Calendar (opcional, §9)
GOOGLE_SERVICE_ACCOUNT_JSON  GOOGLE_CALENDAR_ID  GOOGLE_CALENDAR_WEBHOOK_TOKEN
```

- **`ANTHROPIC_API_KEY` con vencimiento** es una bomba: el bot responde «Disculpa, tuve un problema para
  procesar tu mensaje…» el día que vence. Crea la llave **sin vencimiento**.
- **`ADMIN_ORIGINS`** vacío ⇒ el panel dice «No se pudo conectar con el bot» (CORS). Pon el origen exacto del
  panel (`https://admin.<dominio>`) y reinicia.
- Cargar variables sin exponerlas: `railway variables --set "NOMBRE=$(pbpaste | tr -d '\n ')"` (comprobar
  longitud antes). Para leerlas sin mostrarlas: `railway variables --kv | sed -E 's/=.{12,}$/=<…>/'`.
- Si el CLI de Railway no ve el proyecto (otra cuenta), usa el panel web en el Chrome de esa cuenta.

---

## 5. Webhooks, página, Instagram y token de página

### 5.1 Webhook único para Messenger + Instagram + comentarios
Callback `https://bot.<dominio>/webhook/meta`, token de verificación = `WHATSAPP_VERIFY_TOKEN`.
Antes de pegarlo en Meta, pruébalo a mano:
`curl "https://bot.<dominio>/webhook/meta?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=ping123"`
debe devolver `ping123`.

- **Messenger:** Casos de uso → Messenger → *Configuración de la API de Messenger* → paso 1 pegar URL y token
  → **Verificar y guardar** (queda un check verde y la página se recarga). Paso 2 **Conectar** la página
  (la ventana de Facebook la completa la dueña: elegir la página, aceptar permisos). Luego **Agregar
  suscripciones** y marcar `messages`, `messaging_postbacks`, `message_echoes`, `feed`.
- **Instagram:** caso Messenger → *Configuración de Instagram* (o el caso de Instagram) → *Agregar URL de
  devolución de llamada* (la misma URL y token) → *Editar suscripciones*: `messages`,
  `messaging_postbacks`, `comments`.
- Marcar los campos por JavaScript **no persiste** (se vuelven a apagar al recargar). Usa la ventana
  *Agregar suscripciones* de la página o la API (§5.4).

### 5.2 Instagram profesional y accesos
- La cuenta debe ser **Profesional**, estar **vinculada a la página** de Facebook y tener activado
  **«Permitir acceso a mensajes»** (Instagram → Configuración → Mensajes y respuestas de historias → Controles
  de mensajes).
- Usuario del sistema → **Asignar activos**: la **página** (Control total) y la **cuenta de Instagram**
  (acceso total, incluye mensajes y comunidad). Sin esto el token no ve ninguna de las dos.

### 5.3 Token de página sin vencimiento (con TODOS los permisos)
1. Business Settings → **Usuarios del sistema → (usuario) → Generar token**: app = la del bot, vencimiento
   **Sin vencimiento**, y marcar `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement`,
   `pages_manage_engagement`, `pages_read_user_content`, `pages_show_list`, `instagram_basic`,
   `instagram_manage_messages`, `instagram_manage_comments`, `business_management`.
   Los que no salgan marcables hay que añadirlos antes a la app (§2). **Genéralo después de asignar la página
   y el Instagram.**
2. El token de usuario del sistema **no** es el que usa el bot para Messenger/Instagram. Conviértelo en
   **token de página**: `GET https://graph.facebook.com/v26.0/me/accounts?access_token=<token del sistema>` →
   para la página, el campo `access_token`. Ese es `META_PAGE_ACCESS_TOKEN` y **no vence**.
3. Verifica con `debug_token`: `type: PAGE`, `expires_at: 0` y los *scopes* completos. Si faltan
   `instagram_manage_comments` / `pages_read_engagement`, el token se generó antes de dar esos permisos.
4. El ID de Instagram: `GET /{PAGE_ID}?fields=instagram_business_account` (necesita `pages_read_engagement`).
   Si falla, `GET /{PAGE_ID}/conversations?platform=instagram&fields=participants` y mira el participante que
   es la cuenta del negocio.

### 5.4 Suscribir la página por API (más fiable que la UI)
```
POST /{PAGE_ID}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_echoes,feed
GET  /{PAGE_ID}/subscribed_apps      # debe listar la app y los campos
```
Con la página suscrita, Meta ya envía también los eventos de Instagram de esa cuenta vinculada.

---

## 6. Enrutamiento de conversaciones (cuando hay otra app, p. ej. Metricool)

Síntoma: el bot **recibe** los mensajes pero Meta rechaza el envío con
*«(#100) Esta acción no es válida porque esta persona no es propietaria del hilo»*
(`error_subcode 2534037`). Otra app conectada (automatización de palabra clave de Metricool, ManyChat…) tiene el
**control del hilo** de ese chat.

1. `business.facebook.com/latest/settings/conversation_routing` → por cada perfil (la página y el Instagram)
   mira **Apps de socios**.
2. **Enrutamiento → Configurar → «Instagram necesita una app de enrutamiento predeterminada»**: elige **la app
   del bot** (no «Inbox in Meta Business Suite» ni la otra). Hasta hacer esto, `take_thread_control` responde
   *«no está disponible si el enrutamiento de conversaciones no está activado»* (`2534123`).
3. **Apps de socios → Administrar** en la app del bot: activar **«Tomar el control de las conversaciones»** y
   **Guardar** (el botón debe quedar azul antes). Si otra app (Metricool) debe seguir enviando su flujo, dale
   también «Tomar el control».
4. Comprobar por API:
   `POST /{PAGE_ID}/take_thread_control` con `recipient={"id":"<IGSID>"}`, `platform=instagram` → `success:true`,
   y `GET /{PAGE_ID}/thread_owner?recipient=<IGSID>&platform=instagram` → `app_id` de la app del bot.
5. El bot ya hace esto solo: ante el subcódigo 2534037 toma el control y reintenta una vez
   (`bot/src/meta/client.ts`, commit «Tomar el control del hilo…»). Requiere los pasos 2 y 3.
6. «Mensajería avanzada / receptor principal» **no existe** en la configuración de bandeja del panel nuevo y
   no hace falta con una sola app suscrita.

Reparto recomendado cuando coexisten Metricool y el bot: Metricool envía la guía al comentar la palabra clave;
el bot atiende a quien escribe directo o responde después. Si no se quiere duplicar, dejar apagado «IA responde
comentarios (privado)» en el admin del bot.

---

## 7. Acceso estándar vs avanzado (qué esperar y cuándo pedir revisión)

- **Hoy (acceso estándar, app publicada, negocio verificado):** el bot solo puede **responder a cuentas con
  rol en la app** (Administrador, Desarrollador, Evaluador). Para cualquier otra persona Meta rechaza el envío:
  - Messenger: *«No se pueden enviar mensajes a usuarios que no sean administradores, desarrolladores o
    evaluadores de la app antes de que se revise el permiso pages_messaging…»*.
  - Instagram: *«La app no tiene acceso avanzado al permiso instagram_manage_messages y el usuario destinatario
    no tiene ningún rol en ella.»*
  Los mensajes **sí llegan** al bot y se ven en el panel; lo que falla es la respuesta.
- **Probar con alguien más antes de la aprobación:** App → **Roles de la app → Agregar personas** → rol
  **Evaluador**. El buscador solo encuentra amigos: usa el **ID numérico o el nombre de usuario** de Facebook
  de la persona. Debe tener cuenta de desarrollador y **aceptar la invitación** en
  `developers.facebook.com/requests`. Para Instagram, su Facebook debe estar vinculado a su Instagram.
- **Para el público general:** pedir **acceso avanzado** por cada permiso (revisión de app). El texto por
  permiso, el guion del video y las instrucciones para el revisor ya están escritos en
  `~/aurastudio/bot/REVISION-APP-META.md` (cámbialos por los datos del negocio nuevo).
  Requisitos: negocio verificado, app publicada, URLs legales, y cada permiso con **al menos una llamada a la
  API registrada** (los contadores en «Permisos y funciones» se retrasan hasta 24 h; haz llamadas de lectura de
  prueba). Revisión: 2 a 10 días.
- Al aprobarse **Human Agent**: `META_HUMAN_AGENT_APROBADO=true` en Railway y reiniciar.

---

## 8. Pruebas de punta a punta (en este orden)

1. `curl https://bot.<dominio>/health` → `{"status":"ok"}`.
2. Verificación del webhook con el `curl` de §5.1.
3. Mensaje de WhatsApp al número → respuesta del bot (cuenta con rol o número de la dueña).
4. Mensaje a la página por Messenger (m.me/<PAGE_ID>) desde una cuenta **con rol**.
5. Mensaje directo a la cuenta de Instagram desde una cuenta con rol.
6. Comentario en una publicación de Instagram y de Facebook → aparece en el panel; responder desde ahí.
7. Logs de Railway: filtrar por `Falló una llamada a la Graph API`. Los mensajes de error de §6 y §7 dicen
   exactamente cuál paso falta.
8. Revisar que **cada canal** del panel (Canales) muestre «Configurado» y «Webhook suscrito: Sí».

---

## 9. Google Calendar para las citas (opcional)

El bot crea un evento por cada cita. Es una **cuenta de servicio** de Google Cloud que escribe en un calendario
compartido con ella.

1. Google Cloud → proyecto nuevo (`<negocio>`) → habilitar **Google Calendar API**.
2. IAM → **Cuentas de servicio** → crear (`<negocio>-bot-calendar`) → **Claves → Agregar clave → JSON** (se
   descarga a `~/Downloads`; bórrala cuando esté cargada en Railway).
3. En la cuenta de Google **del negocio** (no la tuya): Google Calendar → crear calendario «Citas <Negocio>» →
   Configuración → **Compartir con personas específicas** → el correo de la cuenta de servicio con permiso
   **«Realizar cambios y ver los detalles de todos los eventos»**. Copia el **ID del calendario**
   (`…@group.calendar.google.com`).
4. Railway: `GOOGLE_SERVICE_ACCOUNT_JSON` = el JSON **en una sola línea**
   (`python3 -c "import json,sys;print(json.dumps(json.load(open(sys.argv[1])),separators=(',',':')))" archivo.json | pbcopy`),
   `GOOGLE_CALENDAR_ID` = el ID **exacto, sin comillas ni espacios** (un valor mal copiado da 404),
   `GOOGLE_CALENDAR_WEBHOOK_TOKEN` = un secreto al azar. Reiniciar.
5. Comprobar: en el panel, Canales → «Google Calendar: Sí». A los ~5 minutos el bot sube las citas
   confirmadas que ya existían. Probar la clave desde fuera con un script `googleapis` que cree y borre un
   evento de prueba.
6. Tabla `calendar_sync_state` debe existir (migración); si falta, el sync lo registra en logs.
7. Logger: usa `errorGoogle(err)` al registrar errores de Google; si se loguea el `GaxiosError` crudo, el
   `redact` de pino lanza excepción y **tumba el proceso** (ya corregido en AZ: commits `1cf03a8` y `fe6fea0`;
   **Aura todavía tiene ese bug**).

---

## 10. Panel admin (Vercel)

- Proyecto Vercel con **Root Directory** `admin`. Variables de **Production**: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (la anónima, pública por diseño), `VITE_BOT_API_URL`. **Sin ellas el panel sale en
  blanco** (pasó el 2026-10-01 al desplegar sin variables). Con las variables guardadas en Vercel, un
  `vercel deploy --prod --yes` normal ya funciona.
- Reversión rápida: `vercel promote <url del despliegue anterior>`.
- Usuarios: Supabase → Authentication → Users (correo y contraseña); la fila en `profiles` define el rol.
- App móvil: `/app` (pestañas Citas y Chats). Los celulares (<640 px) entran solos; es instalable desde el
  navegador («Añadir a pantalla de inicio»).

---

## 11. Checklist final (copiar y marcar)

- [ ] Portafolio verificado; app creada **dentro** del portafolio del negocio; tres casos de uso añadidos.
- [ ] URLs de privacidad, condiciones y eliminación de datos guardadas (releídas tras recargar); app publicada.
- [ ] Bot desplegado, `/health` ok, DNS del dominio propagado, variables cargadas y proceso reiniciado.
- [ ] Usuario del sistema con app + cuenta de WhatsApp + **página** + **Instagram** asignados.
- [ ] Token de WhatsApp (sistema, sin vencimiento) y **token de página** (sin vencimiento, scopes completos).
- [ ] Webhook `/webhook` (WhatsApp, campo `messages`) y `/webhook/meta` (página: 4 campos; Instagram: 3 campos).
- [ ] Instagram profesional + vinculado + «Permitir acceso a mensajes».
- [ ] Enrutamiento: app del bot predeterminada y «Tomar el control» activo (si hay otra app).
- [ ] Prueba real por WhatsApp, Messenger, Instagram y comentarios (cuentas con rol).
- [ ] Llave de Anthropic sin vencimiento y tope diario configurado.
- [ ] Plantillas de WhatsApp aprobadas; método de pago en WhatsApp Manager.
- [ ] Google Calendar conectado (si aplica) y clave JSON borrada de Descargas.
- [ ] Revisión de app enviada (§7) o evaluadores añadidos para pruebas.
- [ ] Tokens y PIN fuera de chats y repos; los expuestos, revocados.

---

## 12. Errores vistos (tabla rápida)

| Síntoma | Causa | Arreglo |
|---|---|---|
| El bot responde «Disculpa, tuve un problema…» | Llave de Anthropic vencida | Crear llave sin vencimiento, cargarla, reiniciar |
| Panel: «No se pudo conectar con el bot» | `ADMIN_ORIGINS` vacío | Origen exacto del panel + reiniciar |
| Panel en blanco tras desplegar | Faltan `VITE_*` en Vercel | Guardarlas como variables de Production; `vercel promote` al anterior |
| Mensajes llegan al panel pero no al celular (Instagram) | Acceso avanzado pendiente y usuario sin rol | §7: dar rol de Evaluador o pedir revisión |
| Mismo caso, solo Instagram, con rol | Otra app tiene el hilo (`2534037`) | §6 |
| `take_thread_control` → «enrutamiento no activado» | Falta app predeterminada en Enrutamiento | §6 paso 2 |
| Marcar campos del webhook «no se guarda» | Se hizo por JS | Ventana «Agregar suscripciones» o API §5.4 |
| `/me/accounts` no lista la página | El token se generó antes de asignar la página | Asignar activos y generar el token de nuevo |
| Token sin `instagram_manage_comments` | Caso de uso sin ese permiso o token generado antes | Añadir el permiso a la app y regenerar |
| Google 404 en Calendar al arrancar | `GOOGLE_CALENDAR_ID` mal copiado | Pegar el ID exacto; reiniciar |
| Bot en bucle de reinicios tras error de Google | Logger lanzando al registrar un `GaxiosError` | Usar `errorGoogle(err)` |
| El cliente escribe dos mensajes y recibe respuestas cruzadas / cita duplicada | Respuestas en paralelo por conversación | Cola por conversación + freno `ya_tiene_cita` (commit `22d8c6c`, **falta en Aura**) |
| Meta pide código y no llega | Correo/SMS no entregado | Verificación por dominio con TXT en el DNS autoritativo |

---

## 13. Qué falta hoy (estado al 2026-10-01)

**Aura Studio:** revisión de app con acceso avanzado (textos en `bot/REVISION-APP-META.md`); recrear plantilla de
recordatorio en la WABA nueva; migración `calendar_sync_state`; portar a Aura la cola por conversación, el freno
de duplicados y el arreglo del logger; función `eliminar_datos_cliente`; renovar llaves de Anthropic que vencen.

**AZ Estudio Contable:** Messenger/Instagram y comentarios (usar §2 a §7 con una página e Instagram propios);
método de pago en WhatsApp Manager; confirmar con el equipo el correo `info@azestudiocontable.com`; cancelar las
citas duplicadas de Armando en el panel; música para los videos (pendiente de indicar guion y fuente).
