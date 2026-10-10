/**
 * Embudo comercial (tablero por etapas): lógica pura, sin Supabase ni React.
 * Cada tarjeta es una conversación; cada columna, una `etapa`. Lo dibuja
 * components/admin/embudo/Embudo.tsx.
 */

import { ETAPAS, esperaRespuesta, type ConversacionResumen, type Etapa, type MotivoCierre } from "./chats-tipos";

/** Cuántos días de conversaciones cerradas se muestran en la última columna. */
export const DIAS_CERRADAS = 30;

export type FiltrosEmbudo = {
  /** "" = todos; "mias" = las del usuario; "sin_asignar"; o el id de una persona. */
  vendedor: string;
  canal: string;
  /** "" = todos; "campana" = cualquiera de campaña; o el texto exacto de `fuente`. */
  origen: string;
  busqueda: string;
};

export const FILTROS_VACIOS: FiltrosEmbudo = { vendedor: "", canal: "", origen: "", busqueda: "" };

export function coincideEmbudo(c: ConversacionResumen, f: FiltrosEmbudo, usuarioId: string): boolean {
  if (f.vendedor === "mias" && c.asignada_a !== usuarioId) return false;
  if (f.vendedor === "sin_asignar" && c.asignada_a !== null) return false;
  if (f.vendedor && f.vendedor !== "mias" && f.vendedor !== "sin_asignar" && c.asignada_a !== f.vendedor) return false;

  if (f.canal === "comentarios") {
    if (c.origen !== "comentario") return false;
  } else if (f.canal && c.canal !== f.canal) {
    return false;
  }

  if (f.origen === "campana") {
    if (!c.fuente?.startsWith("Campaña ")) return false;
  } else if (f.origen && c.fuente !== f.origen) {
    return false;
  }

  const termino = f.busqueda.trim().toLowerCase();
  if (!termino) return true;
  const digitos = termino.replace(/\D/g, "");
  if (digitos.length >= 3 && (c.cliente_telefono ?? "").includes(digitos)) return true;
  return [c.cliente_nombre, c.cliente_telefono, c.identidad_nombre, c.identidad_username, c.ultimo_contenido, c.fuente].some((v) =>
    (v ?? "").toLowerCase().includes(termino),
  );
}

export type Columna = {
  etapa: Etapa;
  conversaciones: ConversacionResumen[];
  sinResponder: number;
};

/** Las tarjetas por columna: lo que espera respuesta primero y después lo más reciente. */
export function armarColumnas(conversaciones: ConversacionResumen[], filtros: FiltrosEmbudo, usuarioId: string): Columna[] {
  const porEtapa = new Map<Etapa, ConversacionResumen[]>(ETAPAS.map((e) => [e, []]));
  for (const c of conversaciones) {
    if (!coincideEmbudo(c, filtros, usuarioId)) continue;
    porEtapa.get(c.etapa)?.push(c);
  }
  return ETAPAS.map((etapa) => {
    const lista = porEtapa.get(etapa) ?? [];
    const cerrada = etapa === "cerrado";
    lista.sort((a, b) => {
      if (!cerrada) {
        const pa = esperaRespuesta(a) && a.estado !== "cerrada" ? 1 : 0;
        const pb = esperaRespuesta(b) && b.estado !== "cerrada" ? 1 : 0;
        if (pa !== pb) return pb - pa;
      }
      return Date.parse(b.actividad_at) - Date.parse(a.actividad_at);
    });
    return {
      etapa,
      conversaciones: lista,
      sinResponder: cerrada ? 0 : lista.filter((c) => esperaRespuesta(c) && c.estado !== "cerrada").length,
    };
  });
}

/** Lo que se escribe en `conversaciones` al soltar una tarjeta en otra columna. */
export type PatchMover = {
  etapa: Etapa;
  estado?: "activa" | "cerrada";
  motivo_cierre?: MotivoCierre | null;
};

/**
 * - A una etapa de trabajo: solo cambia `etapa`. Si estaba cerrada, se reabre (`estado` activa, sin motivo): el bot
 *   no vuelve a hablar solo porque la reapertura no pasa por «Yo»/«Bot»; el estado de quien atiende lo decide el staff.
 * - A «Cerrada»: pide motivo (lo hace la pantalla) y cierra.
 * - Misma columna: no hay nada que guardar (null).
 */
export function patchParaMover(c: Pick<ConversacionResumen, "etapa" | "estado">, destino: Etapa, motivo?: MotivoCierre): PatchMover | null {
  if (destino === c.etapa) return null;
  if (destino === "cerrado") return { etapa: "cerrado", estado: "cerrada", motivo_cierre: motivo ?? "otro" };
  if (c.estado === "cerrada") return { etapa: destino, estado: "activa", motivo_cierre: null };
  if (c.etapa === "cerrado") return { etapa: destino, motivo_cierre: null };
  return { etapa: destino };
}

export function origenesDisponibles(conversaciones: ConversacionResumen[]): string[] {
  const fuentes = new Set<string>();
  for (const c of conversaciones) if (c.fuente) fuentes.add(c.fuente);
  return [...fuentes].sort((a, b) => {
    const ca = a.startsWith("Campaña ") ? 0 : 1;
    const cb = b.startsWith("Campaña ") ? 0 : 1;
    return ca - cb || a.localeCompare(b, "es");
  });
}
