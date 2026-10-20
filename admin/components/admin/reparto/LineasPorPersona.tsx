"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { BotApiError, cambiarLineasPersona } from "@/lib/admin/bot-api";
import { LINEAS_WHATSAPP } from "@/lib/admin/chats-tipos";

type Persona = { user_id: string; nombre: string; rol: string };

/**
 * De qué líneas de WhatsApp recibe leads cada persona. El reparto automático solo le asigna los chats de las líneas que atiende:
 * un lead de «Campaña Formulario Meta TVS» o «WhatsApp Directo TVS» va a quien atiende la línea de TVS, y lo mismo con Mundo de Motos.
 * Una persona puede atender las dos. Solo la administración lo cambia.
 */
export default function LineasPorPersona({
  equipo,
  inicial,
  puedeEditar,
}: {
  equipo: Persona[];
  /** user_id → líneas que atiende (lo que no aparece atiende todas). */
  inicial: Record<string, string[]>;
  puedeEditar: boolean;
}) {
  const todas = LINEAS_WHATSAPP.map((l) => l.id);
  const [lineas, setLineas] = useState<Record<string, string[]>>(inicial);
  const [guardando, setGuardando] = useState<string | null>(null);

  const de = (id: string) => lineas[id] ?? todas;

  async function alternar(persona: Persona, linea: string, atiende: boolean) {
    const antes = de(persona.user_id);
    const despues = atiende ? [...new Set([...antes, linea])] : antes.filter((l) => l !== linea);
    setLineas((previas) => ({ ...previas, [persona.user_id]: despues }));
    setGuardando(persona.user_id);
    try {
      await cambiarLineasPersona(persona.user_id, despues);
      if (despues.length === 0) toast("Sin líneas: no recibirá leads nuevos en el reparto.");
    } catch (err) {
      setLineas((previas) => ({ ...previas, [persona.user_id]: antes }));
      toast.error(err instanceof BotApiError ? err.message : "No se pudo guardar el cambio.");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <section className="admin-card mt-4 flex flex-col gap-3 p-5">
      <header>
        <h2 className="t-display flex items-center gap-2.5 text-xl leading-none">
          <Smartphone size={20} aria-hidden />
          Líneas de WhatsApp por persona
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          El reparto solo le asigna a cada persona los chats de las líneas que atiende. Si alguien atiende las dos, recibe leads de TVS y de
          Mundo de Motos, y al escribir elige desde cuál mandar.
        </p>
      </header>

      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13px]">
          <caption className="sr-only">Líneas de WhatsApp que atiende cada persona</caption>
          <thead>
            <tr>
              <th scope="col" className="t-mono border-b border-line bg-[#f7f9fb] px-5 py-2.5 text-left text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                Persona
              </th>
              {LINEAS_WHATSAPP.map((l) => (
                <th key={l.id} scope="col" className="t-mono border-b border-line bg-[#f7f9fb] px-3 py-2.5 text-center text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                  {l.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipo.map((p) => (
              <tr key={p.user_id}>
                <td className="border-b border-line px-5 py-2.5 text-ink">{p.nombre}</td>
                {LINEAS_WHATSAPP.map((l) => (
                  <td key={l.id} className="border-b border-line px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={de(p.user_id).includes(l.id)}
                      disabled={!puedeEditar || guardando === p.user_id}
                      onChange={(e) => void alternar(p, l.id, e.target.checked)}
                      aria-label={`${p.nombre} atiende ${l.etiqueta}`}
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!puedeEditar && <p className="text-[12px] text-muted">Solo la administración cambia esto.</p>}
    </section>
  );
}
