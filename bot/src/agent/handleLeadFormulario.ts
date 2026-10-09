import { logger } from "../lib/logger.js";
import { fuenteCampana } from "../lib/fuente.js";
import { registrarLeadWeb } from "../db/repositories/clientes.js";
import { getOrCreateConversacionAbierta } from "../db/repositories/conversaciones.js";
import { guardarMensaje } from "../db/repositories/mensajes.js";
import { obtenerLead } from "../meta/client.js";
import { contenidoDelLead, datosDelLead, HILO_LEAD_ADS } from "../meta/leadAds.js";
import { marcaDePagina, tokenDePagina } from "../meta/paginas.js";
import type { EventoMeta } from "../meta/parser.js";

type EventoLead = Extract<EventoMeta, { kind: "lead_formulario" }>;

/**
 * Alguien llenó el formulario instantáneo de un anuncio de Facebook o
 * Instagram. Entra a la bandeja igual que el formulario del sitio (canal
 * `web`, origen `formulario`, sin respuesta por ese canal: el asesor le
 * escribe por WhatsApp), pero en su propio hilo (`HILO_LEAD_ADS`) para que el
 * panel lo rotule como anuncio. El bot no le escribe solo: un primer mensaje
 * por WhatsApp a quien no ha escrito exige una plantilla aprobada.
 */
export async function handleLeadFormulario(evento: EventoLead): Promise<void> {
  if (!tokenDePagina(evento.cuentaId)) {
    // Una página que no se conectó con scripts/conectar-pagina-meta.py: se intenta con el token principal.
    logger.warn({ paginaId: evento.cuentaId }, "Lead de una página sin token propio (no está en META_PAGINAS)");
  }
  // De qué página vino: es lo que distingue «Campaña Formulario Meta TVS» de «… Mundo de Motos».
  const marca = marcaDePagina(evento.cuentaId);

  let lead;
  try {
    lead = await obtenerLead(evento.leadgenId, evento.formId, evento.cuentaId);
  } catch (err) {
    // Sin las respuestas no hay a quién registrar. Meta guarda el lead 90 días: se puede bajar desde el Centro de clientes potenciales.
    logger.error(
      { err, leadgenId: evento.leadgenId, formId: evento.formId },
      "No se pudo leer el lead de Meta: revisar el permiso leads_retrieval del token y el acceso a clientes potenciales de la app",
    );
    return;
  }

  const datos = datosDelLead(lead.campos);
  const cliente = await registrarLeadWeb({ telefono: datos.telefono, nombre: datos.nombre, email: datos.email ?? undefined });

  // Dos formularios de la misma persona son un mismo hilo, como en el sitio.
  const conversacion = await getOrCreateConversacionAbierta({
    clienteId: cliente.id,
    canal: "web",
    origen: "formulario",
    hiloExterno: HILO_LEAD_ADS,
    cuentaId: evento.cuentaId,
    fuente: fuenteCampana("Formulario", marca),
  });

  try {
    await guardarMensaje({
      conversacionId: conversacion.id,
      rol: "user",
      tipo: "mensaje",
      contenido: contenidoDelLead(lead.campos),
      externalId: evento.externalId,
      metadata: {
        origen: HILO_LEAD_ADS,
        leadgen_id: lead.id,
        pagina_id: evento.cuentaId,
        ...(marca ? { marca } : {}),
        ...(lead.formId ? { form_id: lead.formId } : {}),
        ...(lead.adId ? { ad_id: lead.adId } : {}),
        ...(lead.formulario ? { formulario: lead.formulario } : {}),
        ...(lead.anuncio ? { anuncio: lead.anuncio } : {}),
        ...(lead.campana ? { campana: lead.campana } : {}),
        ...(lead.plataforma ? { plataforma: lead.plataforma } : {}),
        ...(lead.esOrganico ? { organico: true } : {}),
      },
    });
  } catch (err) {
    // Meta repite el aviso si tarda en ver el 200: el segundo choca contra el índice único de external_id.
    if ((err as { code?: string }).code === "23505") {
      logger.info({ leadgenId: evento.leadgenId }, "Lead de Meta repetido, ya estaba en la bandeja");
      return;
    }
    throw err;
  }

  logger.info(
    { clienteId: cliente.id, conversacionId: conversacion.id, leadgenId: evento.leadgenId, conTelefono: datos.telefono !== null },
    "Lead de formulario de Meta recibido",
  );
}
