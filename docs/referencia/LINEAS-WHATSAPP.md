# Dos líneas de WhatsApp: TVS y Mundo de Motos

Fecha de referencia: **21-oct-2026**. Pedido del cliente: poder tener conectados los dos números a la vez, que cada vendedor atienda
las líneas que le tocan y que, al escribir en un chat, se pueda elegir desde cuál mandar.

## Cómo funciona

- Hay **dos líneas** (`bot/src/lib/lineas.ts`): `tvs` (WhatsApp TVS, +52 998 758 4160) y `mundo` (WhatsApp Mundo de Motos,
  +52 998 870 6920). `WHATSAPP_LINEAS` (JSON) cambia o suma líneas.
- Cada línea es una **sesión de WhatsApp por QR independiente** (`bot/src/whatsapp-qr/sesion.ts`): su QR, su conexión, su cola de envío
  y su tope de mensajes por minuto. En Canales hay una tarjeta por línea. Si se escanea un número que no es el esperado, la tarjeta lo avisa.
- Cada conversación de WhatsApp pertenece a una línea (`conversaciones.linea`). Una persona que escribe a las dos líneas tiene **un chat por línea**.
  Lo que ya existía quedó en la línea de TVS (era la única conectada).
- **Origen según la línea:** lo que llega por la línea de TVS sale como «WhatsApp Directo TVS» o «Campaña WhatsApp Meta TVS»; por la de Mundo
  de Motos, «… Mundo de Motos».
- **Línea por defecto de un lead de formulario:** la de su marca («Campaña Formulario Meta TVS» → TVS). Por ahí sale el saludo automático
  y por ahí se le escribe primero. Sin saber la marca no se le escribe solo.
- **Quién recibe qué:** cada persona tiene las líneas que atiende (`staff.lineas`; por defecto, las dos), editables en
  **Reparto de leads → Líneas de WhatsApp por persona**. El reparto automático solo asigna los chats de esas líneas.
- **Al escribir en el panel** hay un selector «Enviar desde». Si se elige la otra línea, al enviar **el chat se pasa a esa línea**, para que la
  respuesta del cliente caiga en el mismo chat.
- Las respuestas del bot, los acuses, los reenvíos y los archivos salen siempre por la línea del chat. Nunca se «cae» a otra línea en silencio:
  si la línea no está conectada, el envío falla y se avisa.

## Sesiones guardadas

La tabla `whatsapp_qr_sesion` no cambió: la línea de TVS usa las claves de siempre (sin prefijo) y las demás las prefijan con «<línea>:».
Así la sesión de TVS que ya estaba conectada no se pierde al publicar. Desvincular una línea solo borra lo suyo.

## Migración

`supabase/migrations/0012_lineas_whatsapp.sql`: columna `conversaciones.linea`, columna `staff.lineas`, el reparto con filtro por línea y la vista de la
bandeja con la línea. Es compatible con el bot anterior: se puede correr antes de publicar. **Hay que correrla ANTES de publicar el bot nuevo.**
