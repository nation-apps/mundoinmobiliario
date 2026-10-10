"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  ALCANCES_REPARTO,
  MODOS_REPARTO,
  porcentajesParejos,
  problemaReparto,
  sumaPorcentajes,
  type ConteoReparto,
  type MiembroReparto,
  type ModoReparto,
  type RepartoConfig,
} from "@/lib/admin/reparto";

const ROL_LABEL: Record<string, string> = { admin: "Administración", asistente: "Asistente", vendedor: "Vendedor" };

type Borrador = Pick<RepartoConfig, "modo" | "alcance" | "participantes" | "porcentajes" | "mismo_vendedor">;

function firma(b: Borrador): string {
  return JSON.stringify([b.modo, b.alcance, [...b.participantes].sort(), b.porcentajes, b.mismo_vendedor]);
}

export default function Reparto({
  inicial,
  equipo,
  conteo,
  diasEstadisticas,
  usuarioId,
}: {
  inicial: RepartoConfig | null;
  equipo: MiembroReparto[];
  conteo: ConteoReparto[];
  diasEstadisticas: number;
  usuarioId: string;
}) {
  const router = useRouter();
  const idsActivos = useMemo(() => equipo.map((m) => m.user_id), [equipo]);
  // Por defecto se reparte entre los vendedores; si no hay ninguno, entre todo el equipo activo.
  const idsVendedores = useMemo(() => {
    const vendedores = equipo.filter((m) => m.rol === "vendedor").map((m) => m.user_id);
    return vendedores.length > 0 ? vendedores : idsActivos;
  }, [equipo, idsActivos]);

  const guardado: Borrador | null = inicial && {
    modo: inicial.modo,
    alcance: inicial.alcance,
    participantes: inicial.participantes ?? [],
    porcentajes: inicial.porcentajes ?? {},
    mismo_vendedor: inicial.mismo_vendedor,
  };
  const [borrador, setBorrador] = useState<Borrador | null>(guardado);
  const [guardando, setGuardando] = useState(false);

  if (!borrador || !guardado) {
    return (
      <section className="admin-card p-5 text-sm text-ink-soft">
        Falta preparar la base de datos: corre <code>supabase/migrations/0004_reparto_leads.sql</code> en el SQL Editor de
        Supabase y vuelve a cargar esta página.
      </section>
    );
  }

  const cambiado = firma(borrador) !== firma(guardado);
  const problema = problemaReparto(borrador, idsActivos);
  const suma = sumaPorcentajes(borrador.porcentajes, idsActivos);
  const porUsuario = new Map(conteo.map((c) => [c.user_id, c]));
  const totalRepartidas = conteo.reduce((t, c) => t + c.reparto, 0);

  function cambiarModo(modo: ModoReparto) {
    setBorrador((b) => {
      if (!b) return b;
      // Al elegir un modo por primera vez se propone el reparto entre los vendedores, para no empezar en blanco.
      if (modo === "aleatorio" && b.participantes.filter((id) => idsActivos.includes(id)).length === 0) {
        return { ...b, modo, participantes: idsVendedores };
      }
      if (modo === "porcentaje" && sumaPorcentajes(b.porcentajes, idsActivos) === 0) {
        return { ...b, modo, porcentajes: porcentajesParejos(idsVendedores) };
      }
      return { ...b, modo };
    });
  }

  function alternarParticipante(id: string, participa: boolean) {
    setBorrador((b) =>
      b && { ...b, participantes: participa ? [...new Set([...b.participantes, id])] : b.participantes.filter((p) => p !== id) },
    );
  }

  function cambiarPorcentaje(id: string, texto: string) {
    const valor = texto === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(texto))));
    if (Number.isNaN(valor)) return;
    setBorrador((b) => b && { ...b, porcentajes: { ...b.porcentajes, [id]: valor } });
  }

  async function guardar() {
    if (!borrador || problema) return;
    setGuardando(true);
    // Solo personas activas: alguien desactivado no debe seguir contando para el sorteo ni para la suma.
    const cambios = {
      modo: borrador.modo,
      alcance: borrador.alcance,
      participantes: borrador.participantes.filter((id) => idsActivos.includes(id)),
      porcentajes: Object.fromEntries(idsActivos.map((id) => [id, borrador.porcentajes[id] ?? 0])),
      mismo_vendedor: borrador.mismo_vendedor,
      updated_by: usuarioId,
    };
    const { data, error } = await createBrowserSupabase().from("reparto_config").update(cambios).eq("id", 1).select("id");
    setGuardando(false);
    if (error || !data?.length) {
      toast.error("No se pudo guardar el reparto.");
      return;
    }
    toast.success(
      borrador.modo === "apagado"
        ? "Reparto apagado: las conversaciones nuevas quedan sin asignar."
        : "Guardado: las conversaciones nuevas se reparten desde ahora.",
    );
    router.refresh();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section className="admin-card flex flex-col gap-3 p-5">
        <h2 className="t-display text-xl leading-none">Cómo se reparten</h2>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modo de reparto">
          {MODOS_REPARTO.map((m) => {
            const activo = borrador.modo === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => cambiarModo(m.id)}
                className={`flex flex-col gap-1 border p-3 text-left transition-colors max-lg:min-h-11 ${
                  activo ? "border-accent bg-accent/5" : "border-line hover:border-ink/40"
                }`}
              >
                <span className="text-sm font-semibold text-ink">{m.label}</span>
                <span className="text-xs leading-relaxed text-muted">{m.ayuda}</span>
              </button>
            );
          })}
        </div>
      </section>

      {borrador.modo !== "apagado" && (
        <section className="admin-card flex flex-col gap-3 p-5">
          <h2 className="t-display text-xl leading-none">Qué conversaciones</h2>
          {ALCANCES_REPARTO.map((a) => (
            <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink">
              <input
                type="radio"
                name="alcance"
                checked={borrador.alcance === a.id}
                onChange={() => setBorrador((b) => b && { ...b, alcance: a.id })}
                className="accent-[var(--accent)]"
              />
              {a.label}
            </label>
          ))}
          <label className="flex min-h-11 cursor-pointer items-start gap-3 border-t border-line pt-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={borrador.mismo_vendedor}
              onChange={(e) => setBorrador((b) => b && { ...b, mismo_vendedor: e.target.checked })}
              className="mt-1 accent-[var(--accent)]"
            />
            <span>
              Si el cliente ya tenía vendedor, sigue con el mismo
              <span className="block text-xs text-muted">
                Por ejemplo, alguien que dejó un formulario y después escribe por WhatsApp. No cuenta para los porcentajes. Si ese
                vendedor fue desactivado, se reparte de nuevo.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted">
            Los comentarios públicos no se reparten, y las conversaciones que ya tienen dueño no se tocan. Quien recibe una
            conversación ve el aviso «Te asignaron una conversación» y la encuentra en Chats, filtro «Mías».
          </p>
        </section>
      )}

      <section className="admin-card flex flex-col gap-3 p-5">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="t-display text-xl leading-none">Equipo</h2>
          {borrador.modo === "porcentaje" && (
            <button
              type="button"
              onClick={() => setBorrador((b) => b && { ...b, porcentajes: porcentajesParejos(idsVendedores) })}
              className="admin-btn ghost max-lg:min-h-11"
            >
              Repartir parejo entre vendedores
            </button>
          )}
        </header>

        {equipo.length === 0 ? (
          <p className="text-sm text-muted">No hay personas activas en el equipo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="t-mono border-b border-line text-left text-[10.5px] uppercase tracking-[0.1em] text-muted">
                <th className="py-2 font-semibold">Persona</th>
                <th className="py-2 font-semibold">
                  {borrador.modo === "aleatorio" ? "En el sorteo" : borrador.modo === "porcentaje" ? "Porcentaje" : ""}
                </th>
                <th className="py-2 text-right font-semibold">Últimos {diasEstadisticas} días</th>
              </tr>
            </thead>
            <tbody>
              {equipo.map((m) => {
                const c = porUsuario.get(m.user_id);
                const real = totalRepartidas > 0 && c ? Math.round((c.reparto / totalRepartidas) * 100) : null;
                return (
                  <tr key={m.user_id} className="border-b border-line/60">
                    <td className="py-2.5 pr-3">
                      <span className="block text-ink">{m.nombre}</span>
                      <span className="block text-xs text-muted">
                        {ROL_LABEL[m.rol] ?? m.rol}
                        <span className="max-sm:hidden"> · {m.email}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {borrador.modo === "aleatorio" && (
                        <input
                          type="checkbox"
                          aria-label={`${m.nombre} entra al sorteo`}
                          checked={borrador.participantes.includes(m.user_id)}
                          onChange={(e) => alternarParticipante(m.user_id, e.target.checked)}
                          className="size-4 accent-[var(--accent)]"
                        />
                      )}
                      {borrador.modo === "porcentaje" && (
                        <span className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            step={1}
                            aria-label={`Porcentaje de ${m.nombre}`}
                            value={borrador.porcentajes[m.user_id] ?? 0}
                            onChange={(e) => cambiarPorcentaje(m.user_id, e.target.value)}
                            className="admin-input w-20 text-right tabular-nums"
                          />
                          <span className="text-muted">%</span>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-ink-soft">
                      {c ? c.reparto : 0}
                      {real !== null && <span className="text-muted"> · {real} %</span>}
                      {c && c.mismoCliente > 0 && (
                        <span className="block text-xs text-muted" title="Clientes que volvieron con el mismo vendedor">
                          +{c.mismoCliente} volvieron
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {borrador.modo === "porcentaje" && (
              <tfoot>
                <tr>
                  <td className="py-2.5 text-right text-xs uppercase tracking-[0.14em] text-muted">Total</td>
                  <td className={`py-2.5 pl-1 tabular-nums ${suma === 100 ? "text-ink" : "font-semibold text-[#a82f2f]"}`}>
                    {suma} %
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {problema && borrador.modo !== "apagado" && <p className="text-sm text-redline">{problema}</p>}
        <button
          type="button"
          onClick={() => setBorrador(guardado)}
          disabled={!cambiado || guardando}
          className="admin-btn ghost max-lg:min-h-11"
        >
          Descartar cambios
        </button>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!cambiado || guardando || problema !== null}
          className="admin-btn max-lg:min-h-11"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
