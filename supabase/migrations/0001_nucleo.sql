-- Mundo Inmobiliario — núcleo del bot de WhatsApp / Messenger / Instagram y la bandeja de chats
--
-- Esquema mínimo, sacado del bot de B&B Escuela (migraciones 0001 a 0010) sin lo que no aplica a una inmobiliaria:
-- sin cursos, citas del sitio, tienda, ventas ni entradas de evento. El bot (carpeta `bot/`, corre en Railway con la
-- service role) escribe aquí; el panel de chats lee con la sesión del equipo y RLS.
--
--   staff           → quién del equipo entra al panel (admin, asistente, vendedor)
--   clientes        → cada persona que escribe (el teléfono se guarda como 52 + 10 dígitos); `perfil` guarda lo que
--                     busca (operación, zona, presupuesto…) y lo llena guardar_perfil_busqueda
--   conversaciones / mensajes / canales / etiquetas / respuestas rápidas / multimedia / gasto diario del bot
--
-- Idempotente: se puede volver a correr sin romper nada.

create extension if not exists pgcrypto;

-- ============ Utilidad compartida ============

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ============ Equipo y control de acceso ============

create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null,
  rol text not null default 'admin' check (rol in ('admin', 'asistente', 'vendedor')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;

-- Cualquier persona activa del equipo (también vendedor): atiende chats y ve clientes.
create or replace function public.puede_atender()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and activo);
$$;
grant execute on function public.puede_atender() to authenticated;
revoke execute on function public.puede_atender() from anon, public;

-- Admin y asistente (no vendedor): para lo que un vendedor no debe tocar.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and activo and rol <> 'vendedor');
$$;
grant execute on function public.is_staff() to authenticated;
revoke execute on function public.is_staff() from anon, public;

drop policy if exists "Staff se ve a sí mismo" on public.staff;
create policy "Staff se ve a sí mismo"
on public.staff for select to authenticated using (user_id = auth.uid() or public.is_staff());

-- ============ Clientes ============

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  telefono text unique,                       -- "52" + 10 dígitos; null en un lead de Instagram/Messenger sin teléfono
  nombre text,
  email text,
  notas text,
  perfil jsonb not null default '{}'::jsonb,  -- experiencia, objetivo, capital, plazo, ubicacion, notas
  canal_origen text not null default 'whatsapp',
  tipo text not null default 'prospecto',
  interes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clientes_canal_origen_check check (canal_origen in ('whatsapp', 'messenger', 'instagram', 'tiktok', 'web', 'manual')),
  constraint clientes_tipo_check check (tipo in ('prospecto', 'cliente', 'ex_cliente')),
  constraint clientes_interes_check check (interes is null or interes in ('seminario', 'programa_avanzado', 'mentoria', 'master', 'libro', 'otro'))
);
comment on column public.clientes.canal_origen is 'Por dónde llegó la primera vez; no cambia aunque después escriba por otro canal.';
comment on column public.clientes.interes is 'Qué le interesa: seminario, programa avanzado, mentoría, máster, libro u otro.';
comment on column public.clientes.perfil is 'Lo que cuenta de lo que busca, ordenado para el asesor (lo escribe guardar_perfil_busqueda).';
create index if not exists clientes_created_idx on public.clientes (created_at desc);

drop trigger if exists clientes_set_updated_at on public.clientes;
create trigger clientes_set_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

alter table public.clientes enable row level security;
drop policy if exists "Equipo gestiona clientes" on public.clientes;
create policy "Equipo gestiona clientes"
on public.clientes for all to authenticated using (public.puede_atender()) with check (public.puede_atender());

-- ============ Identidades por canal ============

create table if not exists public.cliente_identidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  canal text not null,
  tipo text not null,
  external_id text not null,
  cuenta_id text,
  nombre_perfil text,
  username text,
  foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cliente_identidades_canal_check check (canal in ('whatsapp', 'messenger', 'instagram', 'tiktok')),
  constraint cliente_identidades_tipo_check check (tipo in (
    'wa_id', 'psid', 'igsid', 'fb_comment_user', 'ig_comment_user', 'tt_user', 'tt_comment_user'
  )),
  constraint cliente_identidades_unica unique (canal, tipo, external_id)
);
create index if not exists cliente_identidades_cliente_idx on public.cliente_identidades (cliente_id);
drop trigger if exists cliente_identidades_set_updated_at on public.cliente_identidades;
create trigger cliente_identidades_set_updated_at
before update on public.cliente_identidades
for each row execute function public.set_updated_at();
alter table public.cliente_identidades enable row level security;
drop policy if exists "Equipo ve identidades" on public.cliente_identidades;
create policy "Equipo ve identidades"
on public.cliente_identidades for select to authenticated using (public.puede_atender());

-- ============ Canales (interruptores de IA por canal) ============

create table if not exists public.canales (
  canal text primary key,
  activo boolean not null default true,
  ia_activa boolean not null default true,
  ia_comentarios_activa boolean not null default false,
  texto_respuesta_privada text,
  cuenta_id text,
  cuenta_nombre text,
  ultimo_webhook_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint canales_canal_check check (canal in ('whatsapp', 'messenger', 'instagram', 'tiktok'))
);
drop trigger if exists canales_set_updated_at on public.canales;
create trigger canales_set_updated_at
before update on public.canales
for each row execute function public.set_updated_at();
alter table public.canales enable row level security;
drop policy if exists "Equipo ve canales" on public.canales;
create policy "Equipo ve canales"
on public.canales for select to authenticated using (public.puede_atender());
drop policy if exists "Equipo edita canales" on public.canales;
create policy "Equipo edita canales"
on public.canales for update to authenticated using (public.puede_atender()) with check (public.puede_atender());

insert into public.canales (canal) values ('whatsapp'), ('messenger'), ('instagram'), ('tiktok')
on conflict (canal) do nothing;

-- ============ Conversaciones ============

create table if not exists public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  canal text not null default 'whatsapp',
  origen text not null default 'dm',
  identidad_id uuid references public.cliente_identidades(id),
  hilo_externo text,
  cuenta_id text,
  ultimo_mensaje_at timestamptz not null default now(),
  ultimo_comentario_at timestamptz,
  ultima_respuesta_at timestamptz,
  primera_respuesta_at timestamptz,
  primera_respuesta_humana_at timestamptz,
  estado text not null default 'activa',
  etapa text not null default 'nuevo',
  motivo_cierre text,
  asignada_a uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint conversaciones_estado_check check (estado in ('activa', 'escalada', 'cerrada')),
  constraint conversaciones_canal_check check (canal in ('whatsapp', 'messenger', 'instagram', 'tiktok', 'web')),
  constraint conversaciones_origen_check check (origen in ('dm', 'comentario', 'formulario')),
  -- 'agendado' = llamada o sesión agendada
  constraint conversaciones_etapa_check check (etapa in ('nuevo', 'en_atencion', 'calificado', 'agendado', 'propuesta', 'cerrado')),
  constraint conversaciones_motivo_cierre_check
    check (motivo_cierre is null or motivo_cierre in ('ganado', 'perdido', 'spam', 'sin_respuesta', 'otro'))
);
create unique index if not exists conversaciones_hilo_abierto_idx
  on public.conversaciones (identidad_id, (coalesce(hilo_externo, '')))
  where estado <> 'cerrada';
create index if not exists conversaciones_cliente_idx on public.conversaciones (cliente_id);
create index if not exists conversaciones_canal_estado_idx on public.conversaciones (canal, estado);
create index if not exists conversaciones_asignada_idx on public.conversaciones (asignada_a) where estado <> 'cerrada';
create index if not exists conversaciones_etapa_idx on public.conversaciones (etapa);
create index if not exists conversaciones_created_at_idx on public.conversaciones (created_at desc);

alter table public.conversaciones enable row level security;
drop policy if exists "Equipo ve conversaciones" on public.conversaciones;
create policy "Equipo ve conversaciones"
on public.conversaciones for select to authenticated using (public.puede_atender());
drop policy if exists "Equipo edita conversaciones" on public.conversaciones;
create policy "Equipo edita conversaciones"
on public.conversaciones for update to authenticated using (public.puede_atender()) with check (public.puede_atender());

-- ============ Mensajes ============

create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  rol text not null,
  tipo text not null default 'mensaje',
  contenido text not null,
  external_id text,
  wa_message_id text,
  media_url text,
  media_type text,
  media_path text,
  error_entrega text,
  autor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint mensajes_rol_check check (rol in ('user', 'assistant', 'humano')),
  constraint mensajes_tipo_check check (tipo in ('mensaje', 'comentario', 'nota', 'sistema')),
  constraint mensajes_media_type_check check (media_type is null or media_type in ('image', 'video', 'audio', 'document'))
);
create unique index if not exists mensajes_external_id_idx on public.mensajes (external_id) where external_id is not null;
create index if not exists mensajes_wa_message_id_idx on public.mensajes (wa_message_id) where wa_message_id is not null;
create index if not exists mensajes_conversacion_idx on public.mensajes (conversacion_id, created_at);
create index if not exists mensajes_conversacion_tipo_idx on public.mensajes (conversacion_id, tipo, created_at);

alter table public.mensajes enable row level security;
drop policy if exists "Equipo ve mensajes" on public.mensajes;
create policy "Equipo ve mensajes"
on public.mensajes for select to authenticated using (public.puede_atender());
-- Lo único que el panel escribe directo son notas internas (nunca se envían).
drop policy if exists "Equipo inserta notas" on public.mensajes;
create policy "Equipo inserta notas"
on public.mensajes for insert to authenticated
with check (public.puede_atender() and tipo = 'nota' and rol = 'humano' and autor_id = auth.uid());

-- ============ Etiquetas de contactos ============

create table if not exists public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  color text not null default 'slate',
  created_at timestamptz not null default now(),
  constraint etiquetas_color_check check (color in ('slate', 'rose', 'amber', 'emerald', 'sky', 'violet'))
);
create table if not exists public.cliente_etiquetas (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas(id) on delete cascade,
  primary key (cliente_id, etiqueta_id)
);
alter table public.etiquetas enable row level security;
alter table public.cliente_etiquetas enable row level security;
drop policy if exists "Equipo gestiona etiquetas" on public.etiquetas;
create policy "Equipo gestiona etiquetas"
on public.etiquetas for all to authenticated using (public.puede_atender()) with check (public.puede_atender());
drop policy if exists "Equipo gestiona cliente_etiquetas" on public.cliente_etiquetas;
create policy "Equipo gestiona cliente_etiquetas"
on public.cliente_etiquetas for all to authenticated using (public.puede_atender()) with check (public.puede_atender());

-- «Anulado»: contactos que no son el público del negocio. El bot no les contesta ni les escribe; no la renombres.
insert into public.etiquetas (nombre, color) values
  ('Anulado', 'rose'), ('Seminario', 'sky'), ('Programa Avanzado', 'violet'), ('Mentoría', 'amber'), ('Máster', 'emerald')
on conflict (nombre) do nothing;

-- ============ Respuestas rápidas ============

create table if not exists public.respuestas_rapidas (
  id uuid primary key default gen_random_uuid(),
  atajo text not null unique,
  titulo text not null,
  contenido text not null,
  canal text,
  activa boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint respuestas_rapidas_canal_check
    check (canal is null or canal in ('whatsapp', 'messenger', 'instagram', 'tiktok'))
);
drop trigger if exists respuestas_rapidas_set_updated_at on public.respuestas_rapidas;
create trigger respuestas_rapidas_set_updated_at
before update on public.respuestas_rapidas
for each row execute function public.set_updated_at();
alter table public.respuestas_rapidas enable row level security;
drop policy if exists "Equipo gestiona respuestas_rapidas" on public.respuestas_rapidas;
create policy "Equipo gestiona respuestas_rapidas"
on public.respuestas_rapidas for all to authenticated using (public.puede_atender()) with check (public.puede_atender());

insert into public.respuestas_rapidas (atajo, titulo, contenido, sort_order) values
  ('hola', 'Saludo', 'Hola {{nombre}}, te escribimos de Mundo Inmobiliario. ¿En qué te podemos ayudar?', 1),
  ('seminario', 'Invitar al seminario', 'Con gusto. Aquí puedes registrarte al seminario gratuito: https://eventos.mundoinmobiliario.tv/gratis/seminario', 2),
  ('datos', 'Pedir datos', '¿Me compartes tu nombre completo y, si quieres, tu correo para que el asesor te mande la información?', 3)
on conflict (atajo) do nothing;

-- ============ Eventos de conversación (auditoría) ============

create table if not exists public.eventos_conversacion (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  tipo text not null,
  actor_id uuid references auth.users(id) on delete set null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint eventos_conversacion_tipo_check check (tipo in (
    'asignacion', 'etapa', 'estado', 'cierre', 'fusion', 'respuesta_privada', 'escalada', 'documento', 'visita'
  ))
);
create index if not exists eventos_conversacion_conv_idx on public.eventos_conversacion (conversacion_id, created_at desc);
create index if not exists eventos_conversacion_tipo_idx on public.eventos_conversacion (tipo, created_at desc);
alter table public.eventos_conversacion enable row level security;
drop policy if exists "Equipo ve eventos" on public.eventos_conversacion;
create policy "Equipo ve eventos"
on public.eventos_conversacion for select to authenticated using (public.puede_atender());

-- ============ Biblioteca multimedia (temarios, PDFs, videos que el bot puede mandar) ============

create table if not exists public.plantillas_media (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null,
  storage_path text not null,
  descripcion_uso text not null,
  caption text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plantillas_media_tipo_check check (tipo in ('image', 'video', 'audio', 'document'))
);
drop trigger if exists plantillas_media_set_updated_at on public.plantillas_media;
create trigger plantillas_media_set_updated_at
before update on public.plantillas_media
for each row execute function public.set_updated_at();
alter table public.plantillas_media enable row level security;
drop policy if exists "Equipo gestiona plantillas_media" on public.plantillas_media;
create policy "Equipo gestiona plantillas_media"
on public.plantillas_media for all to authenticated using (public.puede_atender()) with check (public.puede_atender());

-- ============ Gasto diario del bot ============

create table if not exists public.bot_daily_usage (
  usage_date date primary key,
  tokens_used bigint not null default 0
);
alter table public.bot_daily_usage enable row level security;
drop policy if exists "Equipo ve gasto" on public.bot_daily_usage;
create policy "Equipo ve gasto"
on public.bot_daily_usage for select to authenticated using (public.puede_atender());

create or replace function public.increment_bot_usage(p_date date, p_tokens bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.bot_daily_usage (usage_date, tokens_used)
  values (p_date, p_tokens)
  on conflict (usage_date) do update set tokens_used = public.bot_daily_usage.tokens_used + excluded.tokens_used;
$$;
revoke execute on function public.increment_bot_usage(date, bigint) from public, anon, authenticated;

-- ============ Solicitudes de eliminación de datos (URL legal que pide Meta) ============

create table if not exists public.solicitudes_eliminacion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  canal text not null,
  external_id text not null,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  constraint solicitudes_eliminacion_estado_check check (estado in ('pendiente', 'completada'))
);
alter table public.solicitudes_eliminacion enable row level security;
drop policy if exists "Equipo ve solicitudes_eliminacion" on public.solicitudes_eliminacion;
create policy "Equipo ve solicitudes_eliminacion"
on public.solicitudes_eliminacion for select to authenticated using (public.puede_atender());

-- ============ Storage: adjuntos entrantes (privado) y biblioteca (público) ============

insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('plantillas-media', 'plantillas-media', true)
on conflict (id) do nothing;

drop policy if exists "Equipo lee adjuntos" on storage.objects;
create policy "Equipo lee adjuntos"
on storage.objects for select to authenticated
using (bucket_id = 'adjuntos' and public.puede_atender());

drop policy if exists "Cualquiera lee plantillas-media" on storage.objects;
create policy "Cualquiera lee plantillas-media"
on storage.objects for select to anon, authenticated
using (bucket_id = 'plantillas-media');

drop policy if exists "Equipo gestiona plantillas-media" on storage.objects;
create policy "Equipo gestiona plantillas-media"
on storage.objects for all to authenticated
using (bucket_id = 'plantillas-media' and public.puede_atender())
with check (bucket_id = 'plantillas-media' and public.puede_atender());

-- ============ Triggers de negocio ============

-- Un mensaje nuevo mueve los relojes de la conversación (ventana de 24 h, primera respuesta, «sin responder»).
create or replace function public.mensajes_actualiza_conversacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol = 'user' and new.tipo = 'mensaje' then
    update public.conversaciones set ultimo_mensaje_at = new.created_at where id = new.conversacion_id;
  elsif new.rol = 'user' and new.tipo = 'comentario' then
    update public.conversaciones set ultimo_comentario_at = new.created_at where id = new.conversacion_id;
  elsif new.rol in ('assistant', 'humano') and new.tipo in ('mensaje', 'comentario') then
    update public.conversaciones
       set ultima_respuesta_at = new.created_at,
           primera_respuesta_at = coalesce(primera_respuesta_at, new.created_at),
           primera_respuesta_humana_at = case
             when new.rol = 'humano' then coalesce(primera_respuesta_humana_at, new.created_at)
             else primera_respuesta_humana_at
           end,
           etapa = case when new.rol = 'humano' and etapa = 'nuevo' then 'en_atencion' else etapa end
     where id = new.conversacion_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.mensajes_actualiza_conversacion() from public, anon, authenticated;
drop trigger if exists mensajes_actualiza_conversacion on public.mensajes;
create trigger mensajes_actualiza_conversacion
after insert on public.mensajes
for each row execute function public.mensajes_actualiza_conversacion();

-- Asignar a alguien o cerrar mueve la etapa sola.
create or replace function public.conversaciones_etapa_asignacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.asignada_a is not null and old.asignada_a is null and new.etapa = 'nuevo' then
    new.etapa := 'en_atencion';
  end if;
  if new.estado = 'cerrada' and old.estado <> 'cerrada' and new.etapa <> 'cerrado' then
    new.etapa := 'cerrado';
  end if;
  if new.etapa = 'cerrado' and new.motivo_cierre is null then
    new.motivo_cierre := 'otro';
  end if;
  return new;
end;
$$;
revoke execute on function public.conversaciones_etapa_asignacion() from public, anon, authenticated;
drop trigger if exists conversaciones_etapa_asignacion on public.conversaciones;
create trigger conversaciones_etapa_asignacion
before update on public.conversaciones
for each row execute function public.conversaciones_etapa_asignacion();

-- Un lead que da su teléfono queda «calificado».
create or replace function public.clientes_telefono_califica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.telefono is null and new.telefono is not null then
    update public.conversaciones
       set etapa = 'calificado'
     where cliente_id = new.id
       and estado <> 'cerrada'
       and etapa in ('nuevo', 'en_atencion');
  end if;
  return null;
end;
$$;
revoke execute on function public.clientes_telefono_califica() from public, anon, authenticated;
drop trigger if exists clientes_telefono_califica on public.clientes;
create trigger clientes_telefono_califica
after update of telefono on public.clientes
for each row execute function public.clientes_telefono_califica();

-- Auditoría de cambios hechos desde el panel.
create or replace function public.conversaciones_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.asignada_a is distinct from old.asignada_a then
    insert into public.eventos_conversacion (conversacion_id, tipo, actor_id, detalle)
    values (new.id, 'asignacion', auth.uid(), jsonb_build_object('de', old.asignada_a, 'a', new.asignada_a));
  end if;
  if new.etapa is distinct from old.etapa then
    insert into public.eventos_conversacion (conversacion_id, tipo, actor_id, detalle)
    values (new.id, 'etapa', auth.uid(), jsonb_build_object('de', old.etapa, 'a', new.etapa));
  end if;
  if new.estado is distinct from old.estado then
    insert into public.eventos_conversacion (conversacion_id, tipo, actor_id, detalle)
    values (new.id, 'estado', auth.uid(), jsonb_build_object('de', old.estado, 'a', new.estado));
  end if;
  if (new.estado = 'cerrada' and old.estado <> 'cerrada') or (new.etapa = 'cerrado' and old.etapa <> 'cerrado') then
    insert into public.eventos_conversacion (conversacion_id, tipo, actor_id, detalle)
    values (new.id, 'cierre', auth.uid(), jsonb_build_object('motivo', new.motivo_cierre));
  end if;
  return null;
end;
$$;
revoke execute on function public.conversaciones_audit() from public, anon, authenticated;
drop trigger if exists conversaciones_audit on public.conversaciones;
create trigger conversaciones_audit
after update on public.conversaciones
for each row execute function public.conversaciones_audit();

-- Cerrar como «ganado» convierte el prospecto en cliente.
create or replace function public.conversaciones_ganado_marca_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.motivo_cierre = 'ganado' and (tg_op = 'INSERT' or old.motivo_cierre is distinct from 'ganado') then
    update public.clientes set tipo = 'cliente' where id = new.cliente_id and tipo <> 'cliente';
  end if;
  return null;
end;
$$;
revoke execute on function public.conversaciones_ganado_marca_cliente() from public, anon, authenticated;
drop trigger if exists conversaciones_ganado_marca_cliente on public.conversaciones;
create trigger conversaciones_ganado_marca_cliente
after insert or update on public.conversaciones
for each row execute function public.conversaciones_ganado_marca_cliente();

-- ============ Vista de la bandeja ============

drop view if exists public.conversaciones_resumen;
create view public.conversaciones_resumen
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
  ) as actividad_at
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

-- ============ Fusión de contactos (lead sin teléfono + cliente con historial) ============

create or replace function public.fusionar_clientes(p_origen uuid, p_destino uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen public.clientes%rowtype;
  v_conv uuid[];
begin
  if p_origen = p_destino then return; end if;
  if auth.uid() is not null and not public.puede_atender() then
    raise exception 'Se requiere ser del equipo para fusionar contactos' using errcode = '42501';
  end if;
  select * into v_origen from public.clientes where id = p_origen for update;
  if not found then raise exception 'El contacto de origen no existe' using errcode = 'P0002'; end if;
  perform 1 from public.clientes where id = p_destino for update;
  if not found then raise exception 'El contacto de destino no existe' using errcode = 'P0002'; end if;

  update public.cliente_identidades set cliente_id = p_destino where cliente_id = p_origen;
  select array_agg(id) into v_conv from public.conversaciones where cliente_id = p_origen;
  update public.conversaciones set cliente_id = p_destino where cliente_id = p_origen;
  insert into public.cliente_etiquetas (cliente_id, etiqueta_id)
  select p_destino, etiqueta_id from public.cliente_etiquetas where cliente_id = p_origen
  on conflict do nothing;
  delete from public.clientes where id = p_origen;

  update public.clientes d
     set nombre   = coalesce(d.nombre, v_origen.nombre),
         email    = coalesce(d.email, v_origen.email),
         telefono = coalesce(d.telefono, v_origen.telefono),
         interes  = coalesce(d.interes, v_origen.interes),
         perfil   = v_origen.perfil || d.perfil,
         tipo = case
           when 'cliente' in (d.tipo, v_origen.tipo) then 'cliente'
           when 'ex_cliente' in (d.tipo, v_origen.tipo) then 'ex_cliente'
           else 'prospecto'
         end,
         notas = nullif(concat_ws(chr(10), nullif(d.notas, ''), nullif(v_origen.notas, '')), '')
   where d.id = p_destino;

  insert into public.eventos_conversacion (conversacion_id, tipo, actor_id, detalle)
  select unnest(v_conv), 'fusion', auth.uid(), jsonb_build_object('origen', p_origen, 'destino', p_destino);
end;
$$;
revoke execute on function public.fusionar_clientes(uuid, uuid) from public, anon;
grant execute on function public.fusionar_clientes(uuid, uuid) to authenticated, service_role;

-- ============ Realtime: lo que escucha el panel ============

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['mensajes', 'conversaciones', 'clientes', 'canales', 'eventos_conversacion', 'cliente_etiquetas']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Realtime manda la fila completa en los UPDATE (para que el panel no recargue).
alter table public.conversaciones replica identity full;
alter table public.mensajes replica identity full;
