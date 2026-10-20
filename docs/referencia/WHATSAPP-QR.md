# WhatsApp por QR (Baileys): conexión NO oficial

Fecha de referencia: **19-oct-2026**. Es una alternativa a la API oficial de Meta (coexistencia) para pruebas o cuando no se
puede dar de alta un número con un proveedor autorizado.

## Qué es y el riesgo

- El bot se vincula como **un dispositivo más** del número (igual que WhatsApp Web) con la librería Baileys
  (`@whiskeysockets/baileys`, la misma base de Evolution API, que usa PowerWhats).
- **No está autorizado por Meta.** WhatsApp puede **bloquear el número**, sobre todo con envíos masivos o a gente que no
  ha escrito primero. Sin garantías ni a quién reclamar. Usarlo con un número de prueba; el cliente aceptó el riesgo.

## Qué hace el bot en este modo

- Con `WHATSAPP_QR_ACTIVO=true`, todo lo de WhatsApp (recibir, contestar, enviar fotos y documentos, «escribiendo…») va por
  el número vinculado y **no** por la API de Meta. Con `false` (por defecto) nada cambia.
- Entra a Chats lo que escriben los clientes; el bot contesta igual que siempre. Lo que el equipo escribe desde el
  celular se refleja como «Equipo · celular» y el chat pasa a «Yo» (mismo mecanismo que la coexistencia).
- **No manda plantillas ni difusiones** (`sendTemplate` falla a propósito): no se le escribe primero a nadie.
- Los botones interactivos salen como una lista de opciones en texto.
- Tope de mensajes por minuto (`WHATSAPP_QR_MAX_POR_MINUTO`, 15) y una pausa corta al azar entre mensajes.
- Solo chats uno a uno: grupos, estados y difusiones se ignoran. Videos, stickers y ubicaciones no se procesan.

## Cómo se activa

1. Correr `supabase/migrations/0010_whatsapp_qr.sql` (tabla `whatsapp_qr_sesion`, solo accesible por la service role).
2. Variable `WHATSAPP_QR_ACTIVO=true` en el servicio del bot (Railway).
3. Panel → **Canales** → «WhatsApp por QR» → **Generar QR** → en el celular: Ajustes → Dispositivos vinculados →
   Vincular un dispositivo → escanear.
4. La sesión se guarda en Supabase: sobrevive a los despliegues. **Desvincular número** la borra.

## Cosas a saber

- La sesión solo puede estar abierta en **un** proceso. Si se abre en otro lugar, el bot no pelea la sesión (se queda
  «Desconectado»); hay que volver a conectar desde el panel.
- Si desvinculan el dispositivo desde el celular, el bot borra la sesión y hay que escanear otro QR.
- Los avisos de «cliente pide asesor» (`ESCALATION_PHONE`) también salen por este número.
- Código: `bot/src/whatsapp-qr/` (`sesion.ts`, `authSupabase.ts`, `mapeo.ts`). Pruebas: `bot/tests/whatsappQrMapeo.test.ts`.

## Quién atiende las conversaciones nuevas

Desde el 20-oct-2026 toda conversación nueva nace en **«Yo»** (atiende una persona): el bot guarda el mensaje pero no contesta.
Quien quiera que conteste el bot mueve el interruptor Bot/Yo del chat. Para que el bot conteste desde el primer mensaje,
poner `BOT_ACTIVO_POR_DEFECTO=true` en el servicio del bot.
