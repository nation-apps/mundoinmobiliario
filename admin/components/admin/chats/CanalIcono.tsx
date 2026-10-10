import { Globe } from "lucide-react";
import { CANAL_LABEL, type Canal } from "@/lib/admin/chats-tipos";
import { LogoMarca } from "@/components/admin/iconos/Marcas";

const COLOR: Record<Canal, string> = {
  whatsapp: "#1daa61",
  messenger: "#0a7cff",
  instagram: "#e1306c",
  tiktok: "#0a0f1a",
  web: "#5f6b7d",
};

/** Los formularios de anuncios entran como canal «web», pero vienen de una página de Facebook. */
const COLOR_FACEBOOK = "#0866ff";

/**
 * Logo del canal en blanco sobre su color, dentro de un círculo: se reconoce
 * de un vistazo y nunca es el único portador del dato (lleva su nombre).
 */
export default function CanalIcono({
  canal,
  leadAds = false,
  className = "",
  size = 16,
}: {
  canal: Canal;
  /** Formulario de un anuncio de Meta: se muestra con el logo de Facebook. */
  leadAds?: boolean;
  className?: string;
  size?: number;
}) {
  const nombre = leadAds ? "Formulario de anuncio" : CANAL_LABEL[canal];
  const glifo = Math.round(size * 0.58);
  return (
    <span
      role="img"
      aria-label={nombre}
      title={nombre}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${className}`}
      style={{ width: size, height: size, background: leadAds ? "#ffffff" : COLOR[canal] }}
    >
      {leadAds ? (
        // El logo de Facebook ya es un círculo: ocupa todo y la «f» deja ver el blanco.
        <LogoMarca marca="facebook" size={size} className="shrink-0" style={{ color: COLOR_FACEBOOK }} />
      ) : canal === "web" ? (
        <Globe size={glifo} strokeWidth={2.4} aria-hidden />
      ) : (
        <LogoMarca marca={canal} size={glifo} />
      )}
    </span>
  );
}
