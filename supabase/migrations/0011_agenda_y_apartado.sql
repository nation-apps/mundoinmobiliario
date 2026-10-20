-- Calendario del equipo y etapa «Por apartar moto». Idempotente. Correr DESPUÉS de 0001–0010.
--
-- 1) Etapa nueva `por_apartar` en el proceso comercial: Prospección → No contesta → Seguimiento → Oportunidad de venta →
--    Por apartar moto → Vendido / No vendido.
-- 2) Tabla `agenda`: lo que el equipo tiene que hacer en una fecha (apartar una moto, una visita a la sucursal, una llamada).
--    El panel avisa 3 días antes, 1 día antes y el mismo día (se calcula al abrir el panel; no hace falta una tarea programada).

-- ============ Etapa ============

alter table public.conversaciones drop constraint if exists conversaciones_etapa_check;
alter table public.conversaciones add constraint conversaciones_etapa_check
  check (etapa in ('prospeccion', 'no_contesta', 'seguimiento', 'oportunidad', 'por_apartar', 'vendido', 'no_vendido'));

comment on column public.conversaciones.etapa is
  'Proceso comercial: prospeccion, no_contesta, seguimiento, oportunidad, por_apartar, vendido, no_vendido (las dos últimas = cerrada).';

-- ============ Agenda ============

create table if not exists public.agenda (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'otro' check (tipo in ('apartado', 'visita', 'llamada', 'otro')),
  titulo text not null check (char_length(btrim(titulo)) > 0),
  notas text,
  -- Cuándo es (con hora). El panel lo muestra en hora de Cancún.
  fecha_hora timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'cancelado')),
  cliente_id uuid references public.clientes(id) on delete set null,
  conversacion_id uuid references public.conversaciones(id) on delete set null,
  -- A quién le toca (recibe los avisos). Sin dueño, lo ve todo el equipo.
  asignada_a uuid references auth.users(id) on delete set null,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_fecha_idx on public.agenda (fecha_hora);
create index if not exists agenda_pendientes_idx on public.agenda (fecha_hora) where estado = 'pendiente';
create index if not exists agenda_conversacion_idx on public.agenda (conversacion_id);
create index if not exists agenda_asignada_idx on public.agenda (asignada_a);

drop trigger if exists agenda_set_updated_at on public.agenda;
create trigger agenda_set_updated_at
before update on public.agenda
for each row execute function public.set_updated_at();

alter table public.agenda enable row level security;

drop policy if exists "Equipo ve la agenda" on public.agenda;
create policy "Equipo ve la agenda"
on public.agenda for select to authenticated using (public.puede_atender());

drop policy if exists "Equipo crea en la agenda" on public.agenda;
create policy "Equipo crea en la agenda"
on public.agenda for insert to authenticated with check (public.puede_atender());

drop policy if exists "Equipo cambia la agenda" on public.agenda;
create policy "Equipo cambia la agenda"
on public.agenda for update to authenticated using (public.puede_atender()) with check (public.puede_atender());

drop policy if exists "Equipo borra de la agenda" on public.agenda;
create policy "Equipo borra de la agenda"
on public.agenda for delete to authenticated using (public.puede_atender());

grant select, insert, update, delete on public.agenda to authenticated;

-- El panel se entera al instante de lo que agenda otra persona.
do $$
begin
  alter publication supabase_realtime add table public.agenda;
exception when duplicate_object then null;
end $$;
