-- Datos reales de Mundo de Motos (documento «Implementación CRM - Mundo de Motos», 9-oct-2026): tres líneas, venta de
-- motos TVS, refacciones y accesorios, y taller. No hay seminuevas. Idempotente. Correr DESPUÉS de 0001–0004.

-- Qué le interesa al cliente: las líneas del negocio. El crédito es forma de pago (va en el perfil), no una línea.
alter table public.clientes drop constraint if exists clientes_interes_check;
update public.clientes set interes = 'moto_nueva' where interes = 'financiamiento';
update public.clientes set interes = 'otro'
where interes is not null and interes not in ('moto_nueva', 'refacciones', 'accesorios', 'taller', 'otro');
alter table public.clientes add constraint clientes_interes_check
  check (interes is null or interes in ('moto_nueva', 'refacciones', 'accesorios', 'taller', 'otro'));
comment on column public.clientes.interes is 'Qué le interesa: comprar moto TVS, refacciones, accesorios, taller u otro.';
comment on column public.clientes.perfil is
  'Compra (moto, uso, presupuesto, enganche, pago, plazo), refacciones o taller (vehiculo, solicitud, kilometraje), '
  'ubicacion, horario_visita y notas. Lo escribe guardar_perfil_compra.';

-- Etiquetas: no hay seminuevas; se suman Refacciones y Accesorios. «Anulado» no se toca.
delete from public.etiquetas where nombre = 'Seminueva';
insert into public.etiquetas (nombre, color) values ('Refacciones', 'violet'), ('Accesorios', 'slate')
on conflict (nombre) do nothing;

-- Respuestas rápidas. El cliente conoce el negocio como «Mundo de Motos».
update public.respuestas_rapidas
set contenido = 'Hola {{nombre}}, te escribimos de Mundo de Motos. ¿En qué te podemos ayudar?'
where atajo = 'hola';
update public.respuestas_rapidas
set titulo = 'Pedir datos para cotizar moto',
    contenido = 'Con gusto te cotizamos. ¿Qué modelo TVS te interesa y lo pensarías de contado o con financiamiento?'
where atajo = 'cotizar';
insert into public.respuestas_rapidas (atajo, titulo, contenido, sort_order) values
  ('ubicacion', 'Dirección y horario',
   'Estamos en Avenida Yaxchilán 573, Cancún, Quintana Roo. Te esperamos de lunes a viernes de 9 am a 6 pm y sábado de 9 am a 2 pm.', 4),
  ('refaccion', 'Pedir datos de refacción',
   '¿Me compartes la marca, modelo y año de tu moto y qué pieza buscas? Si tienes una foto de la pieza, mejor.', 5),
  ('taller', 'Pedir datos de taller',
   '¿Qué marca, modelo y año es tu moto, cuántos kilómetros tiene y qué servicio necesitas?', 6)
on conflict (atajo) do nothing;
