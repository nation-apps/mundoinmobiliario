"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, CircleAlert, CreditCard, ExternalLink, LoaderCircle, LockKeyhole, ReceiptText } from "lucide-react";
import { BotApiError, abrirPortalDePago, iniciarPago } from "@/lib/admin/bot-api";
import { ESTADO_ROTULO, GRACIA_DIAS, accesoPermitido, finDeGracia, type Suscripcion } from "@/lib/admin/suscripcion";

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Cancun", day: "numeric", month: "long", year: "numeric" });
}

/** Cuántas veces se vuelve a leer el estado tras pagar: Stripe avisa al bot unos segundos después. */
const REINTENTOS_TRAS_PAGO = 10;

export default function SuscripcionVista({
  suscripcion,
  esAdmin,
  obligatoria,
  precio,
  retorno,
}: {
  suscripcion: Suscripcion;
  esAdmin: boolean;
  obligatoria: boolean;
  precio: string;
  retorno: "ok" | "cancelado" | null;
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState<"pagar" | "portal" | null>(null);
  const vueltas = useRef(0);

  const activa = suscripcion.estado === "activa" || suscripcion.estado === "en_prueba";
  const esperandoAviso = retorno === "ok" && !activa;

  // Al volver del pago, el estado se actualiza solo cuando Stripe avisa: se relee unas cuantas veces.
  useEffect(() => {
    if (!esperandoAviso) return;
    const t = setInterval(() => {
      vueltas.current += 1;
      router.refresh();
      if (vueltas.current >= REINTENTOS_TRAS_PAGO) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [esperandoAviso, router]);

  async function ir(que: "pagar" | "portal") {
    setTrabajando(que);
    try {
      const { url } = await (que === "pagar" ? iniciarPago() : abrirPortalDePago());
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof BotApiError ? err.message : "No se pudo abrir el pago.");
      setTrabajando(null);
    }
  }

  const gracia = finDeGracia(suscripcion);
  const tono = activa
    ? "border-signal/30 bg-signal/[0.06]"
    : accesoPermitido(suscripcion)
      ? "border-amber/50 bg-[rgba(242,165,22,0.10)]"
      : "border-redline/30 bg-redline/[0.05]";

  return (
    <div className="mx-auto max-w-2xl">
      {retorno === "ok" && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-signal/30 bg-signal/[0.06] px-4 py-3 text-sm text-signal-ink">
          {activa ? <BadgeCheck size={18} aria-hidden /> : <LoaderCircle size={18} aria-hidden className="animate-spin" />}
          {activa ? "Pago recibido. La suscripción está activa." : "Pago recibido. Confirmando con Stripe, unos segundos…"}
        </p>
      )}
      {retorno === "cancelado" && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-porcelain px-4 py-3 text-sm text-ink-soft">
          <CircleAlert size={18} aria-hidden /> No se completó el pago. Puedes intentarlo de nuevo cuando quieras.
        </p>
      )}

      <section className={`admin-card border p-5 sm:p-6 ${tono}`} aria-labelledby="estado-suscripcion">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="t-brace">Estado</span>
            <h2 id="estado-suscripcion" className="t-titulo mt-2 text-[34px]">
              {ESTADO_ROTULO[suscripcion.estado]}
            </h2>
          </div>
          <div className="text-right">
            <p className="t-mono text-[11px] uppercase tracking-[0.12em] text-muted">Plan</p>
            <p className="text-lg font-semibold">{precio}</p>
          </div>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="admin-label">{suscripcion.cancela_al_final ? "Activa hasta" : "Próxima renovación"}</dt>
            <dd>{activa ? fecha(suscripcion.periodo_fin) : "—"}</dd>
          </div>
          {suscripcion.estado === "pago_pendiente" && (
            <div>
              <dt className="admin-label">El panel sigue abierto hasta</dt>
              <dd>{gracia ? fecha(gracia.toISOString()) : `${GRACIA_DIAS} días`}</dd>
            </div>
          )}
        </dl>

        {suscripcion.cancela_al_final && activa && (
          <p className="mt-4 text-sm text-ink-soft">La suscripción se cancelará al terminar el periodo pagado. Puedes reactivarla desde «Administrar pago».</p>
        )}
        {suscripcion.estado === "pago_pendiente" && (
          <p className="mt-4 text-sm text-ink-soft">
            No se pudo cobrar la tarjeta. Actualízala en «Administrar pago» para no perder el acceso.
          </p>
        )}
        {!accesoPermitido(suscripcion) && obligatoria && (
          <p className="mt-4 flex items-start gap-2 text-sm text-ink-soft">
            <LockKeyhole size={16} aria-hidden className="mt-0.5 shrink-0" />
            El acceso al panel está suspendido hasta que la suscripción se active.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {esAdmin && !activa && (
            <button type="button" onClick={() => void ir("pagar")} disabled={trabajando !== null} className="admin-btn h-11">
              {trabajando === "pagar" ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : <CreditCard size={16} aria-hidden />}
              {suscripcion.estado === "sin_suscripcion" ? "Activar suscripción" : "Pagar ahora"}
            </button>
          )}
          {esAdmin && suscripcion.stripe_customer_id && (
            <button type="button" onClick={() => void ir("portal")} disabled={trabajando !== null} className="admin-btn ghost h-11">
              {trabajando === "portal" ? <LoaderCircle size={16} aria-hidden className="animate-spin" /> : <ReceiptText size={16} aria-hidden />}
              Administrar pago
              <ExternalLink size={14} aria-hidden />
            </button>
          )}
          {!esAdmin && <p className="text-sm text-muted">Solo la administración del panel puede activar o cambiar el pago.</p>}
        </div>
      </section>

      <p className="mt-4 text-[12.5px] text-muted">
        El pago se hace en Stripe, no en este panel: aquí nunca se ve ni se guarda el número de tarjeta.
      </p>
    </div>
  );
}
