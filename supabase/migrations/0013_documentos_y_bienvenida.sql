-- Documentos de cada cliente (enlaces) y mensajes de bienvenida por línea de WhatsApp. Idempotente. Correr DESPUÉS de 0001–0012.
--
-- 1) `documentos_cliente`: el vendedor guarda enlaces (fichajes, separaciones, contratos…) en la ficha del cliente.
-- 2) `mensajes_bienvenida`: el administrador escribe, por línea (tvs, mundo), el mensaje con el que el bot da la bienvenida:
--    - `formulario_*`: a quien se registra por un formulario de campaña y dejó su teléfono (el saludo automático).
--    - `directo_*`: a quien escribe por primera vez a la línea (campaña de clic a WhatsApp o mensaje directo).
--    Cada uno con su interruptor, apagados por defecto. El bot los lee con la service role.

-- ============ Documentos ============

create table if not exists public.documentos_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  conversacion_id uuid references public.conversaciones(id) on delete set null,
  tipo text not null default 'otro' check (tipo in ('fichaje', 'separacion', 'contrato', 'otro')),
  titulo text,
  url text not null check (url ~* '^https?://'),
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists documentos_cliente_cliente_idx on public.documentos_cliente (cliente_id, created_at desc);

alter table public.documentos_cliente enable row level security;

drop policy if exists "Equipo ve los documentos" on public.documentos_cliente;
create policy "Equipo ve los documentos"
on public.documentos_cliente for select to authenticated using (public.puede_atender());

drop policy if exists "Equipo agrega documentos" on public.documentos_cliente;
create policy "Equipo agrega documentos"
on public.documentos_cliente for insert to authenticated with check (public.puede_atender());

drop policy if exists "Equipo borra documentos" on public.documentos_cliente;
create policy "Equipo borra documentos"
on public.documentos_cliente for delete to authenticated using (public.puede_atender());

grant select, insert, delete on public.documentos_cliente to authenticated;

-- ============ Bienvenida por línea ============

create table if not exists public.mensajes_bienvenida (
  linea text primary key,
  formulario_activo boolean not null default false,
  formulario_texto text,
  directo_activo boolean not null default false,
  directo_texto text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint mensajes_bienvenida_largo check (
    coalesce(char_length(formulario_texto), 0) <= 900 and coalesce(char_length(directo_texto), 0) <= 900
  )
);

insert into public.mensajes_bienvenida (linea) values ('tvs'), ('mundo') on conflict (linea) do nothing;

drop trigger if exists mensajes_bienvenida_set_updated_at on public.mensajes_bienvenida;
create trigger mensajes_bienvenida_set_updated_at
before update on public.mensajes_bienvenida
for each row execute function public.set_updated_at();

alter table public.mensajes_bienvenida enable row level security;

-- Lo ven y lo cambian la administración y las asistentes (is_staff = no vendedor); el bot lo lee con la service role.
drop policy if exists "Staff ve la bienvenida" on public.mensajes_bienvenida;
create policy "Staff ve la bienvenida"
on public.mensajes_bienvenida for select to authenticated using (public.is_staff());

drop policy if exists "Staff cambia la bienvenida" on public.mensajes_bienvenida;
create policy "Staff cambia la bienvenida"
on public.mensajes_bienvenida for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff crea la bienvenida" on public.mensajes_bienvenida;
create policy "Staff crea la bienvenida"
on public.mensajes_bienvenida for insert to authenticated with check (public.is_staff());

grant select, insert, update on public.mensajes_bienvenida to authenticated;
