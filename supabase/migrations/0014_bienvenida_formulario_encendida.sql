-- El saludo automático a quien llena un formulario de anuncio y no toca el botón de WhatsApp pasa a venir ENCENDIDO por defecto
-- (a pedido del cliente). Sigue siendo un interruptor por línea en Ajustes → Bienvenida. El saludo directo (a quien escribe
-- primero) no cambia.
--
-- Solo sale si la línea de WhatsApp de esa marca está conectada, dentro del horario (8 a 21 h de Cancún) y con el tope por hora.

alter table public.mensajes_bienvenida alter column formulario_activo set default true;

update public.mensajes_bienvenida set formulario_activo = true where linea in ('tvs', 'mundo');
