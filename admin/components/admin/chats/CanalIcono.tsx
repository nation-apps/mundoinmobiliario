import type { Canal } from "@/lib/admin/chats-tipos";

const COLOR: Record<Canal, string> = {
  whatsapp: "#25d366",
  messenger: "#0084ff",
  instagram: "#e1306c",
  tiktok: "#1d1315",
  web: "#b08d57",
};

/**
 * Marca del canal como un punto de color con la inicial: suficiente para
 * distinguir de un vistazo sin cargar logos de terceros.
 */
export default function CanalIcono({
  canal,
  className = "",
  size = 16,
}: {
  canal: Canal;
  className?: string;
  size?: number;
}) {
  const letra = canal === "whatsapp" ? "W" : canal === "messenger" ? "M" : canal === "instagram" ? "I" : canal === "tiktok" ? "T" : "@";
  return (
    <span
      aria-label={canal}
      title={canal}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ width: size, height: size, background: COLOR[canal], fontSize: Math.round(size * 0.55), lineHeight: 1 }}
    >
      {letra}
    </span>
  );
}
