"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { infoAnuncio } from "@/lib/admin/bot-api";
import { CHAT_QUERY_PARAM, ETAPA_LABEL, telefonoBonito } from "@/lib/admin/chats-tipos";
import { COMO_LLEGO, type ComoLlego, type Llegada } from "@/lib/admin/llegadas";
import type { Metricas } from "@/lib/admin/metricas";
import { ZONA_NEGOCIO } from "@/lib/admin/rango";
import { Td, Th } from "./Tablas";
import { SinDatos, Tarjeta } from "./Tarjeta";

const VISIBLES = 50;
/** Cuántos anuncios se le preguntan a Meta por su nombre (los de clic a WhatsApp traen el título del mensaje, no el del anuncio). */
const MAX_CONSULTAS = 20;

const TONO: Record<ComoLlego, string> = {
  anuncio_whatsapp: "bg-accent-soft text-accent-deep",
  formulario: "bg-accent-soft text-accent-deep",
  formulario_otro_numero: "bg-[rgba(242,165,22,0.16)] text-amber-ink",
  vendedor_primero: "bg-bg-soft text-ink-soft",
  directo: "bg-bg-soft text-ink-soft",
};

const ETIQUETA_COMO = Object.fromEntries(COMO_LLEGO.map((c) => [c.id, c.label])) as Record<ComoLlego, string>;

function cuando(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", { timeZone: ZONA_NEGOCIO, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * «Llegadas por anuncio»: una fila por persona que llegó en el periodo, con cómo llegó, para compararla una por una con Meta. Se
 * filtra por cómo llegó y por anuncio, y se copia como tabla para pegarla en una hoja de cálculo.
 */
export default function TablaLlegadas({ metricas }: { metricas: Metricas }) {
  const crudas = useMemo(() => metricas.llegadas ?? [], [metricas.llegadas]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const ids = useMemo(() => [...new Set(crudas.map((l) => l.anuncioId).filter((x): x is string => Boolean(x)))].slice(0, MAX_CONSULTAS), [crudas]);
  useEffect(() => {
    let activo = true;
    void Promise.all(ids.map((id) => infoAnuncio(id).catch(() => null))).then((infos) => {
      if (!activo) return;
      const m: Record<string, string> = {};
      infos.forEach((info, i) => {
        if (info?.nombre) m[ids[i]!] = info.nombre;
      });
      setNombres(m);
    });
    return () => {
      activo = false;
    };
  }, [ids]);
  // El nombre del anuncio en Meta cuando se conoce; si no, el que trajo el mensaje.
  const llegadas = useMemo(() => crudas.map((l) => (l.anuncioId && nombres[l.anuncioId] ? { ...l, anuncioNombre: nombres[l.anuncioId] } : l)), [crudas, nombres]);
  const [como, setComo] = useState<ComoLlego | "todas">("todas");
  const [anuncio, setAnuncio] = useState("");
  const [todas, setTodas] = useState(false);

  const conteo = useMemo(() => {
    const c = Object.fromEntries(COMO_LLEGO.map((x) => [x.id, 0])) as Record<ComoLlego, number>;
    for (const l of llegadas) c[l.como]++;
    return c;
  }, [llegadas]);

  const anuncios = useMemo(() => {
    const m = new Map<string, { nombre: string; n: number }>();
    for (const l of llegadas) {
      if (!l.anuncioNombre && !l.anuncioId) continue;
      const clave = l.anuncioId ?? l.anuncioNombre ?? "";
      const g = m.get(clave) ?? { nombre: l.anuncioNombre ?? `Anuncio ${l.anuncioId}`, n: 0 };
      g.n++;
      m.set(clave, g);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [llegadas]);

  const filtradas = useMemo(
    () =>
      llegadas.filter(
        (l) =>
          (como === "todas" || l.como === como) &&
          (!anuncio || (anuncio === "_sin" ? !l.anuncioId && !l.anuncioNombre : (l.anuncioId ?? l.anuncioNombre) === anuncio)),
      ),
    [llegadas, como, anuncio],
  );
  const visibles = todas ? filtradas : filtradas.slice(0, VISIBLES);

  async function copiar() {
    const filas = [
      ["Fecha", "Nombre", "Teléfono", "Teléfono del formulario", "Anuncio", "Cómo llegó", "Vendedor", "Etapa"],
      ...filtradas.map((l) => [
        cuando(l.at),
        l.nombre ?? "",
        l.telefono ? telefonoBonito(l.telefono) : "",
        l.telefonoFormulario ? telefonoBonito(l.telefonoFormulario) : "",
        l.anuncioNombre ?? (l.anuncioId ? `Anuncio ${l.anuncioId}` : "Sin anuncio"),
        ETIQUETA_COMO[l.como],
        l.vendedor ?? "",
        l.etapa ? ETAPA_LABEL[l.etapa] : "",
      ]),
    ];
    const texto = filas.map((f) => f.join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${filtradas.length} filas copiadas: pégalas en una hoja de cálculo`);
    } catch {
      toast.error("El navegador no dejó copiar. Inténtalo otra vez.");
    }
  }

  return (
    <Tarjeta
      titulo="Llegadas por anuncio"
      nota="Una fila por persona que llegó en el periodo y cómo llegó, para compararla una por una con Meta. Cuando el vendedor escribe primero, la persona no había escrito y no se sabe de qué anuncio vino."
      acciones={
        filtradas.length > 0 ? (
          <button type="button" onClick={() => void copiar()} className="admin-btn ghost inline-flex items-center gap-1.5 text-[13px]">
            <Copy size={14} aria-hidden />
            Copiar tabla
          </button>
        ) : undefined
      }
    >
      {llegadas.length === 0 ? (
        <SinDatos alto={120}>Nadie llegó en este periodo.</SinDatos>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por cómo llegó">
            <Filtro activo={como === "todas"} onClick={() => setComo("todas")} n={llegadas.length}>
              Todas
            </Filtro>
            {COMO_LLEGO.filter((c) => conteo[c.id] > 0).map((c) => (
              <Filtro key={c.id} activo={como === c.id} onClick={() => setComo(c.id)} n={conteo[c.id]} titulo={c.ayuda}>
                {c.label}
              </Filtro>
            ))}
            <label className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">
              Anuncio
              <select id="llegadas-anuncio" value={anuncio} onChange={(e) => setAnuncio(e.target.value)} className="admin-input h-9 !w-auto !py-0 text-[13px]">
                <option value="">Todos</option>
                {anuncios.map(([clave, a]) => (
                  <option key={clave} value={clave}>
                    {a.nombre} ({a.n})
                  </option>
                ))}
                <option value="_sin">Sin anuncio</option>
              </select>
            </label>
          </div>

          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Persona</Th>
                  <Th>Anuncio</Th>
                  <Th>Cómo llegó</Th>
                  <Th>Vendedor</Th>
                  <Th>Etapa</Th>
                  <Th>
                    <span className="sr-only">Abrir</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((l, i) => (
                  <Fila key={`${l.conversacionId}-${l.como}-${l.anuncioId ?? i}`} llegada={l} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-muted">
            {filtradas.length > VISIBLES && (
              <button type="button" onClick={() => setTodas((t) => !t)} className="font-medium text-accent-deep hover:underline">
                {todas ? "Ver menos" : `Ver las ${filtradas.length}`}
              </button>
            )}
            <span>
              Para no contar los números con los que prueba el equipo, ponles la etiqueta «Prueba» en su ficha.
              {metricas.pruebasExcluidas ? ` En este periodo no se cuentan ${metricas.pruebasExcluidas} de prueba.` : ""}
            </span>
          </div>
        </>
      )}
    </Tarjeta>
  );
}

function Filtro({ activo, onClick, n, titulo, children }: { activo: boolean; onClick: () => void; n: number; titulo?: string; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      title={titulo}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors max-lg:min-h-11 ${
        activo ? "border-ink bg-ink text-white" : "border-line bg-porcelain text-ink-soft hover:border-line-strong"
      }`}
    >
      {children}
      <span className={`t-mono tabular-nums ${activo ? "text-white/80" : "text-muted"}`}>{n}</span>
    </button>
  );
}

function Fila({ llegada: l }: { llegada: Llegada }) {
  return (
    <tr>
      <Td className="t-mono text-[12px] text-ink-soft">{cuando(l.at)}</Td>
      <Td>
        <span className="block max-w-[200px] truncate font-medium text-ink">{l.nombre ?? "Sin nombre"}</span>
        <span className="t-mono block text-[11px] text-muted">{l.telefono ? telefonoBonito(l.telefono) : "—"}</span>
        {l.telefonoFormulario && (
          <span className="t-mono block text-[11px] text-amber-ink">Formulario: {telefonoBonito(l.telefonoFormulario)}</span>
        )}
      </Td>
      <Td>
        <span className="block max-w-[220px] truncate">{l.anuncioNombre ?? (l.anuncioId ? `Anuncio ${l.anuncioId}` : <span className="text-muted">Sin anuncio</span>)}</span>
      </Td>
      <Td>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONO[l.como]}`}>{ETIQUETA_COMO[l.como]}</span>
      </Td>
      <Td className="text-ink-soft">{l.vendedor ?? <span className="text-muted">Sin asignar</span>}</Td>
      <Td className="text-ink-soft">{l.etapa ? ETAPA_LABEL[l.etapa] : "—"}</Td>
      <Td>
        <Link href={`/admin/chats?${CHAT_QUERY_PARAM}=${l.conversacionId}`} className="text-[12.5px] font-medium text-accent-deep hover:underline">
          Abrir
        </Link>
      </Td>
    </tr>
  );
}
