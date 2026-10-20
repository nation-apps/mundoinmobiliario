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

## Campañas de clic a WhatsApp

Cuando alguien escribe desde un anuncio, WhatsApp adjunta los datos del anuncio al mensaje (`externalAdReply`). El bot los lee y
la conversación queda con su origen «Campaña WhatsApp Meta <marca>», igual que los formularios («Campaña Formulario Meta
<marca>»); el id y el título del anuncio se guardan en el mensaje. La marca sale de la página que publicó el anuncio
(`META_PAGINAS`, y `META_ADS_TOKEN` para saber de qué página es el anuncio). En el registro del bot aparece «Mensaje que llegó
desde un anuncio de clic a WhatsApp» con el id del anuncio: sirve para comprobar que llega.

## Mensajes de bienvenida (21-oct-2026)

El administrador escribe, **por línea**, la bienvenida de cada WhatsApp en el panel (**Ajustes → Bienvenida**; también la ven y cambian las
asistentes). Hay dos, cada una con su interruptor, **apagadas por defecto**:

- **Registro por formulario de campaña:** a quien llena un formulario de anuncios y dejó su teléfono, desde la línea de su marca. Su conversación
  pasa a ser de WhatsApp con las respuestas del formulario y el saludo juntos. Si el texto se deja vacío, el bot arma el saludo con las respuestas
  («Felicidades por registrarte… Mi nombre es <asesor>…»).
- **Mensaje directo:** a quien escribe por primera vez a la línea (campaña de clic a WhatsApp o mensaje directo), unos segundos después, una sola vez
  por chat, solo si el chat empieza atendido por una persona (si contesta el bot, el bot ya saluda) y si el equipo no le contestó antes.

El texto admite `{{nombre}}`, `{{asesor}}` (el vendedor que le tocó por el reparto), `{{marca}}` y, en el de formulario, `{{interes}}`.

**Es escribirle primero a gente que no ha escrito (el de formulario): lo que más bloquea números.** Protecciones: solo leads nuevos con teléfono, uno por
persona, nunca a quien ya tiene un chat de WhatsApp abierto, en cola con 45–120 s entre mensajes, horario (`LEADS_PRIMER_MENSAJE_DESDE_HORA` 8 a
`LEADS_PRIMER_MENSAJE_HASTA_HORA` 21, hora de Cancún), tope por hora (`LEADS_PRIMER_MENSAJE_MAX_POR_HORA`, 12) y una línea para pedir que no le escriban
(en el texto armado por el bot; si el administrador escribe el suyo, la pone él). Si el número no tiene WhatsApp o la línea está caída, el lead queda
como formulario. Código: `bot/src/agent/primerMensajeLead.ts` y `bienvenidaDirecta.ts`; tabla `mensajes_bienvenida` (0013).

Con el QR no hay ventana de 24 h: el panel deja escribir texto libre a cualquier chat de WhatsApp (`WHATSAPP_QR_ACTIVO=true` también en el servicio del panel).

## Origen según la línea y sin registros duplicados (20-oct-2026)

**Origen por número.** El bot atiende una línea a la vez y la marca sale de ese número (`bot/src/lib/lineas.ts`):

| Número | Llega por campaña de WhatsApp | Escribe directo |
|---|---|---|
| +52 998 758 4160 (TVS) | Campaña WhatsApp Meta TVS | WhatsApp Directo TVS |
| +52 998 870 6920 (Mundo de Motos) | Campaña WhatsApp Meta Mundo de Motos | WhatsApp Directo Mundo de Motos |

Desde el 21-oct-2026 cada número es una **línea** con su propia sesión (ver `LINEAS-WHATSAPP.md`): la marca sale de la línea por la que
llegó el mensaje, no del número que se escaneó. `WHATSAPP_LINEAS` (JSON) cambia o suma líneas.

**Un lead, un registro.** Quien llena un formulario y también le escribe a la línea no se duplica:
- Formulario primero, WhatsApp después (lo normal): el registro del formulario se **convierte** en el chat de WhatsApp y conserva
  «Campaña Formulario Meta …». Pasa igual cuando el equipo le escribe primero desde la ficha o desde el celular.
- WhatsApp primero, formulario después: el formulario se suma a ese chat, que pasa a «Campaña Formulario Meta …» (salvo que ya
  viniera de una campaña de WhatsApp: esa se respeta).
- Si la persona ya tiene un chat de WhatsApp abierto y además un formulario abierto (de antes de este cambio), quedan separados:
  hay que juntarlos a mano.

El saludo automático (apagado por defecto) usa las palabras del cliente: «¡Felicidades por registrarte! Sabemos que estás
interesado en la moto …. Mi nombre es <asesor> y te atenderé con mucho gusto», con el nombre del vendedor que le tocó por el reparto.

## Chats de campaña que WhatsApp no avisa (21-oct-2026)

Algunos mensajes que vienen de un anuncio (por ejemplo, anuncios en Estados) llegan con la señal de «anuncio» pero sin decir cuál,
o sin ninguna señal. El bot cuenta como campaña todo mensaje con señal de anuncio (aunque no sepa cuál) y, para los demás, anota en el
registro «Mensaje sin datos de anuncio» con los campos que trajo (sin datos personales), para entender qué falta. Si un lead de campaña
quedó como «WhatsApp Directo …», la ficha tiene un botón **Cambiar** junto al «Origen» para corregirlo a mano.
