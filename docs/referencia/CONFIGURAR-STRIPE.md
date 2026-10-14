# Cobro del CRM con Stripe (39 USD al mes)

Fecha de referencia: **14-oct-2026**. El cobro es una **suscripción mensual** en Stripe. El panel muestra su estado y, si
se exige, bloquea el acceso cuando no hay una suscripción vigente.

## Qué hace

| Pieza | Dónde | Qué hace |
|---|---|---|
| Página «Suscripción» | Panel → Ajustes → Suscripción (solo quien administra) | Muestra el estado y la próxima renovación. «Activar suscripción» lleva a Stripe Checkout; «Administrar pago» abre el portal de Stripe (tarjeta, facturas, cancelar). |
| Webhook | `POST /stripe/webhook` del bot | Stripe avisa de cada cobro; el bot valida la firma y actualiza la tabla `suscripcion`. |
| Control de acceso | Layout y páginas del panel | Con `SUSCRIPCION_OBLIGATORIA=true`: sin suscripción vigente el panel se cierra (quien administra va a pagar; el resto ve «Acceso suspendido»). |

**La tarjeta nunca pasa por el panel ni por el bot:** se escribe en la página de Stripe.

## Estados y acceso

| Estado | Acceso al panel |
|---|---|
| `activa`, `en_prueba` | Sí |
| `pago_pendiente` (el cobro falló; Stripe reintenta) | Sí, **5 días de gracia** desde que falló; luego no |
| `impago`, `cancelada`, `incompleta`, `sin_suscripcion` | No (si se exige) |

Una suscripción cancelada «al final del periodo» sigue `activa` hasta que termina lo ya pagado; entonces Stripe la da de
baja. Un fallo al **leer** el estado (migración sin correr, base caída) **no** bloquea el panel.

## Puesta en marcha (primero en modo de prueba)

1. **Migración.** En el SQL editor de Supabase del proyecto, correr `supabase/migrations/0008_suscripcion.sql`
   (idempotente: crea `suscripcion` y `stripe_eventos`).
2. **Stripe, modo de prueba** (interruptor «Modo de prueba» en el panel de Stripe):
   - *Developers → Webhooks → Add endpoint*: URL `https://<bot>/stripe/webhook` y estos eventos:
     `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.payment_failed`. Copiar el **signing secret** (`whsec_…`).
   - *Settings → Billing → Customer portal*: activar el portal y permitir actualizar la tarjeta y cancelar.
   - *Developers → API keys*: copiar la clave secreta de prueba (`sk_test_…`) o crear una **restringida** con
     «Checkout Sessions: Write», «Customer portal: Write» y «Customers: Write».
3. **Cargar las claves en Railway sin pasar por el chat:**
   ```bash
   bash scripts/configurar-stripe.sh
   ```
   Pide cada valor con la escritura oculta y los guarda en el servicio del bot (`STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `PANEL_PUBLIC_URL`). El bot se reinicia solo.
4. **Probar:** entrar al panel como administración → *Suscripción* → *Activar suscripción* → tarjeta de prueba
   `4242 4242 4242 4242`, cualquier fecha futura y CVC. Al volver, el estado pasa a «Activa» en unos segundos.
   Probar un cobro fallido con `4000 0000 0000 0341` y revisar el aviso y los 5 días de gracia.
5. **Pasar a producción:** repetir el paso 2 en modo real (nuevo endpoint y nuevas claves), volver a correr el script y,
   cuando se quiera exigir el pago, en el servicio del **panel**:
   ```bash
   railway variables -s joyful-peace --set SUSCRIPCION_OBLIGATORIA=true
   ```
   Hasta entonces el panel no bloquea a nadie, aunque la página de suscripción ya funcione.

## Variables

| Variable | Servicio | Qué es |
|---|---|---|
| `STRIPE_SECRET_KEY` | bot | Clave secreta o restringida de Stripe |
| `STRIPE_WEBHOOK_SECRET` | bot | Secreto de firma del endpoint (`whsec_…`) |
| `STRIPE_PRICE_ID` | bot | Opcional: `price_…` de un producto ya creado. Sin él se cobran `STRIPE_PRECIO_CENTAVOS` (3900 = 39 USD) al mes |
| `PANEL_PUBLIC_URL` | bot | Dirección pública del panel; a ella vuelve Stripe tras pagar |
| `SUSCRIPCION_OBLIGATORIA` | panel | `true` para exigir la suscripción |

## Seguridad

- Cada aviso de Stripe se valida con HMAC-SHA256 sobre el cuerpo crudo y se rechazan los de más de 5 minutos.
- Cada evento se aplica una sola vez (`stripe_eventos`) y los avisos que llegan fuera de orden se descartan.
- Solo el rol `admin` puede iniciar el pago o abrir el portal; el bot lo valida de nuevo aunque el panel lo oculte.
- Las claves viven solo en Railway; nunca en el repositorio ni en el navegador.
