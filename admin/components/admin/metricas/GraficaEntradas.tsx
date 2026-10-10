"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { SERIES, type Cubeta, type Metricas } from "@/lib/admin/metricas";
import { ConmutadorVista, SinDatos, Tarjeta, type Vista } from "./Tarjeta";

const ALTO_PLOT = 190;
const MARGEN = { izq: 30, der: 6, arriba: 10, abajo: 26 };
/** Barra: nunca más gruesa que 24 px; el resto de la franja es aire. */
const BARRA_MAX = 24;
/** Separación en el color de la superficie entre segmentos apilados. */
const HUECO = 2;

/** Tope del eje y paso de las marcas: números redondos, enteros (son conversaciones). */
function escala(max: number): { tope: number; paso: number } {
  if (max <= 4) return { tope: 4, paso: 1 };
  const bruto = max / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const paso = Math.max(1, Math.ceil([1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? 10 * potencia));
  return { tope: Math.ceil(max / paso) * paso, paso };
}

/** Rectángulo con las esquinas de arriba redondeadas (el extremo del dato) y la base recta. */
function rectoArriba(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h / 2, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // El observador avisa también al empezar a observar: no hace falta medir a mano.
    const observador = new ResizeObserver(([entrada]) => setAncho(Math.floor(entrada.contentRect.width)));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return [ref, ancho] as const;
}

function resumenCubeta(c: Cubeta): string {
  const partes = SERIES.filter((s) => c.valores[s.id] > 0).map((s) => `${c.valores[s.id]} ${s.label}`);
  return `${c.detalle}: ${c.total} ${c.total === 1 ? "entrada" : "entradas"}${partes.length ? ` (${partes.join(", ")})` : ""}`;
}

export default function GraficaEntradas({ metricas }: { metricas: Metricas }) {
  const [vista, setVista] = useState<Vista>("grafica");
  const { serie, totalesSerie, granularidad, kpis } = metricas;
  const unidad = granularidad === "hora" ? "hora" : granularidad === "semana" ? "semana" : "día";
  const seriesConDatos = SERIES.filter((s) => totalesSerie[s.id] > 0);

  return (
    <Tarjeta
      titulo={`Entradas por ${unidad}`}
      nota="Conversaciones nuevas, por canal de entrada."
      acciones={<ConmutadorVista vista={vista} onCambiar={setVista} nombre="las entradas" />}
    >
      {kpis.entradas === 0 ? (
        <SinDatos alto={ALTO_PLOT + MARGEN.abajo + 30}>Todavía no entró ninguna conversación en este periodo.</SinDatos>
      ) : vista === "tabla" ? (
        <TablaEntradas serie={serie} unidad={unidad} />
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Canales">
            {seriesConDatos.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
                {s.label}
                <span className="t-mono text-[11px] font-semibold tabular-nums text-ink">{totalesSerie[s.id]}</span>
              </li>
            ))}
          </ul>
          <Columnas serie={serie} unidad={unidad} />
        </>
      )}
    </Tarjeta>
  );
}

function Columnas({ serie, unidad }: { serie: Cubeta[]; unidad: string }) {
  const [ref, ancho] = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const [porTeclado, setPorTeclado] = useState(false);

  const { tope, paso } = useMemo(() => escala(Math.max(0, ...serie.map((c) => c.total))), [serie]);
  const anchoPlot = Math.max(0, ancho - MARGEN.izq - MARGEN.der);
  const franja = serie.length ? anchoPlot / serie.length : 0;
  const barra = Math.max(3, Math.min(BARRA_MAX, franja * 0.62));
  const y = (v: number) => MARGEN.arriba + ALTO_PLOT - (v / tope) * ALTO_PLOT;
  const marcas = Array.from({ length: Math.floor(tope / paso) + 1 }, (_, i) => i * paso);
  // Etiquetas del eje X sin chocar: una cada `cada` franjas.
  const cada = Math.max(1, Math.ceil(46 / Math.max(1, franja)));
  const ultimaReal = serie.reduce((ult, c, i) => (c.futura ? ult : i), 0);

  function tecla(e: KeyboardEvent<HTMLDivElement>) {
    const mover = (i: number) => {
      e.preventDefault();
      setPorTeclado(true);
      setActivo(Math.max(0, Math.min(serie.length - 1, i)));
    };
    if (e.key === "ArrowRight") mover((activo ?? ultimaReal) + (activo === null ? 0 : 1));
    else if (e.key === "ArrowLeft") mover((activo ?? ultimaReal) - (activo === null ? 0 : 1));
    else if (e.key === "Home") mover(0);
    else if (e.key === "End") mover(ultimaReal);
    else if (e.key === "Escape") setActivo(null);
  }

  const cubetaActiva = activo !== null ? serie[activo] : null;
  const centro = (i: number) => MARGEN.izq + franja * i + franja / 2;
  const ANCHO_TIP = 220;
  const tipIzq = activo === null ? 0 : Math.max(0, Math.min(ancho - ANCHO_TIP, centro(activo) - ANCHO_TIP / 2));

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={`Entradas por ${unidad}. Usa las flechas izquierda y derecha para recorrerlas.`}
      onKeyDown={tecla}
      onBlur={() => porTeclado && setActivo(null)}
      onPointerLeave={() => !porTeclado && setActivo(null)}
      className="relative -mx-1 rounded-lg px-1 outline-offset-4"
      style={{ height: MARGEN.arriba + ALTO_PLOT + MARGEN.abajo }}
    >
      {ancho > 0 && (
        <svg width={ancho} height={MARGEN.arriba + ALTO_PLOT + MARGEN.abajo} aria-hidden className="block overflow-visible">
          {/* Guías: hilos sólidos, un tono sobre la superficie */}
          {marcas.map((m) => (
            <g key={m}>
              <line x1={MARGEN.izq} x2={ancho - MARGEN.der} y1={y(m)} y2={y(m)} stroke={m === 0 ? "#c2cad6" : "#e6eaf0"} strokeWidth={1} />
              <text x={MARGEN.izq - 8} y={y(m)} dy="0.32em" textAnchor="end" className="fill-muted font-mono text-[10px] tabular-nums">
                {m}
              </text>
            </g>
          ))}

          {serie.map((c, i) => {
            const x = centro(i) - barra / 2;
            let base = y(0);
            const visibles = SERIES.filter((s) => c.valores[s.id] > 0);
            return (
              <g key={c.clave}>
                {activo === i && (
                  <rect x={MARGEN.izq + franja * i} y={MARGEN.arriba} width={franja} height={ALTO_PLOT} rx={4} fill="rgba(43,80,236,0.06)" />
                )}
                {visibles.map((s, j) => {
                  const alto = (c.valores[s.id] / tope) * ALTO_PLOT;
                  const arriba = base - alto;
                  // El hueco se descuenta de cada segmento salvo el de abajo, que nace de la base.
                  const altoVisible = Math.max(1, alto - (j > 0 ? HUECO : 0));
                  const forma =
                    j === visibles.length - 1 ? (
                      <path key={s.id} d={rectoArriba(x, arriba, barra, altoVisible)} fill={s.color} />
                    ) : (
                      <rect key={s.id} x={x} y={arriba} width={barra} height={altoVisible} fill={s.color} />
                    );
                  base = arriba;
                  return forma;
                })}
                {(i === ultimaReal || (i % cada === 0 && Math.abs(i - ultimaReal) >= cada)) && (
                  <text
                    x={centro(i)}
                    y={MARGEN.arriba + ALTO_PLOT + 17}
                    textAnchor="middle"
                    className={`font-mono text-[10px] ${c.futura ? "fill-line-strong" : i === activo ? "fill-ink" : "fill-muted"}`}
                  >
                    {c.etiqueta}
                  </text>
                )}
                {/* Zona de puntero: toda la franja, más grande que la barra */}
                <rect
                  x={MARGEN.izq + franja * i}
                  y={0}
                  width={franja}
                  height={MARGEN.arriba + ALTO_PLOT + MARGEN.abajo}
                  fill="transparent"
                  onPointerEnter={() => {
                    setPorTeclado(false);
                    setActivo(i);
                  }}
                  onPointerDown={() => {
                    setPorTeclado(false);
                    setActivo(i);
                  }}
                />
              </g>
            );
          })}
        </svg>
      )}

      {cubetaActiva && (
        <div
          role="presentation"
          className="pointer-events-none absolute top-0 z-10 rounded-xl border border-line bg-porcelain px-3 py-2.5 shadow-[0_12px_28px_-10px_rgba(10,15,26,0.3)]"
          style={{ left: tipIzq, width: ANCHO_TIP }}
        >
          <p className="text-[11.5px] font-medium capitalize text-ink-soft">{cubetaActiva.detalle}</p>
          {cubetaActiva.futura ? (
            <p className="mt-1 text-[12px] text-muted">Todavía no llega esta hora.</p>
          ) : (
            <>
              <ul className="mt-1.5 flex flex-col gap-1">
                {SERIES.filter((s) => cubetaActiva.valores[s.id] > 0).map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-[12px]">
                    <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                    <span className="t-mono w-6 text-right font-semibold tabular-nums text-ink">{cubetaActiva.valores[s.id]}</span>
                    <span className="truncate text-ink-soft">{s.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 flex items-baseline justify-between border-t border-line pt-1.5 text-[12px] text-ink-soft">
                Total
                <span className="t-mono font-semibold tabular-nums text-ink">{cubetaActiva.total}</span>
              </p>
            </>
          )}
        </div>
      )}
      {/* Lo mismo que el recuadro, para lectores de pantalla al moverse con el teclado */}
      <p className="sr-only" aria-live="polite">
        {porTeclado && cubetaActiva ? resumenCubeta(cubetaActiva) : ""}
      </p>
    </div>
  );
}

function TablaEntradas({ serie, unidad }: { serie: Cubeta[]; unidad: string }) {
  const filas = serie.filter((c) => !c.futura);
  const columnas = SERIES.filter((s) => filas.some((c) => c.valores[s.id] > 0));
  return (
    <div className="max-h-[300px] overflow-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Entradas por {unidad} y canal</caption>
        <thead className="sticky top-0 bg-[#f7f9fb]">
          <tr>
            <th scope="col" className="t-mono px-3 py-2 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
              {unidad}
            </th>
            {columnas.map((s) => (
              <th key={s.id} scope="col" className="t-mono px-3 py-2 text-right text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                {s.label}
              </th>
            ))}
            <th scope="col" className="t-mono px-3 py-2 text-right text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((c) => (
            <tr key={c.clave} className="border-t border-line">
              <th scope="row" className="px-3 py-1.5 font-normal capitalize text-ink-soft">
                {c.detalle}
              </th>
              {columnas.map((s) => (
                <td key={s.id} className="px-3 py-1.5 text-right tabular-nums">
                  {c.valores[s.id] || <span className="text-line-strong">0</span>}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{c.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
