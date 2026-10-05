# Mundo Motos — bot omnicanal para la inmobiliaria

Bot de **WhatsApp, Messenger e Instagram** con IA (Claude) para atender a quien quiere comprar, rentar, vender o invertir en una
propiedad: entiende qué busca, guarda su perfil ordenado para el asesor y, cuando está listo, lo pasa a una persona.

Salió del bot de B&B Escuela (el más completo hasta ahora) sin lo propio de ese negocio: cursos, citas, tienda, el evento
Star Beauty y los pagos por Yape.

```
bot/        Servicio Node 22 + Fastify (se despliega en Railway, Root Directory /bot)
admin/      Panel de administración Next.js 16: bandeja de chats, fichas, etiquetas, canales y multimedia (Root Directory /admin)
supabase/   Migración con el esquema mínimo (chats, clientes, canales, etiquetas, gasto del bot)
docs/       Runbook para montar Meta desde cero y notas de referencia
GUIA-ARRANQUE.md   Qué falta y en qué orden
```

## Qué trae

- **Conversación:** prompt de inmobiliaria con los datos del negocio en `bot/src/config/business.ts` (lo que diga
  `POR_DEFINIR` el bot no lo inventa: dice que un asesor lo confirma).
- **Herramientas del agente:** `guardar_datos_contacto`, `guardar_perfil_busqueda` (operación, tipo, zona, presupuesto,
  recámaras, plazo, forma de pago), `enviar_multimedia` (folletos y fotos de la biblioteca) y `escalar_a_humano`.
- **Voz humana y fiabilidad** (heredadas de B&B): lee y muestra «escribiendo…», pausa según el largo de la respuesta, junta
  mensajes seguidos en una sola respuesta, reintenta los envíos que fallan, no repite preguntas, no contesta a bots ajenos,
  y la etiqueta **Anulado** hace que el bot ignore a un contacto.
- **México:** teléfonos `52 + 10 dígitos` (acepta el `521` antiguo de Meta), zona horaria `America/Mexico_City`, plantillas `es_MX`.

## Panel de administración (`admin/`)

- **Chats:** bandeja en tiempo real, hilo, respuesta manual del asesor, sugerencia de la IA, ficha del cliente con su perfil de
  búsqueda (operación, zona, presupuesto…), etiquetas y notas.
- **Canales:** encender/apagar WhatsApp, Messenger e Instagram y la IA por canal; estado del webhook y del token.
- **Multimedia del bot:** folletos, fotos y videos que el bot puede enviar, cada uno con su nota de «cuándo mandarlo».
- Entra con un usuario de Supabase Auth que tenga fila en la tabla `staff`. El navegador nunca habla directo con el bot: el
  servidor del panel (`/api/admin/bot/*`) reenvía la acción con la sesión del staff y el bot la vuelve a validar.

## Probar en local

```bash
cd bot && npm ci && npx tsc --noEmit && npm test
cd ../admin && npm ci && cp .env.example .env.local   # llena las variables
npm run dev                                            # http://localhost:3000/admin
```

Más detalle de despliegue en `GUIA-ARRANQUE.md`.
