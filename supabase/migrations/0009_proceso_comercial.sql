-- Proceso comercial del cliente: Prospección → No contesta → Seguimiento → Oportunidad de venta → Vendido / No vendido.
-- Reemplaza las etapas anteriores (nuevo, en_atencion, calificado, agendado, propuesta, cerrado) y suma el motivo
-- de la venta perdida («¿Por qué se perdió la venta?»). Quita la etiqueta «Anulado» de las que vienen por defecto.
-- Idempotente. Correr DESPUÉS de 0001–0008.

-- ============ Columnas ============

alter table public.conversaciones add column if not exists motivo_perdida text;

alter table public.conversaciones drop constraint if exists conversaciones_etapa_check;
alter table public.conversaciones drop constraint if exists conversaciones_motivo_perdida_check;

-- Los triggers de etapa se apagan mientras se traducen las filas: el cambio de clave no es un movimiento del equipo
-- y no debe quedar en la actividad de cada conversación.
alter table public.conversaciones disable trigger user;

update public.conversaciones set etapa = case etapa
    when 'nuevo' then 'prospeccion'
    when 'en_atencion' then 'seguimiento'
    when 'calificado' then 'seguimiento'
    when 'agendado' then 'oportunidad'
    when 'propuesta' then 'oportunidad'
    when 'cerrado' then case when motivo_cierre = 'ganado' then 'vendido' else 'no_vendido' end
    else etapa
  end
where etapa in ('nuevo', 'en_atencion', 'calificado', 'agendado', 'propuesta', 'cerrado');

-- Una conversación cerrada siempre está en Vendido o No vendido.
update public.conversaciones
   set etapa = case when motivo_cierre = 'ganado' then 'vendido' else 'no_vendido' end
 where estado = 'cerrada' and etapa not in ('vendido', 'no_vendido');

alter table public.conversaciones enable trigger user;

alter table public.conversaciones alter column etapa set default 'prospeccion';
alter table public.conversaciones add constraint conversaciones_etapa_check
  check (etapa in ('prospeccion', 'no_contesta', 'seguimiento', 'oportunidad', 'vendido', 'no_vendido'));
alter table public.conversaciones add constraint conversaciones_motivo_perdida_check
  check (motivo_perdida is null or motivo_perdida in ('buro', 'otra_marca', 'enganche', 'competencia', 'sin_respuesta_7d'));

comment on column public.conversaciones.etapa is
  'Proceso comercial: prospeccion, no_contesta, seguimiento, oportunidad, vendido, no_vendido (las dos últimas = cerrada).';
comment on column public.conversaciones.motivo_perdida is
  'Por qué se perdió la venta (solo en no_vendido): buro, otra_marca, enganche, competencia, sin_respuesta_7d.';

-- ============ Triggers de negocio ============

-- Un mensaje nuevo mueve los relojes de la conversación. Además:
-- - la primera respuesta de una persona del equipo saca al lead de Prospección y lo pasa a Seguimiento;
-- - si el cliente vuelve a escribir estando en «No contesta», regresa a Seguimiento.
create or replace function public.mensajes_actualiza_conversacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol = 'user' and new.tipo = 'mensaje' then
    update public.conversaciones
       set ultimo_mensaje_at = new.created_at,
           etapa = case when etapa = 'no_contesta' then 'seguimiento' else etapa end
     where id = new.conversacion_id;
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
           etapa = case when new.rol = 'humano' and etapa = 'prospeccion' then 'seguimiento' else etapa end
     where id = new.conversacion_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.mensajes_actualiza_conversacion() from public, anon, authenticated;

-- Etapa y estado van juntos: Vendido y No vendido cierran la conversación, y cerrarla la lleva a una de las dos.
-- Asignar un vendedor ya NO mueve la etapa: con el reparto automático todos los leads quedarían fuera de Prospección.
create or replace function public.conversaciones_etapa_asignacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Se reabre (el bot o una persona vuelve a atender): sale de Vendido / No vendido.
  if old.estado = 'cerrada' and new.estado <> 'cerrada' and new.etapa in ('vendido', 'no_vendido') then
    new.etapa := 'seguimiento';
  end if;
  -- Se cierra sin elegir etapa final: según el motivo.
  if new.estado = 'cerrada' and old.estado <> 'cerrada' and new.etapa not in ('vendido', 'no_vendido') then
    new.etapa := case when new.motivo_cierre = 'ganado' then 'vendido' else 'no_vendido' end;
  end if;
  -- Llevar a una etapa final cierra la conversación.
  if new.etapa = 'vendido' then
    new.estado := 'cerrada';
    new.motivo_cierre := 'ganado';
  elsif new.etapa = 'no_vendido' then
    new.estado := 'cerrada';
    if new.motivo_cierre is null or new.motivo_cierre = 'ganado' then
      new.motivo_cierre := 'perdido';
    end if;
  else
    -- Volver a una etapa abierta reabre y limpia los motivos.
    if new.estado = 'cerrada' then
      new.estado := 'activa';
    end if;
    new.motivo_cierre := null;
  end if;
  if new.etapa <> 'no_vendido' then
    new.motivo_perdida := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.conversaciones_etapa_asignacion() from public, anon, authenticated;

-- Dar el teléfono ya no cambia la etapa (no existe «Con teléfono» en el proceso nuevo).
drop trigger if exists clientes_telefono_califica on public.clientes;
drop function if exists public.clientes_telefono_califica();

-- Auditoría: el cierre guarda también por qué se perdió la venta, y elegir o cambiar ese motivo queda en la actividad.
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
  if (new.estado = 'cerrada' and old.estado <> 'cerrada')
     or (new.motivo_perdida is not null and new.motivo_perdida is distinct from old.motivo_perdida) then
    insert into public.eventos_conversacion (conversacion_id, tipo, actor_id, detalle)
    values (new.id, 'cierre', auth.uid(),
            jsonb_strip_nulls(jsonb_build_object('motivo', new.motivo_cierre, 'perdida', new.motivo_perdida)));
  end if;
  return null;
end;
$$;
revoke execute on function public.conversaciones_audit() from public, anon, authenticated;

-- ============ Vista de la bandeja: suma el motivo de la venta perdida al final ============

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
  cv.motivo_perdida
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

-- ============ Etiquetas ============

-- «Anulado» deja de venir por defecto. Si el equipo vuelve a crear una etiqueta con ese nombre, el bot sigue sin
-- contestarles a esos contactos (bot/src/db/repositories/etiquetas.ts).
delete from public.etiquetas where nombre = 'Anulado';
