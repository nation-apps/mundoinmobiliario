import { env } from "../config/env.js";
import { supabase } from "../db/client.js";
import { leerBienvenida } from "../db/repositories/bienvenida.js";
import { nombreDeStaff } from "../db/repositories/staff.js";
import { HILO_LEAD_ADS, camposDelContenido } from "../meta/leadAds.js";
import { idsDeLineas } from "../lib/lineas.js";
import { logger } from "../lib/logger.js";
import { programarPrimerMensaje, saludoGestionado } from "./primerMensajeLead.js";

const log = logger.child({ modulo: "primer-mensaje-pendientes" });

/** Hasta cuándo atrás se busca a quien llenó el formulario y no se le saludó (más viejo que esto ya no se le escribe primero). */
const VENTANA_HORAS = 24;
const POR_VUELTA = 40;
const CADA_MIN = 5;

/**
 * Pone en la cola de saludos a quien llenó un formulario en las últimas horas y todavía no recibió el primer mensaje. Cubre lo que
 * el aviso inmediato no alcanzó: la cola vive en memoria (un reinicio la pierde) y la línea puede haber estado desconectada.
 * Solo toca las líneas con el saludo encendido y conectadas. Devuelve cuántos puso en la cola.
 */
export async function programarSaludosPendientes(ahora: number = Date.now()): Promise<number> {
  if (!env.WHATSAPP_QR_ACTIVO) return 0;
  const { estadoLineaQr } = await import("../whatsapp-qr/sesion.js");
  const desde = new Date(ahora - VENTANA_HORAS * 3_600_000).toISOString();
  let puestos = 0;

  for (const linea of idsDeLineas()) {
    if (estadoLineaQr(linea).estado !== "conectado") continue;
    if (!(await leerBienvenida(linea)).formulario_activo) continue;

    const { data, error } = await supabase
      .from("conversaciones")
      .select("id, cliente_id, asignada_a")
      .eq("canal", "web")
      .eq("origen", "formulario")
      .eq("hilo_externo", HILO_LEAD_ADS)
      .eq("linea", linea)
      .in("estado", ["activa", "escalada"])
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(POR_VUELTA);
    if (error) throw error;

    for (const conv of (data ?? []) as { id: string; cliente_id: string; asignada_a: string | null }[]) {
      if (saludoGestionado(conv.id)) continue;
      const [{ data: cliente }, { data: primero }] = await Promise.all([
        supabase.from("clientes").select("telefono, nombre").eq("id", conv.cliente_id).maybeSingle(),
        supabase.from("mensajes").select("contenido, metadata").eq("conversacion_id", conv.id).eq("rol", "user").order("created_at", { ascending: true }).limit(1),
      ]);
      const telefono = (cliente as { telefono: string | null } | null)?.telefono;
      const formulario = ((primero ?? []) as { contenido: string; metadata: { marca?: string } | null }[])[0];
      if (!telefono || !formulario) continue;
      const asesor = conv.asignada_a ? await nombreDeStaff(conv.asignada_a).catch(() => null) : null;
      await programarPrimerMensaje({
        conversacionId: conv.id,
        clienteId: conv.cliente_id,
        telefono,
        linea,
        nombre: (cliente as { nombre: string | null } | null)?.nombre ?? null,
        campos: camposDelContenido(formulario.contenido),
        marca: formulario.metadata?.marca ?? null,
        asesor,
      });
      puestos++;
    }
  }
  return puestos;
}

/** Revisa cada pocos minutos (y una vez poco después de arrancar, cuando las líneas ya se reconectaron). */
export function iniciarSaludosPendientes(): void {
  if (!env.WHATSAPP_QR_ACTIVO) return;
  let corriendo = false;
  const vuelta = () => {
    if (corriendo) return;
    corriendo = true;
    programarSaludosPendientes()
      .then((n) => {
        if (n > 0) log.info({ n }, "Leads de formulario puestos en la cola de saludos");
      })
      .catch((err: unknown) => log.warn({ err }, "Falló la revisión de saludos pendientes"))
      .finally(() => {
        corriendo = false;
      });
  };
  setInterval(vuelta, CADA_MIN * 60_000);
  setTimeout(vuelta, 90_000);
}
