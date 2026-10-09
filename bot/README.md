# Bot de B&B Escuela (WhatsApp · Messenger · Instagram)

Servicio Node 22 + Fastify que recibe los webhooks de Meta, responde con IA (Claude) y deja todo en la
misma base Supabase del sitio (`byb-escuela`) para que el panel de **bybescuela.com/admin/chats** lo vea en
tiempo real. Es una adaptación del bot de AZ Estudio Contable / Aura Studio (mismo núcleo omnicanal) a la
escuela: en vez de agendar con contadores, **reserva citas y matricula cursos llamando a las mismas API
routes de la web** (`/api/disponibilidad`, `/api/reservas`, `/api/matriculas`), así una reserva por chat es
idéntica a una hecha en el sitio (misma tabla `citas`, mismo adelanto por Yape, misma captura).

## Qué hace

| Canal | Entra por | Responde |
|---|---|---|
| WhatsApp (+51 915 904 209) | `POST /webhook` | IA (Claude) con tools |
| Messenger / Instagram DM | `POST /webhook/meta` | IA (Claude) con tools |
| Comentarios FB / IG | `POST /webhook/meta` | Respuesta privada fija (opcional) + bandeja |
| Formulario del sitio | `POST /public/leads` | Solo bandeja (el staff responde por WhatsApp) |

Tools del agente: `consultar_servicios`, `consultar_cursos`, `consultar_disponibilidad`, `reservar_cita`,
`consultar_mis_citas`, `matricular_curso`, `guardar_datos_contacto`, `enviar_multimedia`, `escalar_a_humano`.

Si una clienta con un pago pendiente manda una **foto por el chat**, el bot la toma como la captura del Yape y
la sube a su reserva/matrícula por la misma ruta que la web (queda "en revisión" en Agenda/Matrículas).

## Rutas

- `GET /health`
- `GET|POST /webhook` (WhatsApp) · `GET|POST /webhook/meta` (Messenger/Instagram/comentarios)
- `POST /admin/mensajes`, `/admin/comentarios/:id/responder`, `/admin/ia/sugerencia`, `/admin/clientes/:id/telefono`,
  `/admin/clientes/:id/whatsapp`, `/admin/conversaciones/:id/visto`, `/admin/promociones`, `GET /admin/plantillas`,
  `GET /admin/canales/estado` — todas exigen `Authorization: Bearer <JWT de Supabase>` de un usuario con fila
  activa en `staff` (el panel las llama desde el servidor, ver `app/api/admin/bot/[...path]`).
  `GET /admin/canales/estado` devuelve, además del estado de cada canal, el bloque `webhooks`
  (`{ whatsapp, meta, verifyToken, verifyTokenMeta }`): las dos URLs de webhook armadas con `PUBLIC_BASE_URL`
  y los tokens de verificación, que el staff copia desde `/admin/canales` al registrar los webhooks en Meta.
  Es lo único "sensible" que sale por la API (solo sirve para el handshake de Meta) y nunca se loguea.
- `POST /public/leads` — formulario del sitio (header `x-byb-leads-token`).
- `POST /webhook/meta` también recibe los leads de formularios de anuncios (campo `leadgen` de la Página):
  ver `docs/referencia/CONFIGURAR-META.md` §9.

## Variables

Ver `.env.example`. Se leen **solo al arrancar**: tras cambiar una en Railway, reiniciar el servicio.
`WHATSAPP_REGISTER_PIN` hace que el bot registre el número en la API de la nube al arrancar (el botón
"Registrar" del panel de Meta falla sin detalle).

## Desarrollo

```bash
cd bot
npm install
cp .env.example .env   # completar
npm run dev            # tsx watch
npm run build && npm start
npm test               # vitest
```

## Despliegue (Railway)

Proyecto con **Root Directory** `bot` (usa el `Dockerfile`), dominio `bot.bybescuela.com`, variables de
`.env.example`. Comprobar `GET /health` y el `curl` de verificación del webhook antes de pegar la URL en Meta.
El paso a paso completo está en `GUIA-BOT-BYB.md` (raíz del repo).
