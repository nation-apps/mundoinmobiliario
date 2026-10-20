-- Dos líneas de WhatsApp (TVS y Mundo de Motos) conectadas a la vez. Idempotente. Correr DESPUÉS de 0001–0011.
--
-- - `conversaciones.linea`: por qué línea de WhatsApp se habla con la persona ('tvs' | 'mundo'). Las conversaciones de
--   formulario también la llevan (la de su marca): es la línea por la que se les escribe primero.
-- - `staff.lineas`: de qué líneas puede recibir leads cada persona (por defecto, las dos). El reparto automático solo
--   les asigna leads de las líneas que atienden.
-- - La sesión de cada número (tabla `whatsapp_qr_sesion`) no cambia: la línea 'tvs' sigue usando las mismas filas y las demás
--   guardan las suyas con el prefijo «<línea>:» en `clave`. Así el bot que ya está corriendo sigue funcionando mientras se publica
--   el nuevo.

-- ============ Columnas ============

alter table public.conversaciones add column if not exists linea text;
alter table public.staff add column if not exists lineas text[] not null default array['tvs', 'mundo'];

comment on column public.conversaciones.linea is
  'Línea de WhatsApp de la conversación (tvs | mundo). Null en canales que no son WhatsApp ni formulario.';
comment on column public.staff.lineas is
  'Líneas de WhatsApp de las que esta persona recibe leads en el reparto (tvs, mundo).';

-- Lo que ya existe: todo lo de WhatsApp entró por la línea de TVS (era la única conectada); los formularios, por su marca.
alter table public.conversaciones disable trigger user;
update public.conversaciones set linea = 'tvs' where linea is null and canal = 'whatsapp';
update public.conversaciones
   set linea = case
         when fuente ilike '%mundo de motos%' then 'mundo'
         when fuente ilike '%tvs%' then 'tvs'
       end
 where linea is null and canal = 'web' and fuente is not null;
alter table public.conversaciones enable trigger user;

create index if not exists conversaciones_linea_idx on public.conversaciones (linea);

-- ============ El reparto respeta las líneas de cada persona ============

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
        and (new.linea is null or s.lineas @> array[new.linea])
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
        and (new.linea is null or s.lineas @> array[new.linea])
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
        where s.activo and (new.linea is null or s.lineas @> array[new.linea])
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

-- ============ Vista de la bandeja: suma la línea al final ============

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
  c.fuente as cliente_fuente,
  cv.motivo_perdida,
  cv.linea
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
