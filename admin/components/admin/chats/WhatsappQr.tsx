"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { QrCode, TriangleAlert } from "lucide-react";
import CanalIcono from "@/components/admin/chats/CanalIcono";
import { BotApiError, conectarWhatsappQr, desconectarWhatsappQr, estadoWhatsappQr, type EstadoWhatsappQr } from "@/lib/admin/bot-api";
import { telefonoBonito } from "@/lib/admin/chats-tipos";

const ETIQUETA: Record<EstadoWhatsappQr["estado"], { texto: string; tono: "bien" | "mal" | "neutro" | "aviso" }> = {
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
 * WhatsApp por QR (Baileys): vincula un número como un dispositivo más, sin pasar por la API de Meta. Solo para
 * administración. No es oficial: WhatsApp puede bloquear el número, por eso el bot solo contesta a quien escribe.
 */
export default function WhatsappQr() {
  const [estado, setEstado] = useState<EstadoWhatsappQr | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
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

  // Mientras se espera el escaneo o se conecta, se pregunta seguido; en reposo, de vez en cuando.
  const rapido = estado?.estado === "esperando_qr" || estado?.estado === "conectando";
  useEffect(() => {
    if (sinPermiso) return;
    const primera = setTimeout(() => void cargar(), 0);
    const id = setInterval(() => void cargar(), rapido ? 2500 : 15_000);
    return () => {
      clearTimeout(primera);
      clearInterval(id);
    };
  }, [cargar, rapido, sinPermiso]);

  async function accion(hacer: () => Promise<EstadoWhatsappQr>, mensajeError: string) {
    setOcupado(true);
    try {
      setEstado(await hacer());
      setError(null);
    } catch (err) {
      toast.error(err instanceof BotApiError ? err.message : mensajeError);
    } finally {
      setOcupado(false);
    }
  }

  if (sinPermiso) return null;

  const etiqueta = estado ? ETIQUETA[estado.estado] : null;
  const color = etiqueta ? COLORES[etiqueta.tono] : COLORES.neutro;
  const puedeConectar = estado && estado.activo && (estado.estado === "sin_sesion" || estado.estado === "desconectado");

  return (
    <section className="admin-card flex flex-col gap-4 p-5 md:col-span-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-display flex items-center gap-2.5 text-xl leading-none">
          <CanalIcono canal="whatsapp" size={22} />
          WhatsApp por QR
          <span className="t-mono rounded-full bg-bg-soft px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">no oficial</span>
        </h2>
        {etiqueta ? (
          <span
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{ background: color.fondo, color: color.texto }}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {etiqueta.texto}
          </span>
        ) : (
          <span className="text-[11px] text-muted">Consultando…</span>
        )}
      </header>

      <p className="text-[13px] leading-relaxed text-ink-soft">
        Vincula un número de WhatsApp escaneando un QR, como WhatsApp Web, y el bot contesta desde ahí. Mientras esté activo, los
        mensajes de WhatsApp del panel salen por este número y no por la API de Meta.
      </p>

      <div className="flex gap-2.5 rounded-xl border border-amber/50 bg-[rgba(242,165,22,0.10)] px-3.5 py-3 text-[12.5px] leading-snug text-amber-ink">
        <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
        <p>
          <strong>No está autorizado por Meta.</strong> WhatsApp puede bloquear el número, sobre todo con envíos masivos o a gente que no
          ha escrito primero. Por eso el bot solo contesta a quien le escribe, no manda plantillas ni difusiones, y limita los mensajes
          por minuto. Úsalo con un número de prueba.
        </p>
      </div>

      {error && <p className="text-[13px] text-redline">{error}</p>}

      {estado && !estado.activo && (
        <p className="text-[13px] text-ink-soft">
          Está apagado en el servidor. Para usarlo hay que activar la variable <code className="t-mono">WHATSAPP_QR_ACTIVO=true</code> del bot.
        </p>
      )}

      {estado?.estado === "esperando_qr" && (
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {estado.qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={estado.qr} alt="Código QR para vincular WhatsApp" width={240} height={240} className="rounded-xl border border-line bg-white p-2" />
          ) : (
            <div className="flex size-[256px] items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-muted">
              Generando el QR…
            </div>
          )}
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-soft">
            <li>Abre WhatsApp en el celular del número que quieres conectar.</li>
            <li>
              Entra a <strong>Ajustes → Dispositivos vinculados</strong> y toca <strong>Vincular un dispositivo</strong>.
            </li>
            <li>Escanea este código. El QR se renueva solo cada unos segundos.</li>
          </ol>
        </div>
      )}

      {estado?.estado === "conectado" && (
        <p className="text-[13px] text-ink-soft">
          Número vinculado: <strong className="t-mono">{estado.telefono ? telefonoBonito(estado.telefono) : "—"}</strong>. Quien le escriba a
          ese número aparecerá en Chats y el bot le contestará.
        </p>
      )}

      {estado?.error && estado.estado !== "conectado" && <p className="text-[13px] text-redline">{estado.error}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {puedeConectar && (
          <button type="button" disabled={ocupado} onClick={() => void accion(conectarWhatsappQr, "No se pudo generar el QR.")} className="admin-btn inline-flex items-center gap-2">
            <QrCode size={16} aria-hidden />
            Generar QR
          </button>
        )}
        {estado && estado.activo && estado.estado !== "sin_sesion" && estado.estado !== "desconectado" && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm("¿Desvincular este número? El bot dejará de recibir y contestar por WhatsApp hasta que lo vuelvas a vincular con un QR.")) {
                void accion(desconectarWhatsappQr, "No se pudo desvincular.");
              }
            }}
            className="admin-btn ghost"
          >
            Desvincular número
          </button>
        )}
      </div>
    </section>
  );
}
