-- Reparto automático de conversaciones nuevas entre vendedores: aleatorio (todos por igual) o por porcentaje.
-- Lo hace un trigger al crear la conversación, así cubre igual WhatsApp, Messenger, Instagram y los formularios
-- (del sitio y de anuncios), venga de donde venga el INSERT. Idempotente. Correr DESPUÉS de 0001–0003.

-- ============ Configuración (una sola fila) ============

create table if not exists public.reparto_config (
  id smallint primary key default 1 check (id = 1),
  modo text not null default 'apagado' check (modo in ('apagado', 'aleatorio', 'porcentaje')),
  -- 'todas' = chats nuevos y formularios; 'formularios' = solo formularios (anuncios y sitio).
  alcance text not null default 'todas' check (alcance in ('todas', 'formularios')),
  -- Modo aleatorio: quiénes entran al sorteo.
  participantes uuid[] not null default '{}',
  -- Modo porcentaje: { "<user_id>": 30, ... } en enteros que suman 100 (lo valida el panel).
  porcentajes jsonb not null default '{}'::jsonb,
  -- Un cliente que vuelve (otro canal, otro formulario) sigue con el vendedor que ya tenía.
  mismo_vendedor boolean not null default true,
  -- Los porcentajes se cuentan desde el último cambio de la configuración.
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
insert into public.reparto_config (id) values (1) on conflict (id) do nothing;

drop trigger if exists reparto_config_updated_at on public.reparto_config;
create trigger reparto_config_updated_at
before update on public.reparto_config
for each row execute function public.set_updated_at();

alter table public.reparto_config enable row level security;
drop policy if exists "Staff ve el reparto" on public.reparto_config;
create policy "Staff ve el reparto"
on public.reparto_config for select to authenticated using (public.is_staff());
drop policy if exists "Staff cambia el reparto" on public.reparto_config;
create policy "Staff cambia el reparto"
on public.reparto_config for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ============ Registro de cada reparto (para los porcentajes y las estadísticas) ============

-- Sin FK a conversaciones a propósito: se anota en el BEFORE INSERT, antes de que exista la fila. Si el INSERT de la
-- conversación falla, este registro se deshace con él (misma transacción).
create table if not exists public.reparto_asignaciones (
  id bigint generated always as identity primary key,
  conversacion_id uuid not null,
  user_id uuid not null,
  modo text not null,
  motivo text not null check (motivo in ('reparto', 'mismo_cliente')),
  created_at timestamptz not null default now()
);
create index if not exists reparto_asignaciones_created_idx on public.reparto_asignaciones (created_at desc);
create index if not exists reparto_asignaciones_user_idx on public.reparto_asignaciones (user_id, created_at desc);

alter table public.reparto_asignaciones enable row level security;
drop policy if exists "Staff ve los repartos" on public.reparto_asignaciones;
create policy "Staff ve los repartos"
on public.reparto_asignaciones for select to authenticated using (public.is_staff());

-- ============ El reparto ============

create or replace function public.reparto_asignar_conversacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.reparto_config%rowtype;
  elegido uuid;
  motivo text := 'reparto';
begin
  -- Solo conversaciones con una persona detrás (no hilos de comentarios públicos) y sin dueño todavía.
  if new.asignada_a is not null or new.origen not in ('dm', 'formulario') then
    return new;
  end if;

  select * into cfg from public.reparto_config where id = 1;
  if not found or cfg.modo = 'apagado' then
    return new;
  end if;
  if cfg.alcance = 'formularios' and new.origen <> 'formulario' then
    return new;
  end if;

  -- Un error del reparto nunca debe impedir que entre la conversación: se anota y queda sin asignar.
  begin
    -- Dos conversaciones que llegan juntas no deben leer el mismo conteo.
    perform pg_advisory_xact_lock(hashtext('reparto_conversaciones'));

    if cfg.mismo_vendedor then
      select cv.asignada_a into elegido
      from public.conversaciones cv
      join public.staff s on s.user_id = cv.asignada_a and s.activo
      where cv.cliente_id = new.cliente_id and cv.asignada_a is not null
      order by cv.created_at desc
      limit 1;
      if elegido is not null then
        motivo := 'mismo_cliente';
      end if;
    end if;

    if elegido is null and cfg.modo = 'aleatorio' then
      select s.user_id into elegido
      from public.staff s
      where s.activo and s.user_id = any (cfg.participantes)
      order by random()
      limit 1;
    elsif elegido is null and cfg.modo = 'porcentaje' then
      -- A quien va más atrasado respecto de su porcentaje desde el último cambio de configuración: con el tiempo,
      -- cada uno recibe exactamente su parte (un sorteo con pesos se puede desviar mucho con pocos leads).
      with pesos as (
        -- CASE y no AND en el WHERE: Postgres no garantiza el orden y un valor no numérico rompería el cast.
        select s.user_id,
               case when jsonb_typeof(cfg.porcentajes -> s.user_id::text) = 'number'
                    then (cfg.porcentajes ->> s.user_id::text)::numeric
                    else 0 end as pct
        from public.staff s
        where s.activo
      ),
      candidatos as (
        select user_id, pct from pesos where pct > 0
      ),
      conteo as (
        select ra.user_id, count(*)::numeric as n
        from public.reparto_asignaciones ra
        where ra.motivo = 'reparto' and ra.modo = 'porcentaje' and ra.created_at >= cfg.updated_at
        group by ra.user_id
      ),
      totales as (
        select sum(c.pct) as suma_pct, coalesce(sum(k.n), 0) as repartidas
        from candidatos c
        left join conteo k using (user_id)
      )
      select c.user_id into elegido
      from candidatos c
      left join conteo k using (user_id)
      cross join totales t
      order by (c.pct / t.suma_pct) * (t.repartidas + 1) - coalesce(k.n, 0) desc, random()
      limit 1;
    end if;

    if elegido is not null then
      new.asignada_a := elegido;
      insert into public.reparto_asignaciones (conversacion_id, user_id, modo, motivo)
      values (new.id, elegido, cfg.modo, motivo);
    end if;
  exception when others then
    raise warning 'reparto: no se pudo asignar la conversación %: %', new.id, sqlerrm;
    new.asignada_a := null;
  end;

  return new;
end;
$$;
revoke execute on function public.reparto_asignar_conversacion() from public, anon, authenticated;
drop trigger if exists reparto_asignar_conversacion on public.conversaciones;
create trigger reparto_asignar_conversacion
before insert on public.conversaciones
for each row execute function public.reparto_asignar_conversacion();

-- La asignación al crear la conversación también queda en el historial y avisa en el panel a quien la recibe
-- (el trigger de auditoría existente solo mira los UPDATE).
create or replace function public.conversaciones_asignacion_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.asignada_a is not null then
    insert into public.eventos_conversacion (conversacion_id, tipo, actor_id, detalle)
    values (
      new.id,
      'asignacion',
      auth.uid(),
      jsonb_build_object(
        'de', null,
        'a', new.asignada_a,
        'automatica', exists (select 1 from public.reparto_asignaciones ra where ra.conversacion_id = new.id)
      )
    );
  end if;
  return null;
end;
$$;
revoke execute on function public.conversaciones_asignacion_inicial() from public, anon, authenticated;
drop trigger if exists conversaciones_asignacion_inicial on public.conversaciones;
create trigger conversaciones_asignacion_inicial
after insert on public.conversaciones
for each row execute function public.conversaciones_asignacion_inicial();
