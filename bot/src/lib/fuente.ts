import type { CanalConversacion, OrigenConversacion } from "../db/repositories/conversaciones.js";
import { HILO_LEAD_ADS } from "../meta/leadAds.js";

/**
 * El campo «origen» de cada lead (`conversaciones.fuente`, y `clientes.fuente` para el primer contacto), con las
 * etiquetas que pidió el cliente: «Campaña Formulario Meta TVS», «Campaña WhatsApp Meta Mundo de Motos»… La marca es
 * la de la página que publicó el anuncio (meta/paginas.ts); si no se pudo saber, queda «Campaña … Meta» a secas.
 * Las mismas etiquetas usa el relleno de supabase/migrations/0006_fuente_lead.sql: cambiarlas en los dos lados.
 */

export function fuenteCampana(tipo: "Formulario" | "WhatsApp", marca: string | null): string {
  return marca ? `Campaña ${tipo} Meta ${marca}` : `Campaña ${tipo} Meta`;
}

export function esFuenteDeCampana(fuente: string | null | undefined): boolean {
  return Boolean(fuente?.startsWith("Campaña "));
}

const RED_DE_COMENTARIO: Partial<Record<CanalConversacion, string>> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  messenger: "Facebook",
};

/** Lo que no viene de una campaña: se deduce del canal y el origen de la conversación. */
export function fuentePorCanal(
  canal: CanalConversacion,
  origen: OrigenConversacion,
  hiloExterno: string | null = null,
): string | null {
  if (origen === "formulario") return hiloExterno === HILO_LEAD_ADS ? fuenteCampana("Formulario", null) : "Formulario web";
  if (origen === "comentario") return `Comentario ${RED_DE_COMENTARIO[canal] ?? "Facebook"}`;
  switch (canal) {
    case "whatsapp":
      return "WhatsApp directo";
    case "instagram":
      return "Instagram";
    case "messenger":
      return "Messenger";
    case "tiktok":
      return "TikTok";
    default:
      return null;
  }
}
