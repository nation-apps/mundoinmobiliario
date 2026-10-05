/**
 * Cola por clave: las tareas con la misma clave corren una detrás de otra,
 * las de claves distintas en paralelo.
 *
 * Por qué existe: un cliente escribe "Sí" y, un segundo después, "¿estás
 * bien?". Meta manda dos webhooks y cada uno arrancaba su propia corrida del
 * agente al mismo tiempo. Una agendaba la cita; la otra, que arrancó sin
 * saberlo, consultaba la disponibilidad, veía ocupado el horario que la
 * primera acababa de tomar y le contestaba al cliente "ya se ocupó". Con la
 * cola, la segunda corrida empieza cuando la primera ya terminó y ve su
 * respuesta en el historial.
 *
 * Es en memoria: vale para un solo proceso (el bot corre una sola instancia).
 * Una tarea que falla no bloquea a las siguientes.
 */
const colas = new Map<string, Promise<unknown>>();

export function enCola<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
  const anterior = colas.get(clave) ?? Promise.resolve();
  const actual = anterior.catch(() => undefined).then(tarea);
  const marca = actual.catch(() => undefined);
  colas.set(clave, marca);
  // Limpia la entrada cuando ya no hay nadie esperando detrás.
  void marca.then(() => {
    if (colas.get(clave) === marca) colas.delete(clave);
  });
  return actual;
}
