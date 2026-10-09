-- Horario del documento «INFORMACIÓN CRM» (9-oct-2026): lunes a viernes de 9 am a 7 pm, y sábado y domingo de
-- 9 am a 2 pm. Lo mismo que dice el bot (bot/src/config/business.ts → horarioTexto). Idempotente. Correr DESPUÉS de 0001–0006.

update public.respuestas_rapidas
set contenido = 'Estamos en Avenida Yaxchilán 573, Cancún, Quintana Roo. Te esperamos de lunes a viernes de 9 am a 7 pm, y sábado y domingo de 9 am a 2 pm.'
where atajo = 'ubicacion';
