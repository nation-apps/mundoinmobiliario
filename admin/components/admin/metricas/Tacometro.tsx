import { duracionCorta } from "@/lib/admin/metricas";

/**
 * Tacómetro de la primera respuesta: la barra de cambios del tablero de una
 * moto de carreras. Cada segmento es un escalón de tiempo (no lineal, como un
 * tacómetro): se encienden hasta la mediana. Azul hasta la meta (5 min), ámbar
 * hasta media hora y zona roja después. Los apagados muestran el tono claro de
 * su zona, así se lee dónde está la línea roja aunque no se haya llegado.
 */

/** Tope de cada segmento, en minutos. */
const ESCALONES = [1, 2, 5, 10, 15, 30, 45, 60, 120, 240, 480, 1440];
/** Segmentos dentro de la meta (hasta 5 min) y del aviso (hasta 30 min). */
const FIN_META = 3;
const FIN_AVISO = 6;
export const META_RESPUESTA_MIN = 5;

const ZONAS = {
  meta: { encendido: "var(--accent)", apagado: "#dfe5fb" },
  aviso: { encendido: "var(--amber)", apagado: "#f8ead0" },
  roja: { encendido: "var(--redline)", apagado: "#f6dcdd" },
};

/** Marcas bajo la barra: [segmentos hasta la marca, texto]. */
const MARCAS: [number, string][] = [
  [1, "1m"],
  [3, "5m"],
  [6, "30m"],
  [8, "1h"],
  [10, "4h"],
  [12, "24h"],
];

function encendidos(minutos: number | null): number {
  if (minutos === null) return 0;
  return Math.min(ESCALONES.length, 1 + ESCALONES.slice(0, -1).filter((tope) => minutos > tope).length);
}

function zonaDe(i: number): keyof typeof ZONAS {
  return i < FIN_META ? "meta" : i < FIN_AVISO ? "aviso" : "roja";
}

export function textoTacometro(minutos: number | null): string {
  if (minutos === null) return "Sin respuestas de una persona todavía";
  const valor = duracionCorta(minutos);
  if (minutos <= META_RESPUESTA_MIN) return `${valor}, dentro de la meta de ${META_RESPUESTA_MIN} min`;
  if (minutos <= 30) return `${valor}, por encima de la meta de ${META_RESPUESTA_MIN} min`;
  return `${valor}, en zona roja (más de 30 min)`;
}

export default function Tacometro({ minutos, tamano = "grande" }: { minutos: number | null; tamano?: "grande" | "mini" }) {
  const n = encendidos(minutos);
  const grande = tamano === "grande";
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={ESCALONES.at(-1)}
      aria-valuenow={minutos === null ? undefined : Math.round(minutos)}
      aria-valuetext={textoTacometro(minutos)}
      aria-label="Primera respuesta de una persona"
      className={grande ? "w-full" : "inline-block"}
    >
      <div className={`flex items-end ${grande ? "gap-[5px]" : "gap-[2px]"}`} aria-hidden>
        {ESCALONES.map((_, i) => {
          const zona = ZONAS[zonaDe(i)];
          const prendido = i < n;
          return (
            <span
              key={i}
              className={`block origin-bottom -skew-x-[14deg] transition-colors duration-500 ${grande ? "flex-1 rounded-[2px]" : "w-[4px] rounded-[1px]"} ${
                i === FIN_META ? (grande ? "ml-2" : "ml-1") : ""
              }`}
              style={{
                height: grande ? 12 + i * 1.6 : 6 + i * 0.6,
                background: prendido ? zona.encendido : zona.apagado,
                transitionDelay: `${i * 35}ms`,
              }}
            />
          );
        })}
      </div>
      {grande && (
        <div className="relative mt-1.5 h-3.5" aria-hidden>
          {MARCAS.map(([hasta, texto]) => (
            <span
              key={texto}
              className={`t-mono absolute top-0 text-[9.5px] tabular-nums ${hasta === ESCALONES.length ? "" : "-translate-x-1/2"} ${
                hasta === FIN_META ? "font-semibold text-accent-deep" : "text-muted"
              }`}
              // Cada segmento ocupa 1/12 del ancho (más el respiro de la meta): la marca va en su borde derecho; la última, pegada al final.
              style={
                hasta === ESCALONES.length
                  ? { right: 0 }
                  : { left: `calc(${(hasta / ESCALONES.length) * 100}% ${hasta >= FIN_META ? "+ 2px" : "- 2px"})` }
              }
            >
              {texto}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
