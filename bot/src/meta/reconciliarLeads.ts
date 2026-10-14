import { env, metaConfigurado } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { existeExternalId } from "../db/repositories/mensajes.js";
import { handleLeadFormulario } from "../agent/handleLeadFormulario.js";
import { GRAPH_BASE_URL } from "./client.js";
import { paginasMeta, type PaginaMeta } from "./paginas.js";
import type { EventoMeta } from "./parser.js";

/**
 * Red de seguridad para los formularios de anuncios (Lead Ads). Meta avisa de cada lead por webhook, pero hay páginas
 * a las que ese aviso no llega (p. ej. TVS Motor Cancún, que además tiene GoHighLevel conectado: 25 leads al día en
 * Meta y ninguno en el panel). Cada pocos minutos se leen los formularios activos de cada página y se registran los
 * leads de la última ventana que todavía no están guardados. Lo guardado se reconoce por `leadgen:<id>`, el mismo
 * identificador que usa el webhook: si llegan por las dos vías, el segundo se descarta.
 */

type EventoLead = Extract<EventoMeta, { kind: "lead_formulario" }>;

export type LeadReciente = { id: string; formId: string; adId: string | null; creado: Date };

/** Tope por vuelta: si Meta devolviera miles, no se inunda la bandeja de golpe. */
const MAXIMO_POR_VUELTA = 50;
/** Páginas de resultados por formulario (100 leads cada una): con una ventana de horas sobra. */
const MAXIMO_PAGINAS = 3;

async function pedirJson(url: string): Promise<{ data?: unknown[]; paging?: { next?: string } }> {
  const res = await fetch(url);
  if (!res.ok) {
    // Sin la URL en el mensaje: lleva el token.
    throw new Error(`Meta respondió ${res.status}`);
  }
  return (await res.json()) as { data?: unknown[]; paging?: { next?: string } };
}

/** Los leads creados desde `desde` en todos los formularios activos de la página. */
export async function listarLeadsRecientes(pagina: PaginaMeta, desde: Date): Promise<LeadReciente[]> {
  const token = encodeURIComponent(pagina.token);
  const formularios = await pedirJson(
    `${GRAPH_BASE_URL}/${pagina.id}/leadgen_forms?fields=id,status&limit=100&access_token=${token}`,
  );
  const activos = (formularios.data ?? []).flatMap((f) => {
    const form = f as { id?: unknown; status?: unknown };
    return typeof form.id === "string" && form.status === "ACTIVE" ? [form.id] : [];
  });

  const desdeUnix = Math.floor(desde.getTime() / 1000);
  const filtro = encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: desdeUnix }]));
  const leads: LeadReciente[] = [];
  for (const formId of activos) {
    let url: string | undefined =
      `${GRAPH_BASE_URL}/${formId}/leads?fields=id,created_time,ad_id&limit=100&filtering=${filtro}&access_token=${token}`;
    for (let i = 0; url && i < MAXIMO_PAGINAS; i++) {
      const respuesta = await pedirJson(url);
      for (const l of respuesta.data ?? []) {
        const lead = l as { id?: unknown; created_time?: unknown; ad_id?: unknown };
        if (typeof lead.id !== "string") continue;
        const creado = typeof lead.created_time === "string" ? new Date(lead.created_time) : new Date();
        // El filtro de Meta no siempre se respeta: se vuelve a comprobar aquí.
        if (Number.isNaN(creado.getTime()) || creado < desde) continue;
        leads.push({ id: lead.id, formId, adId: typeof lead.ad_id === "string" ? lead.ad_id : null, creado });
      }
      url = respuesta.paging?.next;
    }
  }
  return leads;
}

export type ResultadoReconciliacion = { revisados: number; nuevos: number; fallidos: number; recortado: boolean };

/** Una vuelta: registra los leads de la ventana que el webhook no entregó. */
export async function reconciliarLeads(opciones: { ahora?: Date; ventanaMin?: number } = {}): Promise<ResultadoReconciliacion> {
  const ahora = opciones.ahora ?? new Date();
  const ventanaMin = opciones.ventanaMin ?? env.LEADS_VENTANA_MIN;
  const desde = new Date(ahora.getTime() - ventanaMin * 60_000);
  const resultado: ResultadoReconciliacion = { revisados: 0, nuevos: 0, fallidos: 0, recortado: false };

  for (const pagina of paginasMeta()) {
    let leads: LeadReciente[];
    try {
      leads = await listarLeadsRecientes(pagina, desde);
    } catch (err) {
      // Un permiso que falta o un token vencido no debe tumbar a las demás páginas.
      logger.warn({ err: (err as Error).message, paginaId: pagina.id }, "No se pudieron revisar los formularios de la página");
      resultado.fallidos += 1;
      continue;
    }
    // Del más viejo al más nuevo: la bandeja los ve en el orden en que llegaron.
    leads.sort((a, b) => a.creado.getTime() - b.creado.getTime());

    for (const lead of leads) {
      resultado.revisados += 1;
      const externalId = `leadgen:${lead.id}`;
      if (await existeExternalId(externalId).catch(() => true)) continue;
      if (resultado.nuevos >= MAXIMO_POR_VUELTA) {
        resultado.recortado = true;
        break;
      }
      const evento: EventoLead = {
        kind: "lead_formulario",
        canal: "messenger",
        cuentaId: pagina.id,
        externalId,
        remitenteId: null,
        timestamp: lead.creado,
        leadgenId: lead.id,
        formId: lead.formId,
        adId: lead.adId,
      };
      try {
        await handleLeadFormulario(evento);
        resultado.nuevos += 1;
      } catch (err) {
        resultado.fallidos += 1;
        logger.error({ err, leadgenId: lead.id, paginaId: pagina.id }, "No se pudo registrar un lead al revisar los formularios");
      }
    }
  }

  if (resultado.nuevos > 0 || resultado.fallidos > 0) {
    logger.info(resultado, "Revisión de formularios de Meta");
  }
  return resultado;
}

let corriendo = false;

export function iniciarReconciliacionLeads(): void {
  if (!env.LEADS_RECONCILIAR_ACTIVO) {
    logger.info("Revisión automática de formularios de Meta apagada (LEADS_RECONCILIAR_ACTIVO=false)");
    return;
  }
  if (!metaConfigurado || paginasMeta().length === 0) return;
  const vuelta = () => {
    if (corriendo) return;
    corriendo = true;
    reconciliarLeads()
      .catch((err: unknown) => logger.error({ err }, "Falló una vuelta de la revisión de formularios"))
      .finally(() => {
        corriendo = false;
      });
  };
  setInterval(vuelta, env.LEADS_RECONCILIAR_MIN * 60_000);
  // Una primera vuelta poco después de arrancar: cubre lo que llegó mientras se desplegaba.
  setTimeout(vuelta, 30_000);
  logger.info(
    { cadaMin: env.LEADS_RECONCILIAR_MIN, ventanaMin: env.LEADS_VENTANA_MIN, paginas: paginasMeta().length },
    "Revisión automática de formularios de Meta activa",
  );
}
