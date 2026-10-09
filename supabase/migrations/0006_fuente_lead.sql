-- Origen de cada lead («fuente»): de qué campaña y página vino, con las etiquetas que pidió el cliente
-- («Campaña Formulario Meta TVS», «Campaña WhatsApp Meta Mundo de Motos»…) y las de lo que no es campaña
-- («WhatsApp directo», «Instagram», «Formulario web»…). La pone el bot al crear la conversación (bot/src/lib/fuente.ts);
-- el cliente guarda la de su primer contacto. Idempotente. Correr DESPUÉS de 0001–0005.

alter table public.conversaciones add column if not exists fuente text;
alter table public.clientes add column if not exists fuente text;
comment on column public.conversaciones.fuente is
  'De dónde vino esta conversación: «Campaña Formulario Meta <marca>», «Campaña WhatsApp Meta <marca>», «WhatsApp directo», «Instagram», «Messenger», «Formulario web», «Comentario …». La pone el bot.';
comment on column public.clientes.fuente is 'Origen del primer contacto del cliente (la fuente de su primera conversación con fuente).';
create index if not exists conversaciones_fuente_idx on public.conversaciones (fuente);
create index if not exists clientes_fuente_idx on public.clientes (fuente);

-- Lo que ya existía: se deduce del canal (sin la página, que antes no se guardaba).
update public.conversaciones cv
set fuente = case
  when cv.origen = 'formulario' and cv.hilo_externo = 'facebook_lead_ads' then 'Campaña Formulario Meta'
  when cv.origen = 'formulario' then 'Formulario web'
  when cv.origen = 'comentario' then
    'Comentario ' || case cv.canal when 'instagram' then 'Instagram' when 'tiktok' then 'TikTok' else 'Facebook' end
  when cv.canal = 'whatsapp' and exists (
    select 1 from public.mensajes m where m.conversacion_id = cv.id and m.metadata ? 'anuncio'
  ) then 'Campaña WhatsApp Meta'
  when cv.canal = 'whatsapp' then 'WhatsApp directo'
  when cv.canal = 'instagram' then 'Instagram'
  when cv.canal = 'messenger' then 'Messenger'
  when cv.canal = 'tiktok' then 'TikTok'
end
where cv.fuente is null;

-- El cliente se queda con la fuente de su primer contacto.
create or replace function public.clientes_fuente_primer_contacto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fuente is not null then
    update public.clientes set fuente = new.fuente where id = new.cliente_id and fuente is null;
  end if;
  return null;
end;
$$;
revoke execute on function public.clientes_fuente_primer_contacto() from public, anon, authenticated;
drop trigger if exists clientes_fuente_primer_contacto on public.conversaciones;
create trigger clientes_fuente_primer_contacto
after insert or update of fuente on public.conversaciones
for each row execute function public.clientes_fuente_primer_contacto();

update public.clientes c
set fuente = (
  select cv.fuente from public.conversaciones cv
  where cv.cliente_id = c.id and cv.fuente is not null
  order by cv.created_at
  limit 1
)
where c.fuente is null;

-- La vista de la bandeja suma las dos columnas AL FINAL (create or replace solo admite agregar columnas al final).
create or replace view public.conversaciones_resumen
with (security_invoker = true) as
select
  cv.id,
  cv.cliente_id,
  cv.estado,
  cv.created_at,
  cv.canal,
  cv.origen,
  cv.hilo_externo,
  cv.cuenta_id,
  cv.identidad_id,
  cv.etapa,
  cv.motivo_cierre,
  cv.asignada_a,
  s.nombre as asignada_nombre,
  c.nombre as cliente_nombre,
  c.telefono as cliente_telefono,
  c.email as cliente_email,
  c.tipo as cliente_tipo,
  c.interes as cliente_interes,
  c.perfil as cliente_perfil,
  c.canal_origen as cliente_canal_origen,
  ci.nombre_perfil as identidad_nombre,
  ci.username as identidad_username,
  ci.foto_url as identidad_foto,
  m.contenido as ultimo_contenido,
  m.rol as ultimo_rol,
  m.tipo as ultimo_tipo,
  cv.ultimo_mensaje_at,
  cv.ultimo_comentario_at,
  cv.ultima_respuesta_at,
  cv.primera_respuesta_at,
  cv.primera_respuesta_humana_at,
  greatest(
    cv.ultimo_mensaje_at,
    coalesce(cv.ultimo_comentario_at, cv.ultimo_mensaje_at),
    coalesce(cv.ultima_respuesta_at, cv.ultimo_mensaje_at)
  ) as actividad_at,
  cv.fuente,
  c.fuente as cliente_fuente
from public.conversaciones cv
join public.clientes c on c.id = cv.cliente_id
left join public.cliente_identidades ci on ci.id = cv.identidad_id
left join public.staff s on s.user_id = cv.asignada_a
left join lateral (
  select mm.contenido, mm.rol, mm.tipo
  from public.mensajes mm
  where mm.conversacion_id = cv.id and mm.tipo <> 'nota'
  order by mm.created_at desc
  limit 1
) m on true;

grant select on public.conversaciones_resumen to authenticated, service_role;
