"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/lib/supabase/client";
import CanalIcono from "@/components/admin/chats/CanalIcono";
import { LINEAS_WHATSAPP } from "@/lib/admin/chats-tipos";
import {
  LARGO_MAXIMO,
  MARCADORES,
  PLANTILLA_DIRECTO,
  PLANTILLA_FORMULARIO,
  SALUDO_AUTOMATICO_EJEMPLO,
  conPlantillas,
  vistaPrevia,
  type ConfigBienvenida,
} from "@/lib/admin/bienvenida";

const MARCA_DE_LINEA: Record<string, string> = { tvs: "TVS Motor Cancún", mundo: "Mundo de Motos" };

function vacia(linea: string): ConfigBienvenida {
  return { linea, formulario_activo: false, formulario_texto: null, directo_activo: false, directo_texto: null };
}

function Interruptor({ activo, onCambiar, etiqueta }: { activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambiar(!activo)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${activo ? "bg-accent" : "bg-line-strong"}`}
    >
      <span aria-hidden className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${activo ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/**
 * Los mensajes de bienvenida del WhatsApp de cada línea. Dos por línea: el saludo a quien se registra por un formulario de campaña y
 * la bienvenida a quien escribe por primera vez. Cada uno con su interruptor (apagados por defecto); el texto reemplaza al que arma el
 * bot. Lo cambian la administración y las asistentes.
 */
export default function Bienvenida({ inicial }: { inicial: ConfigBienvenida[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {LINEAS_WHATSAPP.map((l) => (
        <TarjetaLinea key={l.id} linea={l.id} etiqueta={l.etiqueta} inicial={inicial.find((c) => c.linea === l.id) ?? vacia(l.id)} />
      ))}
    </div>
  );
}

function TarjetaLinea({ linea, etiqueta, inicial }: { linea: string; etiqueta: string; inicial: ConfigBienvenida }) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  // Sin texto propio se muestra la plantilla (editable): así nadie tiene que adivinar qué se va a mandar.
  const [config, setConfig] = useState<ConfigBienvenida>(() => conPlantillas(inicial));
  const [guardado, setGuardado] = useState<ConfigBienvenida>(() => conPlantillas(inicial));
  const [guardando, setGuardando] = useState(false);
  const cambios = JSON.stringify(config) !== JSON.stringify(guardado);

  async function guardar() {
    setGuardando(true);
    const fila = {
      linea,
      formulario_activo: config.formulario_activo,
      formulario_texto: config.formulario_texto?.trim() || null,
      directo_activo: config.directo_activo,
      directo_texto: config.directo_texto?.trim() || null,
    };
    // RLS no lanza error al negar el cambio: si no devuelve filas, no se guardó.
    const { data, error } = await supabase.from("mensajes_bienvenida").upsert(fila, { onConflict: "linea" }).select("linea");
    setGuardando(false);
    if (error || !data?.length) {
      toast.error("No se pudo guardar. ¿Ya corriste la migración 0013 en Supabase?");
      return;
    }
    setGuardado({ ...config, ...fila });
    setConfig((c) => ({ ...c, ...fila }));
    toast.success(`Bienvenida de ${etiqueta} guardada`);
  }

  return (
    <section className="admin-card flex flex-col gap-5 p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="t-display flex items-center gap-2.5 text-xl leading-none">
          <CanalIcono canal="whatsapp" size={22} />
          {etiqueta}
        </h2>
        <button type="button" onClick={() => void guardar()} disabled={!cambios || guardando} className="admin-btn">
          {guardando ? "Guardando…" : cambios ? "Guardar" : "Guardado"}
        </button>
      </header>

      <Bloque
        titulo="Registro por formulario de campaña"
        descripcion="Se le manda a quien llena un formulario de anuncios y deja su teléfono, y no toca el botón de WhatsApp, desde este número. Es una plantilla: edítala como quieras y usa las variables para que cada mensaje lleve sus datos."
        activo={config.formulario_activo}
        texto={config.formulario_texto ?? ""}
        marca={MARCA_DE_LINEA[linea] ?? etiqueta}
        esFormulario
        plantilla={PLANTILLA_FORMULARIO}
        ejemploVacio={SALUDO_AUTOMATICO_EJEMPLO}
        onActivo={(v) => setConfig((c) => ({ ...c, formulario_activo: v }))}
        onTexto={(t) => setConfig((c) => ({ ...c, formulario_texto: t }))}
      />

      <Bloque
        titulo="Mensaje directo por WhatsApp"
        descripcion="Se le manda a quien escribe por primera vez a este número (campaña de clic a WhatsApp o mensaje directo), unos segundos después, si el chat empieza atendido por una persona. Una sola vez por chat."
        activo={config.directo_activo}
        texto={config.directo_texto ?? ""}
        marca={MARCA_DE_LINEA[linea] ?? etiqueta}
        esFormulario={false}
        plantilla={PLANTILLA_DIRECTO}
        onActivo={(v) => setConfig((c) => ({ ...c, directo_activo: v }))}
        onTexto={(t) => setConfig((c) => ({ ...c, directo_texto: t }))}
      />
    </section>
  );
}

function Bloque({
  titulo,
  descripcion,
  activo,
  texto,
  marca,
  esFormulario,
  plantilla,
  ejemploVacio,
  onActivo,
  onTexto,
}: {
  titulo: string;
  descripcion: string;
  activo: boolean;
  texto: string;
  marca: string;
  esFormulario: boolean;
  plantilla: string;
  ejemploVacio?: string;
  onActivo: (v: boolean) => void;
  onTexto: (t: string) => void;
}) {
  const campo = useRef<HTMLTextAreaElement>(null);
  const marcadores = MARCADORES.filter((m) => esFormulario || !m.soloFormulario);

  function insertar(marcador: string) {
    const el = campo.current;
    if (!el) {
      onTexto(`${texto}${marcador}`);
      return;
    }
    const desde = el.selectionStart ?? texto.length;
    const hasta = el.selectionEnd ?? texto.length;
    onTexto(`${texto.slice(0, desde)}${marcador}${texto.slice(hasta)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(desde + marcador.length, desde + marcador.length);
    });
  }

  const hayTexto = texto.trim() !== "";
  const previa = hayTexto ? vistaPrevia(texto, marca, esFormulario) : esFormulario ? (ejemploVacio ?? "") : "";

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-ink">{titulo}</h3>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">{descripcion}</p>
        </div>
        <Interruptor activo={activo} onCambiar={onActivo} etiqueta={`${titulo}: ${activo ? "encendido" : "apagado"}`} />
      </div>

      <div className={activo ? "" : "opacity-60"}>
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          maxLength={LARGO_MAXIMO}
          rows={5}
          aria-label={`Texto de ${titulo}`}
          placeholder="Escribe el mensaje de bienvenida…"
          className="admin-input !h-auto w-full"
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] text-muted">Insertar:</span>
          {marcadores.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.ayuda}
              onClick={() => insertar(m.id)}
              className="t-mono rounded-full border border-line bg-bg-soft px-2 py-0.5 text-[11px] text-ink-soft hover:border-line-strong hover:text-ink"
            >
              {m.id}
            </button>
          ))}
          {texto !== plantilla && (
            <button type="button" onClick={() => onTexto(plantilla)} className="text-[11.5px] font-medium text-accent-deep hover:underline">
              Restablecer plantilla
            </button>
          )}
          <span className="t-mono ml-auto text-[11px] text-muted tabular-nums">
            {texto.length}/{LARGO_MAXIMO}
          </span>
        </div>
      </div>

      {previa && (
        <div className="rounded-xl bg-bg-soft px-3.5 py-3">
          <p className="t-mono mb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-muted">Así lo recibe (con datos de ejemplo)</p>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{previa}</p>
        </div>
      )}
    </div>
  );
}
