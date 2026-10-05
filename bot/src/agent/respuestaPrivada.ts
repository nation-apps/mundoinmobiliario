/** Lo mínimo que se necesita del canal para decidir; evita arrastrar el tipo completo (y su acceso a la base) a los tests. */
export interface ConfigRespuestaPrivada {
  activo: boolean;
  ia_comentarios_activa: boolean;
  texto_respuesta_privada: string | null;
}

export interface RespuestaPrivada {
  texto: string;
  /** Reservado: clave de un recurso enviado por palabra clave. */
  guia?: string;
}

/**
 * Qué se le contesta por privado a quien comenta, o null si no se contesta.
 *
 * Meta solo deja UNA respuesta privada por comentario, así que el interruptor
 * del canal manda sobre todo: con `activo` o `ia_comentarios_activa` apagados
 * no sale nada. Solo el comentario original cuenta, no las respuestas
 * anidadas. Sale el texto fijo del canal (editable desde el panel, Canales);
 * sin texto fijo, nada.
 */
export function elegirRespuestaPrivada(params: {
  texto: string;
  parentId?: string | null;
  config: ConfigRespuestaPrivada | null;
}): RespuestaPrivada | null {
  const { config } = params;
  if (!config?.activo || !config.ia_comentarios_activa || params.parentId) return null;
  if (config.texto_respuesta_privada) return { texto: config.texto_respuesta_privada };
  return null;
}
