"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { QrCode, TriangleAlert } from "lucide-react";
import CanalIcono from "@/components/admin/chats/CanalIcono";
import {
  BotApiError,
  conectarWhatsappQr,
  desconectarWhatsappQr,
  estadoWhatsappQr,
  type EstadoLineaWhatsappQr,
  type EstadoWhatsappQr,
} from "@/lib/admin/bot-api";
import { telefonoBonito } from "@/lib/admin/chats-tipos";

const ETIQUETA: Record<EstadoLineaWhatsappQr["estado"], { texto: string; tono: "bien" | "mal" | "neutro" | "aviso" }> = {
  apagado: { texto: "Apagado", tono: "neutro" },
  sin_sesion: { texto: "Sin número vinculado", tono: "neutro" },
  esperando_qr: { texto: "Esperando el escaneo", tono: "aviso" },
  conectando: { texto: "Conectando…", tono: "aviso" },
  conectado: { texto: "Conectado", tono: "bien" },
  desconectado: { texto: "Desconectado", tono: "mal" },
};

const COLORES = {
  bien: { fondo: "rgba(14,159,90,0.12)", texto: "#0a6b3d" },
  mal: { fondo: "rgba(225,29,72,0.09)", texto: "#9f1239" },
  aviso: { fondo: "rgba(242,165,22,0.18)", texto: "#8a5a00" },
  neutro: { fondo: "rgba(10,15,26,0.06)", texto: "#364152" },
};

/**
 * WhatsApp por QR (Baileys): vincula números como un dispositivo más, sin pasar por la API de Meta. Una tarjeta por línea (TVS y
 * Mundo de Motos), cada una con su QR. Solo para administración. No es oficial: WhatsApp puede bloquear el número, por eso el bot
 * solo contesta a quien le escribe.
 */
export default function WhatsappQr() {
  const [estado, setEstado] = useState<EstadoWhatsappQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setEstado(await estadoWhatsappQr());
      setError(null);
    } catch (err) {
      if (err instanceof BotApiError && (err.code === "forbidden" || err.status === 403)) setSinPermiso(true);
      else setError(err instanceof BotApiError ? err.message : "No se pudo consultar al bot.");
    }
  }, []);

  // Mientras alguna línea espera el escaneo o se conecta, se pregunta seguido; en reposo, de vez en cuando.
  const rapido = estado?.lineas.some((l) => l.estado === "esperando_qr" || l.estado === "conectando") ?? false;
  useEffect(() => {
    if (sinPermiso) return;
    const primera = setTimeout(() => void cargar(), 0);
    const id = setInterval(() => void cargar(), rapido ? 2500 : 15_000);
    return () => {
      clearTimeout(primera);
      clearInterval(id);
    };
  }, [cargar, rapido, sinPermiso]);

  async function accion(linea: string, hacer: (linea: string) => Promise<EstadoWhatsappQr>, mensajeError: string) {
    setOcupada(linea);
    try {
      setEstado(await hacer(linea));
      setError(null);
    } catch (err) {
      toast.error(err instanceof BotApiError ? err.message : mensajeError);
    } finally {
      setOcupada(null);
    }
  }

  if (sinPermiso) return null;

  return (
    <section className="admin-card flex flex-col gap-4 p-5 md:col-span-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-display flex items-center gap-2.5 text-xl leading-none">
          <CanalIcono canal="whatsapp" size={22} />
          WhatsApp por QR
          <span className="t-mono rounded-full bg-bg-soft px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">no oficial</span>
        </h2>
        {!estado && <span className="text-[11px] text-muted">Consultando…</span>}
      </header>

      <p className="text-[13px] leading-relaxed text-ink-soft">
        Vincula cada número de WhatsApp escaneando su QR, como WhatsApp Web, y el bot contesta desde ahí. Hay una línea por número: cada
        chat se atiende por la línea que le toca, y quien escribe en el panel puede elegir desde cuál mandar. Mientras esté activo, los
        mensajes de WhatsApp del panel salen por estos números y no por la API de Meta.
      </p>

      <div className="flex gap-2.5 rounded-xl border border-amber/50 bg-[rgba(242,165,22,0.10)] px-3.5 py-3 text-[12.5px] leading-snug text-amber-ink">
        <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
        <p>
          <strong>No está autorizado por Meta.</strong> WhatsApp puede bloquear el número, sobre todo con envíos masivos o a gente que no
          ha escrito primero. Por eso el bot solo contesta a quien le escribe, no manda plantillas ni difusiones, y limita los mensajes
          por minuto en cada número.
        </p>
      </div>

      {error && <p className="text-[13px] text-redline">{error}</p>}

      {estado && !estado.activo && (
        <p className="text-[13px] text-ink-soft">
          Está apagado en el servidor. Para usarlo hay que activar la variable <code className="t-mono">WHATSAPP_QR_ACTIVO=true</code> del bot.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(estado?.lineas ?? []).map((l) => (
          <TarjetaLinea
            key={l.id}
            linea={l}
            activo={estado?.activo ?? false}
            ocupada={ocupada === l.id}
            onConectar={() => void accion(l.id, conectarWhatsappQr, "No se pudo generar el QR.")}
            onDesvincular={() => void accion(l.id, desconectarWhatsappQr, "No se pudo desvincular.")}
          />
        ))}
      </div>
    </section>
  );
}

function TarjetaLinea({
  linea,
  activo,
  ocupada,
  onConectar,
  onDesvincular,
}: {
  linea: EstadoLineaWhatsappQr;
  activo: boolean;
  ocupada: boolean;
  onConectar: () => void;
  onDesvincular: () => void;
}) {
  const etiqueta = ETIQUETA[linea.estado];
  const color = COLORES[etiqueta.tono];
  // Desvincular corta el número: se confirma con un segundo toque (en el panel no se usa window.confirm).
  const [confirmando, setConfirmando] = useState(false);
  const puedeConectar = activo && (linea.estado === "sin_sesion" || linea.estado === "desconectado");
  const puedeDesvincular = activo && linea.estado !== "sin_sesion" && linea.estado !== "desconectado";

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-porcelain p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="t-display text-[17px] leading-tight">{linea.etiqueta}</h3>
          <p className="t-mono mt-0.5 text-[11px] text-muted">Número esperado: {telefonoBonito(linea.telefonoEsperado)}</p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{ background: color.fondo, color: color.texto }}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {etiqueta.texto}
        </span>
      </header>

      {linea.estado === "esperando_qr" && (
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          {linea.qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={linea.qr} alt={`Código QR para vincular ${linea.etiqueta}`} width={200} height={200} className="rounded-xl border border-line bg-white p-2" />
          ) : (
            <div className="flex size-[216px] items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-muted">Generando el QR…</div>
          )}
          <ol className="list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-ink-soft">
            <li>Abre WhatsApp en el celular de {linea.etiqueta}.</li>
            <li>
              Entra a <strong>Ajustes → Dispositivos vinculados</strong> y toca <strong>Vincular un dispositivo</strong>.
            </li>
            <li>Escanea este código. Se renueva solo cada unos segundos.</li>
          </ol>
        </div>
      )}

      {linea.estado === "conectado" && (
        <p className="text-[13px] text-ink-soft">
          Número vinculado: <strong className="t-mono">{linea.telefono ? telefonoBonito(linea.telefono) : "—"}</strong>.
        </p>
      )}

      {linea.advertencia && linea.estado === "conectado" && (
        <p className="flex gap-2 rounded-lg bg-[rgba(242,165,22,0.14)] px-3 py-2 text-[12px] leading-snug text-amber-ink">
          <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
          {linea.advertencia} Si fue un error, desvincúlalo y escanea el número correcto.
        </p>
      )}

      {linea.error && linea.estado !== "conectado" && <p className="text-[12.5px] text-redline">{linea.error}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {puedeConectar && (
          <button type="button" disabled={ocupada} onClick={onConectar} className="admin-btn inline-flex items-center gap-2">
            <QrCode size={16} aria-hidden />
            Generar QR
          </button>
        )}
        {puedeDesvincular &&
          (confirmando ? (
            <>
              <button
                type="button"
                disabled={ocupada}
                onClick={() => {
                  setConfirmando(false);
                  onDesvincular();
                }}
                className="admin-btn ghost text-redline"
              >
                Sí, desvincular
              </button>
              <button type="button" onClick={() => setConfirmando(false)} className="text-[12.5px] text-muted hover:text-ink">
                Cancelar
              </button>
              <p className="basis-full text-[11.5px] leading-snug text-muted">
                El bot dejará de recibir y contestar por este número hasta que lo vuelvas a vincular con un QR.
              </p>
            </>
          ) : (
            <button type="button" disabled={ocupada} onClick={() => setConfirmando(true)} className="admin-btn ghost">
              Desvincular número
            </button>
          ))}
      </div>
    </article>
  );
}
