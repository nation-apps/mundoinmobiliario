"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import DialogShell from "@/components/admin/DialogShell";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  COLUMNAS_AGENDA,
  TIPOS_AGENDA,
  TIPO_AGENDA_LABEL,
  aInputLocal,
  deInputLocal,
  diaCancun,
  type EstadoAgenda,
  type EventoAgenda,
  type TipoAgenda,
} from "@/lib/admin/agenda";
import type { StaffMiembro } from "@/lib/admin/chats-tipos";

export type InicialEvento = {
  tipo?: TipoAgenda;
  titulo?: string;
  cliente_id?: string | null;
  conversacion_id?: string | null;
  asignada_a?: string | null;
  /** Fecha y hora con las que abre el formulario («2026-10-25T10:00», hora de Cancún). */
  fecha?: string;
  /** Solo para mostrarlo: de quién es el evento. */
  clienteNombre?: string | null;
};

type Props = {
  abierto: boolean;
  onCerrar: () => void;
  /** Si viene, se edita ese evento; si no, se crea uno nuevo con `inicial`. */
  evento?: EventoAgenda | null;
  inicial?: InicialEvento;
  staff: StaffMiembro[];
  usuarioId: string;
  onGuardado: (evento: EventoAgenda) => void;
  onEliminado?: (id: string) => void;
};

const ESTADOS: { id: EstadoAgenda; label: string }[] = [
  { id: "pendiente", label: "Pendiente" },
  { id: "hecho", label: "Hecho" },
  { id: "cancelado", label: "Cancelado" },
];

/** Mañana a las 10:00 (hora de Cancún): una fecha razonable para empezar a escribir. */
function fechaInicial(tipo: TipoAgenda): string {
  const dias = tipo === "apartado" ? 3 : 1;
  const dia = diaCancun(Date.now() + dias * 86_400_000);
  return `${dia}T10:00`;
}

function tituloSugerido(tipo: TipoAgenda, cliente: string | null | undefined): string {
  const base = tipo === "apartado" ? "Apartar moto" : tipo === "visita" ? "Visita a la sucursal" : tipo === "llamada" ? "Llamar" : "";
  return base && cliente ? `${base} · ${cliente}` : base;
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-[13px] font-medium transition-colors lg:min-h-0 lg:py-1.5 ${
        activo ? "border-ink bg-ink text-white" : "border-line bg-porcelain text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/** Crear o editar un evento de la agenda. Se monta al abrirse: así el formulario siempre empieza con los datos que toca. */
export default function EventoDialogo(props: Props) {
  if (!props.abierto) return null;
  return <Formulario key={props.evento?.id ?? "nuevo"} {...props} />;
}

function Formulario({ onCerrar, evento, inicial, staff, usuarioId, onGuardado, onEliminado }: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const editando = Boolean(evento);
  const tipoInicial: TipoAgenda = evento?.tipo ?? inicial?.tipo ?? "visita";

  const [tipo, setTipo] = useState<TipoAgenda>(tipoInicial);
  const [titulo, setTitulo] = useState(evento?.titulo ?? inicial?.titulo ?? tituloSugerido(tipoInicial, inicial?.clienteNombre));
  const [tituloTocado, setTituloTocado] = useState(Boolean(evento) || Boolean(inicial?.titulo));
  const [fecha, setFecha] = useState(evento ? aInputLocal(evento.fecha_hora) : (inicial?.fecha ?? fechaInicial(tipoInicial)));
  const [notas, setNotas] = useState(evento?.notas ?? "");
  const [asignada, setAsignada] = useState(evento ? (evento.asignada_a ?? "") : (inicial?.asignada_a ?? usuarioId));
  const [estado, setEstado] = useState<EstadoAgenda>(evento?.estado ?? "pendiente");
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  function elegirTipo(nuevo: TipoAgenda) {
    setTipo(nuevo);
    // Mientras el título sea el sugerido, sigue al tipo; si la persona lo escribió, no se toca.
    if (!tituloTocado) setTitulo(tituloSugerido(nuevo, inicial?.clienteNombre));
  }

  async function guardar() {
    const instante = deInputLocal(fecha);
    if (!titulo.trim()) {
      toast.error("Ponle un título al evento.");
      return;
    }
    if (!instante) {
      toast.error("Elige la fecha y la hora.");
      return;
    }
    setGuardando(true);
    const datos = {
      tipo,
      titulo: titulo.trim(),
      notas: notas.trim() || null,
      fecha_hora: instante,
      estado,
      asignada_a: asignada || null,
    };
    if (evento) {
      // RLS no lanza error al negar un cambio: si no devuelve filas, no se guardó.
      const { data, error } = await supabase.from("agenda").update(datos).eq("id", evento.id).select(COLUMNAS_AGENDA);
      setGuardando(false);
      if (error || !data?.length) {
        toast.error("No se pudo guardar el cambio.");
        return;
      }
      onGuardado(data[0] as EventoAgenda);
    } else {
      const { data, error } = await supabase
        .from("agenda")
        .insert({
          ...datos,
          cliente_id: inicial?.cliente_id ?? null,
          conversacion_id: inicial?.conversacion_id ?? null,
          creado_por: usuarioId,
        })
        .select(COLUMNAS_AGENDA)
        .single();
      setGuardando(false);
      if (error || !data) {
        toast.error("No se pudo agendar. ¿Ya corriste la migración 0011 en Supabase?");
        return;
      }
      toast.success("Agendado");
      onGuardado(data as EventoAgenda);
    }
    onCerrar();
  }

  async function borrar() {
    if (!evento) return;
    if (!confirmarBorrar) {
      setConfirmarBorrar(true);
      return;
    }
    setGuardando(true);
    const { data, error } = await supabase.from("agenda").delete().eq("id", evento.id).select("id");
    setGuardando(false);
    if (error || !data?.length) {
      toast.error("No se pudo eliminar.");
      return;
    }
    toast.success("Evento eliminado");
    onEliminado?.(evento.id);
    onCerrar();
  }

  return (
    <DialogShell
      abierto
      onCerrar={onCerrar}
      titulo={editando ? "Editar evento" : "Agendar"}
      descripcion={
        inicial?.clienteNombre || evento
          ? "Se avisa 3 días antes, 1 día antes y el mismo día."
          : "Una fecha para no olvidarlo. Se avisa 3 días antes, 1 día antes y el mismo día."
      }
      ancho="520px"
      pie={
        <>
          {editando && (
            <button type="button" onClick={() => void borrar()} disabled={guardando} className="admin-btn ghost mr-auto min-h-11 text-redline">
              {confirmarBorrar ? "Sí, eliminar" : "Eliminar"}
            </button>
          )}
          <button type="button" onClick={onCerrar} className="admin-btn ghost min-h-11">
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={guardando} className="admin-btn min-h-11">
            {guardando ? "Guardando…" : editando ? "Guardar" : "Agendar"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {inicial?.clienteNombre && (
          <p className="text-[13px] text-ink-soft">
            Cliente: <strong className="text-ink">{inicial.clienteNombre}</strong>
          </p>
        )}

        <div>
          <span className="admin-label">Qué es</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de evento">
            {TIPOS_AGENDA.map((t) => (
              <Chip key={t} activo={tipo === t} onClick={() => elegirTipo(t)}>
                {TIPO_AGENDA_LABEL[t]}
              </Chip>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="admin-label">Título</span>
          <input
            value={titulo}
            onChange={(e) => {
              setTitulo(e.target.value);
              setTituloTocado(true);
            }}
            maxLength={120}
            className="admin-input"
            placeholder="Ej. Apartar la RTR 310 de Marcos"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="admin-label">Fecha y hora (Cancún)</span>
            <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="admin-input" />
          </label>
          <label className="block">
            <span className="admin-label">Le toca a</span>
            <select value={asignada} onChange={(e) => setAsignada(e.target.value)} className="admin-input">
              <option value="">Todo el equipo</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.user_id === usuarioId ? `Yo (${s.nombre})` : s.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {editando && (
          <div>
            <span className="admin-label">Estado</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estado del evento">
              {ESTADOS.map((e) => (
                <Chip key={e.id} activo={estado === e.id} onClick={() => setEstado(e.id)}>
                  {e.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <span className="admin-label">Notas (opcional)</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            maxLength={600}
            className="admin-input"
            placeholder="Color, enganche acordado, lo que hay que llevar…"
          />
        </label>
      </div>
    </DialogShell>
  );
}
