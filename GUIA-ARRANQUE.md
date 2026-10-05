# Guía de arranque: Mundo Motos (inmobiliaria)

*Estado al 5 de octubre de 2026.* Esta guía dice qué está hecho, qué falta y quién lo hace. El orden de montaje en Meta,
Railway y Supabase sigue `docs/RUNBOOK-META-DESDE-CERO.md` (escrito con AZ y Aura); aquí solo lo adaptado a este negocio.

## 1. Hecho (código)

- Bot copiado del de B&B y limpiado: sin cursos, citas, tienda, evento ni pagos por Yape. Compila y pasa 208 pruebas.
- Prompt de inmobiliaria (`bot/src/agent/systemPrompt.ts`): califica al cliente, no inventa propiedades, precios ni trámites,
  no da asesoría legal ni promete rendimientos, y deriva al asesor con un resumen.
- Herramientas nuevas: `guardar_perfil_busqueda` (operación, tipo de inmueble, zona, presupuesto, recámaras, plazo, forma
  de pago). Se guarda en `clientes.perfil` para que el asesor lo vea sin releer el chat.
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
| 1 | **Cuentas del negocio** (yo no puedo crearlas): GitHub (repo privado `mundo-motos`), Railway (proyecto nuevo) y Supabase (proyecto nuevo). Dame acceso o ejecuta tú los comandos que te pase. | Subir el código, desplegar el bot y aplicar la migración. |
| 2 | **Llave de Anthropic sin vencimiento** (la guardas en el portapapeles; no la pegues en el chat). | Que el bot responda. |
| 3 | **App «Mundo Motos» en Meta**: su App ID y a qué portafolio comercial pertenece. | Webhook, casos de uso y permisos (runbook §2). |
| 4 | **Datos del negocio** (sección 4). | Llenar `bot/src/config/business.ts`. |
| 5 | **Celular de prueba** para verificarlo como destinatario del número de prueba de Meta. | Probar el bot. |
| 6 | **País y ciudad confirmados** (asumí México por el número). | Idioma, zona horaria y moneda. |

## 4. Datos del negocio por llenar (`bot/src/config/business.ts`)

Cada campo en `POR_DEFINIR` se convierte, en el prompt, en «no lo sabes: lo confirma un asesor». Mientras estén vacíos el
bot atiende bien pero no da detalles.

nombre comercial real · ciudad · operaciones que atienden (venta, renta, preventa) · tipos de inmueble · zonas · rango
de precios · financiamiento (crédito bancario, Infonavit, contado) · cómo se agenda una visita · comisiones (o «derivar») ·
oficina y horario · correo, web e Instagram · WhatsApp o teléfono de los asesores.

Además: folletos, fotos o videos para la biblioteca multimedia (el bot los manda con `enviar_multimedia`), y el criterio para
pasar a un asesor (hoy: quiere ver una propiedad, quiere vender o rentar la suya, o pregunta por una propiedad concreta).

## 5. Orden de montaje

1. **Repositorio:** crear `mundo-motos` en GitHub y subir esta carpeta (ya tiene su primer commit local).
2. **Supabase:** proyecto nuevo (región cercana a México, p. ej. East US) → aplicar `supabase/migrations/0001_nucleo.sql`.
   Crear el primer usuario del equipo (Authentication → Users) y su fila en `staff` con rol `admin`.
3. **Railway:** proyecto nuevo desde el repo, **Root Directory `/bot`**, generar dominio, cargar las variables de
   `bot/.env.example` (los secretos desde el portapapeles, nunca en el chat).
4. **Meta:** en la app «Mundo Motos», caso de uso de WhatsApp → número de prueba → webhook
   `https://<dominio de Railway>/webhook` con el `WHATSAPP_VERIFY_TOKEN`, campo `messages` → verificar tu celular como
   destinatario. Para un token que no venza: usuario del sistema con la app y la cuenta de WhatsApp asignadas (runbook §3.2).
5. **Prueba de punta a punta:** `curl <dominio>/health` → `{"status":"ok"}`; escribir al número de prueba desde tu celular;
   revisar la respuesta, los botones, que un pedido de asesor escale la conversación y que la etiqueta Anulado silencie al bot.
6. **Messenger e Instagram** (opcional, después): runbook §5 a §7. Para responder a público general, Meta exige revisión de la app.

## 6. Decisiones pendientes

- **Panel de chats.** La bandeja de B&B vive dentro del sitio Next.js de B&B. Para Mundo Motos hay que elegir: un panel
  propio y pequeño (solo chats, fichas y etiquetas) o integrarlo en el sitio web del negocio si ya tienen uno. Sin panel el bot
  funciona, pero el equipo solo vería las conversaciones en la base de datos.
- **Seguimientos automáticos.** Los de B&B eran del evento Star Beauty y no se copiaron. Para una inmobiliaria conviene
  diseñarlos con calma (cuándo, a quién, con qué plantilla aprobada por Meta).
- **Catálogo de propiedades.** Hoy el bot no conoce propiedades concretas; las deriva a un asesor. Si quieren que cite
  propiedades, hace falta una tabla de inventario (y quién la mantiene).
- **Nombre y marca.** «Mundo Motos» suena a motocicletas. Confirmar que ese es el nombre con el que se presenta la inmobiliaria
  ante los clientes, porque aparecerá en el perfil de WhatsApp y en el prompt.
