-- Ajuste al rubro real: Mundo Inmobiliario es educación e inversión (seminario, Programa Avanzado, Mentoría, Máster).
-- Sirve igual si 0001 ya traía estos valores (es idempotente) o si se ejecutó la primera versión (comprar/rentar/vender).

-- Qué le interesa al cliente.
alter table public.clientes drop constraint if exists clientes_interes_check;
update public.clientes set interes = 'otro'
where interes is not null and interes not in ('seminario', 'programa_avanzado', 'mentoria', 'master', 'libro', 'otro');
alter table public.clientes add constraint clientes_interes_check
  check (interes is null or interes in ('seminario', 'programa_avanzado', 'mentoria', 'master', 'libro', 'otro'));
comment on column public.clientes.interes is 'Qué le interesa: seminario, programa avanzado, mentoría, máster, libro u otro.';

-- Etiquetas: se quitan las de la primera versión (si nadie las usó) y se crean las nuevas. «Anulado» no se toca.
delete from public.etiquetas e
where e.nombre in ('Comprador', 'Inquilino', 'Propietario', 'Inversionista')
  and not exists (select 1 from public.cliente_etiquetas ce where ce.etiqueta_id = e.id);
insert into public.etiquetas (nombre, color) values
  ('Seminario', 'sky'), ('Programa Avanzado', 'violet'), ('Mentoría', 'amber'), ('Máster', 'emerald')
on conflict (nombre) do nothing;

-- Respuestas rápidas.
update public.respuestas_rapidas
set contenido = 'Hola {{nombre}}, te escribimos de Mundo Inmobiliario. ¿En qué te podemos ayudar?'
where atajo = 'hola' and contenido like '%Mundo Motos%';
delete from public.respuestas_rapidas where atajo = 'visita';
insert into public.respuestas_rapidas (atajo, titulo, contenido, sort_order) values
  ('seminario', 'Invitar al seminario', 'Con gusto. Aquí puedes registrarte al seminario gratuito: https://eventos.mundoinmobiliario.tv/gratis/seminario', 2)
on conflict (atajo) do nothing;
