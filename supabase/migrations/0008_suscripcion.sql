-- Suscripción del CRM (Stripe): 39 USD al mes. Una sola fila (id = 1): este panel es de un solo negocio.
-- La escribe únicamente el bot con la service role (webhook de Stripe); el panel la lee para avisar o bloquear.
-- Idempotente. Correr DESPUÉS de 0001–0007.

create table if not exists public.suscripcion (
  id int primary key default 1,
  estado text not null default 'sin_suscripcion',
  stripe_customer_id text,
  stripe_subscription_id text,
  periodo_fin timestamptz,
  cancela_al_final boolean not null default false,
  -- Desde cuándo está en «pago_pendiente»: la gracia se cuenta desde aquí, no desde la última vez que Stripe avisó.
  pendiente_desde timestamptz,
  email text,
  -- Instante (de Stripe) del último evento aplicado: un aviso más viejo que este llegó tarde y se descarta.
  ultimo_evento_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint suscripcion_una_fila check (id = 1),
  constraint suscripcion_estado_check check (estado in (
    'sin_suscripcion', 'activa', 'en_prueba', 'pago_pendiente', 'impago', 'cancelada', 'incompleta'
  ))
);
comment on table public.suscripcion is
  'Estado de la suscripción del CRM en Stripe. Una fila. Solo la escribe el bot (webhook de Stripe).';
insert into public.suscripcion (id) values (1) on conflict (id) do nothing;

-- Eventos de Stripe ya procesados: Stripe repite avisos y no deben aplicarse dos veces.
create table if not exists public.stripe_eventos (
  id text primary key,
  tipo text not null,
  created_at timestamptz not null default now()
);

alter table public.suscripcion enable row level security;
alter table public.stripe_eventos enable row level security;

-- Todo el equipo puede ver el estado (el panel avisa a todos si el pago falta); nadie escribe desde el navegador.
drop policy if exists suscripcion_select on public.suscripcion;
create policy suscripcion_select on public.suscripcion
  for select to authenticated using (public.puede_atender());
-- stripe_eventos: sin policies = solo la service role.

create or replace function public.suscripcion_actualiza_fecha()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists suscripcion_fecha on public.suscripcion;
create trigger suscripcion_fecha before update on public.suscripcion
for each row execute function public.suscripcion_actualiza_fecha();
