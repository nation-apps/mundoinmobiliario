"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Trophy } from "lucide-react";
import { infoAnuncio } from "@/lib/admin/bot-api";
import type { InfoAnuncio } from "@/lib/admin/anuncio";
import type { FilaAnuncio, Metricas } from "@/lib/admin/metricas";
import { Cero, Medidor, Td, Th } from "./Tablas";
import { SinDatos, Tarjeta } from "./Tarjeta";

/** Cuántos anuncios se consultan a Meta para saber si son video o imagen y tener su enlace (los de arriba de la tabla). */
const MAX_CONSULTAS = 15;

function porcentaje(parte: number, total: number): string {
  return total > 0 ? `${Math.round((parte / total) * 100)} %` : "—";
}

/**
 * «Por anuncio»: cuántos leads trajo cada anuncio y en qué quedaron, para saber cuál campaña rinde más. El nombre y los números
 * salen de los datos del lead; si es video o imagen y el enlace para verlo se piden a Meta al abrir la página.
 */
export default function TablaAnuncios({ metricas }: { metricas: Metricas }) {
  const { porAnuncio, kpis } = metricas;
  const [infos, setInfos] = useState<Record<string, InfoAnuncio | null>>({});

  const ids = useMemo(
    () =>
      porAnuncio
        .filter((a) => a.anuncioId)
        .slice(0, MAX_CONSULTAS)
        .map((a) => a.anuncioId as string),
    [porAnuncio],
  );

  useEffect(() => {
    let activo = true;
    async function cargar() {
      const resultados = await Promise.all(ids.map((id) => infoAnuncio(id).catch(() => null)));
      if (!activo) return;
      setInfos(Object.fromEntries(ids.map((id, i) => [id, resultados[i] ?? null])));
    }
    void cargar();
    return () => {
      activo = false;
    };
  }, [ids]);

  const conAnuncio = porAnuncio.filter((a) => a.anuncioId);
  const mejor: FilaAnuncio | undefined = conAnuncio[0];
  const hayMejor = Boolean(mejor && mejor.vendidas > 0);

  // Video contra imagen: solo con los anuncios que Meta dejó clasificar.
  const porTipo = useMemo(() => {
    const total = { video: { leads: 0, vendidas: 0, anuncios: 0 }, imagen: { leads: 0, vendidas: 0, anuncios: 0 } };
    for (const a of conAnuncio) {
      const tipo = a.anuncioId ? infos[a.anuncioId]?.tipo : null;
      if (!tipo) continue;
      total[tipo].leads += a.entradas;
      total[tipo].vendidas += a.vendidas;
      total[tipo].anuncios++;
    }
    return total;
  }, [conAnuncio, infos]);
  const hayTipos = porTipo.video.anuncios + porTipo.imagen.anuncios > 0;

  return (
    <Tarjeta
      titulo="Por anuncio"
      nota="Cuántas personas llegaron por cada anuncio en el periodo (cada formulario enviado o chat abierto desde el anuncio, aunque la persona ya tuviera un chat) y en qué quedaron hoy. Va de los que más venden a los que menos."
    >
      {porAnuncio.length === 0 ? (
        <SinDatos alto={120}>Sin conversaciones en este periodo.</SinDatos>
      ) : (
        <>
          {hayTipos && (
            <ul aria-label="Video contra imagen" className="mb-4 flex flex-wrap gap-2 text-[12.5px]">
              {(["imagen", "video"] as const).map((tipo) => (
                <li key={tipo} className="rounded-full border border-line bg-bg-soft px-3 py-1 text-ink-soft">
                  <span className="font-medium text-ink">{tipo === "video" ? "Video" : "Imagen"}</span>
                  {" · "}
                  <span className="t-mono tabular-nums">{porTipo[tipo].anuncios}</span> {porTipo[tipo].anuncios === 1 ? "anuncio" : "anuncios"}
                  {" · "}
                  <span className="t-mono tabular-nums">{porTipo[tipo].leads}</span> leads
                  {" · "}
                  <span className="t-mono tabular-nums">{porTipo[tipo].vendidas}</span> {porTipo[tipo].vendidas === 1 ? "vendida" : "vendidas"}
                </li>
              ))}
            </ul>
          )}

          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[820px] text-[13px]">
              <caption className="sr-only">Leads del periodo por anuncio</caption>
              <thead>
                <tr>
                  <Th>Anuncio</Th>
                  <Th derecha>Leads</Th>
                  <Th derecha>Parte</Th>
                  <Th derecha>Atendidos</Th>
                  <Th derecha>Oportunidad</Th>
                  <Th derecha>Vendidas</Th>
                  <Th derecha>No vendidas</Th>
                  <Th derecha>Conversión</Th>
                </tr>
              </thead>
              <tbody>
                {porAnuncio.map((a) => {
                  const info = a.anuncioId ? infos[a.anuncioId] : null;
                  const esMejor = hayMejor && a.anuncioId !== null && a === mejor;
                  const enlace = info?.enlace ?? info?.enlaceAdministrador ?? null;
                  const campana = info?.campana ?? a.campana;
                  return (
                    <tr key={a.anuncioId ?? "sin-anuncio"} className="transition-colors hover:bg-bg/60">
                      <Td className="!whitespace-normal">
                        <span className="flex flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className={`font-medium ${a.anuncioId ? "text-ink" : "text-muted"}`}>{info?.nombre ?? a.nombre}</span>
                            {info?.tipo && (
                              <span className="rounded-full bg-bg-soft px-2 py-px text-[10.5px] font-medium text-ink-soft">
                                {info.tipo === "video" ? "Video" : "Imagen"}
                              </span>
                            )}
                            {esMejor && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-signal/10 px-2 py-px text-[10.5px] font-semibold text-signal-ink">
                                <Trophy size={11} aria-hidden />
                                Más ventas
                              </span>
                            )}
                            {enlace && (
                              <a
                                href={enlace}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-deep hover:underline"
                              >
                                Ver
                                <ExternalLink size={11} aria-hidden />
                                <span className="sr-only">el anuncio {info?.nombre ?? a.nombre}</span>
                              </a>
                            )}
                          </span>
                          {campana && a.anuncioId && <span className="text-[11.5px] text-muted">{campana}</span>}
                        </span>
                      </Td>
                      <Td derecha>
                        <span className="t-mono font-semibold">{a.entradas}</span>
                      </Td>
                      <Td derecha>
                        <Medidor valor={a.entradas} total={kpis.entradas} />
                      </Td>
                      <Td derecha>{a.atendidas || <Cero />}</Td>
                      <Td derecha>{a.oportunidad || <Cero />}</Td>
                      <Td derecha>{a.vendidas ? <span className="font-semibold text-signal-ink">{a.vendidas}</span> : <Cero />}</Td>
                      <Td derecha>{a.noVendidas || <Cero />}</Td>
                      <Td derecha>
                        <span className="t-mono text-[12px] text-ink-soft">{porcentaje(a.vendidas, a.entradas)}</span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-muted">
            «Conversión» = vendidas entre leads. Con pocas ventas todavía, mira también «Oportunidad» y «Atendidos»: son los que más
            adelantan cuál anuncio trae gente que sí compra.
          </p>
          <p className="mt-1.5 text-[12px] text-muted">
            En los anuncios de WhatsApp, Meta cuenta también a quien abrió el chat y no escribió nada: esas personas no llegan al CRM
            hasta que escriben o el vendedor les escribe, así que Meta puede mostrar más.
          </p>
        </>
      )}
    </Tarjeta>
  );
}
