# Guía de arranque: Mundo Inmobiliario (app de Meta «Mundo Motos»)

*Estado al 5 de octubre de 2026.* Esta guía dice qué está hecho, qué falta y quién lo hace. El orden de montaje en Meta,
Railway y Supabase sigue `docs/RUNBOOK-META-DESDE-CERO.md` (escrito con AZ y Aura); aquí solo lo adaptado a este negocio.

## 1. Hecho (código)

- Bot copiado del de B&B y limpiado: sin cursos, citas, tienda, evento ni pagos por Yape. Compila y pasa 208 pruebas.
- Panel de administración en `admin/` (Next.js 16, copiado del de B&B y adaptado): chats, canales y multimedia. Compila.
- **El negocio es educación e inversión inmobiliaria** (Luis Ramírez), no venta de propiedades. Datos tomados de
  https://eventos.mundoinmobiliario.tv/ el 5-oct-2026: seminario gratuito en Zoom y tres programas (Programa Avanzado, Mentoría, Máster).
- Prompt (`bot/src/agent/systemPrompt.ts`): lleva al seminario, orienta qué programa encaja, califica, y pasa a un asesor a quien
  quiere inscribirse o pregunta precios. No inventa precios ni fechas, no promete resultados, no cita testimonios como garantía.
- Herramienta `guardar_perfil_inversionista` (experiencia, objetivo, capital, plazo, ubicación) → `clientes.perfil`; el asesor lo
  ve en la ficha sin releer el chat. Etiquetas: Seminario, Programa Avanzado, Mentoría, Máster (+ Anulado).
- México: teléfonos `52 + 10 dígitos` (acepta el `521` antiguo de Meta), zona horaria `America/Mexico_City`, plantillas `es_MX`.
- Esquema de base de datos mínimo en `supabase/migrations/0001_nucleo.sql`. Se validó ejecutándolo completo en un esquema
  temporal con rollback; falta aplicarlo en el proyecto de Supabase del negocio.
- Heredado de B&B: ritmo humano, juntar mensajes seguidos, reintento y reenvío de envíos fallidos, etiqueta **Anulado**,
  botones de WhatsApp, tope diario de gasto, alerta de saldo de Anthropic.

## 2. Número de WhatsApp «gratis por mientras»

**Usa el número de prueba de Meta**, no Twilio:

- Se crea solo al agregar el caso de uso de WhatsApp a la app «Mundo Motos» (Meta Developers → la app → WhatsApp →
  Configuración de la API). No necesita línea, trámite ni pago.
- Límites: hasta **5 destinatarios verificados** (se agregan y se confirman con un código) y **250 mensajes cada 24 h**.
- Sirve para probar todo el bot: webhook, respuestas, botones, escalada, panel.
- Para producción hace falta un número real que pueda recibir el código por SMS o llamada (de cualquier país).

**Twilio:** un número mexicano no es inmediato ni gratis. Twilio pide un paquete regulatorio para México (identidad y
dirección en México; los negocios, la Constancia de Situación Fiscal) y tarda varios días hábiles. La cuenta de prueba tiene
la selección de números limitada. No verifiqué si Meta acepta registrar un número de Twilio como número de WhatsApp.
Si más adelante quieren un número mexicano propio, lo más simple es una línea física o eSIM de un operador mexicano.

## 3. Lo que necesito de ti

| # | Qué | Para qué |
|---|---|---|
| 1 | **Cuentas del negocio** (yo no puedo crearlas): GitHub (repo `nation-apps/mundoinmobiliario`), Railway (proyecto nuevo) y Supabase (proyecto nuevo). Dame acceso o ejecuta tú los comandos que te pase. | Subir el código, desplegar el bot y aplicar la migración. |
| 2 | **Llave de Anthropic sin vencimiento** (la guardas en el portapapeles; no la pegues en el chat). | Que el bot responda. |
| 3 | **App «Mundo Motos» en Meta**: su App ID y a qué portafolio comercial pertenece. | Webhook, casos de uso y permisos (runbook §2). |
| 4 | **Datos del negocio** (sección 4). | Llenar `bot/src/config/business.ts`. |
| 5 | **Celular de prueba** para verificarlo como destinatario del número de prueba de Meta. | Probar el bot. |
| 6 | **País y ciudad confirmados** (asumí México por el número). | Idioma, zona horaria y moneda. |

## 4. Datos del negocio por llenar (`bot/src/config/business.ts`)

Ya cargado desde el sitio: qué enseñan, fundador, descripción del seminario y su enlace de registro, descripción de los tres
programas, Instagram/Facebook `@luisinverpresario`. Cada campo en `POR_DEFINIR` se convierte, en el prompt, en «no lo sabes: lo
confirma un asesor». **Falta que lo confirme el negocio:**

- **Fecha y hora del próximo seminario** (el sitio mostraba «miércoles 19 de agosto, 8 pm CDMX», que ya pasó).
- **Precios, formas de pago, fechas de inicio y garantía** del Programa Avanzado, la Mentoría y el Máster (el sitio no los publica).
- Qué incluye y cuesta la **entrada VIP** del seminario.
- Ciudad, correo, horario de atención y WhatsApp de los asesores.
- Temarios, PDFs o videos para la biblioteca multimedia (el bot los manda con `enviar_multimedia`).

## 5. Orden de montaje

1. **Repositorio:** `https://github.com/nation-apps/mundoinmobiliario` (bot + panel + migración en un solo repo).
2. **Supabase:** proyecto nuevo (región cercana a México, p. ej. East US) → SQL Editor → pegar y ejecutar
   `supabase/migrations/0001_nucleo.sql`. Luego Authentication → Users → *Add user* (correo y contraseña del primer asesor) y, en el
   SQL Editor, dar de alta su fila de equipo:
   `insert into public.staff (user_id, nombre, email, rol) select id, 'Nombre', email, 'admin' from auth.users where email = 'correo@dominio.com';`
3. **Railway, servicio «bot»:** New Project → Deploy from GitHub → este repo, **Root Directory `/bot`**, generar dominio, cargar las
   variables de `bot/.env.example` (secretos desde el portapapeles, nunca en el chat). En `ADMIN_ORIGINS` pon el dominio del panel.
4. **Railway, servicio «admin»:** en el mismo proyecto → New Service → mismo repo, **Root Directory `/admin`**, generar dominio y
   cargar las 4 variables de `admin/.env.example` (`BOT_API_URL` = dominio del bot). Entra a `https://<admin>/admin` con el usuario del paso 2.
5. **Meta:** en la app «Mundo Motos», caso de uso de WhatsApp → número de prueba → webhook
   `https://<dominio del bot>/webhook` con el `WHATSAPP_VERIFY_TOKEN`, campo `messages` → verificar tu celular como
   destinatario. Para un token que no venza: usuario del sistema con la app y la cuenta de WhatsApp asignadas (runbook §3.2).
6. **Prueba de punta a punta:** `curl <dominio del bot>/health` → `{"status":"ok"}`; escribir al número de prueba desde tu celular;
   ver la conversación en el panel, la respuesta, los botones, que un pedido de asesor escale la conversación y que la etiqueta
   Anulado silencie al bot.
7. **Messenger e Instagram** (opcional, después): runbook §5 a §7. Para responder a público general, Meta exige revisión de la app.

## 6. Decisiones pendientes

- **Panel de chats:** hecho (`admin/`). Falta si quieren también agenda de visitas, panel de métricas o gestión de usuarios del equipo desde el panel.
- **Seguimientos automáticos.** Los de B&B eran del evento Star Beauty y no se copiaron. Para el seminario y los programas conviene
  diseñarlos con calma (cuándo, a quién, con qué plantilla aprobada por Meta).
- **Seminario con registro.** El registro ocurre en el sitio (nombre, correo, WhatsApp). Si quieren que el bot escriba a los
  registrados (recordatorio, enlace de Zoom), hay que conectar ese formulario al bot y usar plantillas aprobadas por Meta.
- **Nombre y marca.** El bot se presenta como «Mundo Inmobiliario» (el nombre del sitio). La app de Meta se llama «Mundo Motos»:
  conviene renombrarla, porque el nombre de la app puede verse al conectar la cuenta de WhatsApp.
