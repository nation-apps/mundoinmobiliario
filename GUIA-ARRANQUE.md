# Guía de arranque: Mundo Motos

*Estado al 9 de octubre de 2026.* Esta guía dice qué está hecho, qué falta y quién lo hace. El orden de montaje en Meta,
Railway y Supabase sigue `docs/RUNBOOK-META-DESDE-CERO.md` (escrito con AZ y Aura); aquí solo lo adaptado a este negocio.

## 1. Hecho

- **El negocio es Mundo Motos, una agencia de motocicletas.** El bot estuvo orientado a Mundo Inmobiliario (seminario,
  programas, perfil de inversionista); todo eso se quitó el 9 de octubre de 2026.
- Prompt (`bot/src/agent/systemPrompt.ts`): entiende qué moto busca la persona y cómo piensa pagarla, guarda su perfil de
  compra y pasa a un asesor a quien quiere cotizar, apartar, tramitar un crédito o agendar una visita o prueba de manejo.
  No inventa modelos, precios, existencias ni condiciones de crédito, y no promete aprobaciones.
- Herramienta `guardar_perfil_compra` (moto, uso, presupuesto, pago, plazo, ciudad) → `clientes.perfil`; el asesor lo ve en
  la ficha sin releer el chat.
- **Leads de formularios de anuncios** de Facebook e Instagram → Chats, como «Formulario de anuncio»
  (`docs/referencia/CONFIGURAR-META.md` §9).
- **Reparto automático de leads** entre vendedores (panel → «Reparto de leads», solo administración): aleatorio o por
  porcentaje, solo formularios o todas las conversaciones nuevas, y el cliente que vuelve sigue con su vendedor. Lo hace un
  trigger al crear la conversación (`0004_reparto_leads.sql`); el vendedor ve el aviso y su chat en el filtro «Mías», y el
  aviso de escalamiento dice a quién está asignada. Arranca apagado.
- Panel de administración en `admin/` (Next.js 16): chats, canales y multimedia. Páginas públicas para Meta: `/privacidad`,
  `/terminos`, `/eliminar-datos`.
- México: teléfonos `52 + 10 dígitos` (acepta el `521` antiguo de Meta), zona horaria `America/Mexico_City`, plantillas `es_MX`.

### Dónde vive cada cosa

| Pieza | Dónde |
|---|---|
| Código | GitHub `nation-apps/mundoinmobiliario` (se sube con la cuenta `nation-apps`) |
| Bot | Railway, proyecto `beautiful-acceptance`, servicio `mundoinmobiliario`, `https://mundoinmobiliario-production.up.railway.app` |
| Panel | Mismo proyecto, servicio `joyful-peace`, `https://joyful-peace-production-2649.up.railway.app/admin` |
| Base de datos | Supabase (la URL está en las variables del bot en Railway) |
| App de Meta | «Mundo Motos», ID `2544073699424560`, portafolio «Mundo Motos» |

**Desplegar:** el push a `main` no despliega solo. Desde la raíz del repo (con el proyecto enlazado):
`railway up -s mundoinmobiliario --detach` (bot) y `railway up -s joyful-peace --detach` (panel). Subir siempre el repo
completo: los servicios usan Root Directory `/bot` y `/admin`.

Los nombres `mundoinmobiliario` del repo, del servicio y del dominio del bot se dejaron así a propósito: cambiar el dominio
rompe los webhooks de WhatsApp y Meta ya registrados. Si se cambia, hay que volver a registrar las dos URLs de webhook.

## 2. Número de WhatsApp

Hoy el bot usa el **número de prueba de Meta**: hasta 5 destinatarios verificados y 250 mensajes cada 24 h. Sirve para probar
todo; para atender clientes hace falta un número real que pueda recibir el código por SMS o llamada.

## 3. Datos del negocio (`bot/src/config/business.ts`)

Cargados del documento del cliente «Implementación CRM - Mundo de Motos» (Google Docs, 9-oct-2026): tres líneas (motos
TVS nuevas como TVS Motor Cancún, refacciones y accesorios multimarca, taller), sucursal en Av. Yaxchilán 573, Cancún,
horario L–V 9–18 y sábado 9–14, contado y financiamiento sujeto a Buró, redes y reglas (sin seminuevas, sin pruebas de
manejo prometidas, sin rines, llantas, cubre cárter ni cubrepuños, el taller no diagnostica por chat, preguntar si vive
en Cancún sin descartar). El cliente conoce el negocio como **Mundo de Motos**: así se presenta el bot.

Cada campo en `POR_DEFINIR` se convierte, en el prompt, en «no lo sabes: lo confirma un asesor». **Falta que lo entregue
el negocio:**

- Catálogo autorizado con precios y existencias (motos, refacciones y accesorios), y tarifas de servicios de taller.
- Condiciones de financiamiento: requisitos, enganche mínimo, plazos y qué financieras siguen habilitadas (en el proyecto
  se registraron Galgo y Atrato; validar antes de nombrarlas).
- Garantía, enlace de Google Maps, sitio web propio (si existe) y el número de WhatsApp definitivo del bot.
- Directorio de asesores autorizado (Giovanny Oney +52 998 476 9700 aparece publicado; Alonso y demás, pendientes) y
  quién atiende el +52 998 758 4160.
- Disponibilidad real de citas: hoy el bot solo registra el horario pedido y el equipo lo confirma.
- Catálogos o fichas técnicas para la biblioteca multimedia (el bot los manda con `enviar_multimedia`).

## 4. Base de datos

Migraciones en `supabase/migrations/`, en orden: `0001_nucleo.sql`, `0002_ajuste_rubro.sql`, `0003_mundo_motos.sql`,
`0004_reparto_leads.sql`, `0005_datos_negocio.sql`. Se corren a mano en el SQL Editor de Supabase; todas son idempotentes. **No desplegar el bot antes de correr la última
migración**: los intereses del código tienen que existir en el check de `clientes.interes`.

Primer asesor: Authentication → Users → *Add user*, y en el SQL Editor:
`insert into public.staff (user_id, nombre, email, rol) select id, 'Nombre', email, 'admin' from auth.users where email = 'correo@dominio.com';`

## 5. Meta

1. **WhatsApp:** caso de uso de WhatsApp → webhook `https://<bot>/webhook` con `WHATSAPP_VERIFY_TOKEN`, campo `messages`.
2. **Formularios de anuncios:** caso de uso «Captar y administrar clientes potenciales de anuncios» (agregado el
   9-oct-2026, permisos listos para la prueba) → webhook de Page `https://<bot>/webhook/meta`, campo `leadgen`; token de la
   página con `leads_retrieval` en `META_PAGE_ID` / `META_PAGE_ACCESS_TOKEN`. Pasos en `CONFIGURAR-META.md` §9.
3. **Messenger e Instagram** (opcional, después): runbook §5 a §7.
4. Para leads reales y para responder a público general, Meta exige revisión de la app (acceso avanzado).

## 6. Prueba de punta a punta

`curl <bot>/health` → `{"status":"ok"}`; escribir al número de prueba desde un celular verificado; ver la conversación en el
panel, la respuesta, los botones, que un pedido de asesor escale la conversación y que la etiqueta Anulado silencie al bot.
Para los leads: Lead Ads Testing Tool → el lead aparece en Chats y en **Canales** se ve «aviso suscrito» y «permiso» en Sí.
