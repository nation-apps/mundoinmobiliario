# Mundo Motos — bot omnicanal de atención

Bot de **WhatsApp, Messenger e Instagram** con IA (Claude) para **Mundo Motos**, una agencia de motocicletas: resuelve
dudas, entiende qué moto busca cada persona y cómo piensa pagarla, guarda su perfil de compra y la pasa a un asesor para
cotizar, apartar, tramitar un crédito o agendar una visita. También recibe los leads de los formularios de anuncios de
Facebook e Instagram.

Salió del bot de B&B Escuela. Antes estuvo orientado a Mundo Inmobiliario; todo eso se quitó el 9 de octubre de 2026.

```
bot/        Servicio Node 22 + Fastify (se despliega en Railway, Root Directory /bot)
admin/      Panel de administración Next.js 16: bandeja de chats, fichas, etiquetas, canales y multimedia (Root Directory /admin)
supabase/   Migración con el esquema mínimo (chats, clientes, canales, etiquetas, gasto del bot)
docs/       Runbook para montar Meta desde cero y notas de referencia
GUIA-ARRANQUE.md   Qué falta y en qué orden
```

## Qué trae

- **Conversación:** prompt con los datos del negocio en `bot/src/config/business.ts`. Lo que diga `POR_DEFINIR` (modelos,
  precios, crédito, sucursales, horario) el bot no lo inventa: dice que un asesor lo confirma.
- **Herramientas del agente:** `guardar_datos_contacto`, `guardar_perfil_compra` (moto, uso, presupuesto, pago, plazo,
  ciudad), `enviar_multimedia` (catálogos, fichas y videos de la biblioteca) y `escalar_a_humano`.
- **Leads de anuncios:** los formularios instantáneos de Facebook e Instagram entran a Chats como «Formulario de anuncio»
  (`docs/referencia/CONFIGURAR-META.md` §9).
- **Voz humana y fiabilidad** (heredadas de B&B): lee y muestra «escribiendo…», pausa según el largo de la respuesta, junta
  mensajes seguidos en una sola respuesta, reintenta los envíos que fallan, no repite preguntas, no contesta a bots ajenos,
  y la etiqueta **Anulado** hace que el bot ignore a un contacto.
- **México:** teléfonos `52 + 10 dígitos` (acepta el `521` antiguo de Meta), zona horaria `America/Cancun` (UTC−5, una hora más que la Ciudad de México), plantillas `es_MX`.

## Panel de administración (`admin/`)

- **Chats:** bandeja en tiempo real, hilo, respuesta manual del asesor, sugerencia de la IA, ficha del cliente con su perfil de
  compra, etiquetas y notas. Filtros de canal, estado y etapa en menús desplegables con el conteo de cada opción; la campana
  del menú lateral lista los chats que esperan respuesta.
- **Coexistencia de WhatsApp:** el teléfono de ventas puede seguir en la app WhatsApp Business y a la vez en el CRM; lo que el
  equipo escribe desde el celular se refleja en el chat y lo pasa a «Yo» (`docs/referencia/COEXISTENCIA-WHATSAPP.md`).
- **Métricas** (solo administración): entradas por día y canal, origen de cada lead (las campañas de Meta), etapa actual,
  cierres, desempeño por vendedor, mediana de la primera respuesta de una persona (con meta de 5 min) y a qué hora escriben.
  Periodos: hoy, 7, 30 y 90 días y el mes en curso, en hora de Cancún (`lib/admin/metricas.ts`, cálculo puro).
- **Canales:** encender/apagar WhatsApp, Messenger e Instagram y la IA por canal; estado del webhook y del token.
- **Multimedia del bot:** catálogos, fichas técnicas, PDFs y videos que el bot puede enviar, cada uno con su nota de «cuándo mandarlo».
- Entra con un usuario de Supabase Auth que tenga fila en la tabla `staff`. El navegador nunca habla directo con el bot: el
  servidor del panel (`/api/admin/bot/*`) reenvía la acción con la sesión del staff y el bot la vuelve a validar.

## Probar en local

```bash
cd bot && npm ci && npx tsc --noEmit && npm test
cd ../admin && npm ci && cp .env.example .env.local   # llena las variables
npm run dev                                            # http://localhost:3000/admin
```

Más detalle de despliegue en `GUIA-ARRANQUE.md`.
