-- El negocio es Mundo Motos (agencia de motocicletas), no Mundo Inmobiliario: se quita lo del seminario, los programas y
-- el perfil de inversionista, y se dejan intereses, etiquetas y respuestas rápidas de una agencia de motos.
-- Idempotente: se puede correr más de una vez. Correr DESPUÉS de 0001 y 0002.

-- Qué le interesa al cliente.
alter table public.clientes drop constraint if exists clientes_interes_check;
update public.clientes set interes = 'otro'
where interes is not null and interes not in ('moto_nueva', 'seminueva', 'financiamiento', 'taller', 'refacciones', 'otro');
alter table public.clientes add constraint clientes_interes_check
  check (interes is null or interes in ('moto_nueva', 'seminueva', 'financiamiento', 'taller', 'refacciones', 'otro'));
comment on column public.clientes.interes is 'Qué le interesa: moto nueva, seminueva, financiamiento, taller, refacciones u otro.';

-- Perfil: de inversionista a perfil de compra. Las claves que solo servían para invertir se borran; plazo, ubicacion y
-- notas siguen sirviendo.
update public.clientes set perfil = perfil - 'experiencia' - 'objetivo' - 'capital'
where perfil ?| array['experiencia', 'objetivo', 'capital'];
comment on column public.clientes.perfil is
  'La moto que busca: moto, uso, presupuesto, pago, plazo, ubicacion, notas. Lo escribe guardar_perfil_compra.';

-- Etiquetas: fuera las del seminario y los programas (con sus asignaciones). «Anulado» no se toca.
delete from public.etiquetas where nombre in ('Seminario', 'Programa Avanzado', 'Mentoría', 'Máster');
insert into public.etiquetas (nombre, color) values
  ('Moto nueva', 'sky'), ('Seminueva', 'violet'), ('Crédito', 'amber'), ('Taller', 'emerald')
on conflict (nombre) do nothing;

-- Respuestas rápidas.
update public.respuestas_rapidas
set contenido = 'Hola {{nombre}}, te escribimos de Mundo Motos. ¿En qué te podemos ayudar?'
where atajo = 'hola';
update public.respuestas_rapidas
set contenido = '¿Me compartes tu nombre completo y, si quieres, tu correo para que el asesor te mande la cotización?'
where atajo = 'datos';
delete from public.respuestas_rapidas where atajo = 'seminario';
insert into public.respuestas_rapidas (atajo, titulo, contenido, sort_order) values
  ('cotizar', 'Pedir datos para cotizar', 'Con gusto te cotizamos. ¿Qué moto te interesa y cómo te gustaría pagarla, de contado o a crédito?', 2)
on conflict (atajo) do nothing;
