import { supabase } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { anuncioDeLead } from "./client.js";

const log = logger.child({ modulo: "completar-anuncios" });

/** Solo los formularios de los últimos días: después Meta ya no va a completar nada. */
const DIAS = 3;
const POR_VUELTA = 40;

type FilaLead = { id: string; metadata: Record<string, unknown> };

/**
 * Formularios que entraron sin el anuncio que los trajo (Meta todavía no lo tenía al avisar): se le pregunta otra vez y se
 * completa el mensaje del formulario, que es de donde el reporte «Por anuncio» saca el anuncio. Corre con la revisión de
 * formularios. Devuelve cuántos completó. Nunca lanza.
 */
export async function completarAnunciosDeLeads(ahora: number = Date.now()): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("mensajes")
      .select("id, metadata")
      .not("metadata->>leadgen_id", "is", null)
      .is("metadata->>ad_id", null)
      .gte("created_at", new Date(ahora - DIAS * 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(POR_VUELTA);
    if (error) throw error;
    let completados = 0;
    for (const fila of (data ?? []) as FilaLead[]) {
      const md = fila.metadata;
      if (md.organico === true) continue;
      const leadgenId = typeof md.leadgen_id === "string" ? md.leadgen_id : null;
      if (!leadgenId) continue;
      try {
        const a = await anuncioDeLead(leadgenId, typeof md.pagina_id === "string" ? md.pagina_id : null);
        if (!a.adId && !a.esOrganico) continue; // todavía no: se vuelve a intentar en la próxima vuelta
        const nuevo = {
          ...md,
          ...(a.adId ? { ad_id: a.adId } : {}),
          ...(a.anuncio && !md.anuncio ? { anuncio: a.anuncio } : {}),
          ...(a.campana && !md.campana ? { campana: a.campana } : {}),
          ...(a.plataforma && !md.plataforma ? { plataforma: a.plataforma } : {}),
          ...(a.esOrganico ? { organico: true } : {}),
        };
        const { error: errUpd } = await supabase.from("mensajes").update({ metadata: nuevo }).eq("id", fila.id);
        if (errUpd) throw errUpd;
        if (a.adId) completados++;
      } catch (err) {
        log.warn({ err, leadgenId }, "No se pudo completar el anuncio de un formulario");
      }
    }
    if (completados > 0) log.info({ completados }, "Formularios completados con el anuncio que los trajo");
    return completados;
  } catch (err) {
    log.warn({ err }, "Falló la revisión de formularios sin anuncio");
    return 0;
  }
}
