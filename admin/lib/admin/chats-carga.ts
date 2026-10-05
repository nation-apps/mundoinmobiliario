/**
 * Carga inicial de la bandeja de chats. SOLO servidor: usa las cookies de la
 * sesión del staff (RLS `is_staff()`), así que no debe importarse desde un
 * componente con "use client". Lo usan /admin/chats y /app/chats.
 */

import { createServerSupabase } from "@/lib/supabase/server-auth";
import {
  LIMITE_BANDEJA,
  type ClienteEtiqueta,
  type ConversacionResumen,
  type DatosBandeja,
  type Etiqueta,
  type PlantillaMedia,
  type RespuestaRapida,
  type StaffMiembro,
} from "@/lib/admin/chats-tipos";

type Respuesta = { data: unknown; error: { message: string } | null };

const VACIO: DatosBandeja = {
  conversaciones: [],
  etiquetas: [],
  clienteEtiquetas: [],
  staff: [],
  respuestasRapidas: [],
  plantillas: [],
};

/**
 * Si una consulta falla (p. ej. falta aplicar la migración 0006), se anota en
 * el log del servidor y esa parte queda vacía: la página nunca responde 500.
 */
function filas<T>(tabla: string, res: Respuesta): T[] {
  if (res.error) {
    console.error(`[chats] No se pudo leer ${tabla}: ${res.error.message}`);
    return [];
  }
  return Array.isArray(res.data) ? (res.data as T[]) : [];
}

export async function cargarDatosBandeja(): Promise<DatosBandeja> {
  try {
    const supabase = await createServerSupabase();

    const [conversaciones, etiquetas, clienteEtiquetas, staff, respuestas, plantillas] =
      await Promise.all([
        supabase
          .from("conversaciones_resumen")
          .select("*")
          .order("actividad_at", { ascending: false })
          .limit(LIMITE_BANDEJA),
        supabase.from("etiquetas").select("id, nombre, color").order("nombre"),
        supabase.from("cliente_etiquetas").select("cliente_id, etiqueta_id"),
        supabase
          .from("staff")
          .select("user_id, nombre, rol")
          .eq("activo", true)
          .order("nombre"),
        supabase
          .from("respuestas_rapidas")
          .select("id, atajo, titulo, contenido, canal, activa, sort_order")
          .eq("activa", true)
          .order("sort_order"),
        supabase
          .from("plantillas_media")
          .select("id, nombre, tipo, storage_path, descripcion_uso, caption, activo")
          .eq("activo", true)
          .order("nombre"),
      ]);

    return {
      conversaciones: filas<ConversacionResumen>("conversaciones_resumen", conversaciones),
      etiquetas: filas<Etiqueta>("etiquetas", etiquetas),
      clienteEtiquetas: filas<ClienteEtiqueta>("cliente_etiquetas", clienteEtiquetas),
      staff: filas<StaffMiembro>("staff", staff),
      respuestasRapidas: filas<RespuestaRapida>("respuestas_rapidas", respuestas),
      plantillas: filas<PlantillaMedia>("plantillas_media", plantillas),
    };
  } catch (err) {
    // Fallo de red hacia Supabase: la bandeja abre vacía y se llena al recargar.
    console.error("[chats] No se pudo cargar la bandeja:", err);
    return VACIO;
  }
}
