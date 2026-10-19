-- Conexión de WhatsApp por QR (Baileys, NO oficial de Meta): guarda la sesión del número vinculado para que sobreviva
-- a los reinicios y despliegues del bot. Idempotente. Correr DESPUÉS de 0001–0009.
--
-- IMPORTANTE: esta tabla guarda las llaves de cifrado de la sesión de WhatsApp. Con RLS activa y SIN ninguna política,
-- solo la service role (el bot) puede leerla o escribirla: el panel y el navegador nunca la ven.

create table if not exists public.whatsapp_qr_sesion (
  clave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_qr_sesion enable row level security;
revoke all on public.whatsapp_qr_sesion from anon, authenticated;

comment on table public.whatsapp_qr_sesion is
  'Sesión de WhatsApp vinculada por QR (Baileys): credenciales y llaves Signal. Solo la service role la usa; no crear políticas.';
