"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Tag, X } from "lucide-react";
import DialogShell from "@/components/admin/DialogShell";
import { fechaLima } from "@/components/admin/clientes/formato";
import { BotApiError, guardarTelefonoContacto } from "@/lib/admin/bot-api";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  CANAL_LABEL,
  COLORES_ETIQUETA,
  ESTADOS_CONVERSACION,
  ESTADO_CONVERSACION_LABEL,
  ETAPAS,
  ETAPA_LABEL,
  HILO_LEAD_ADS,
  INTERESES,
  INTERES_LABEL,
  MOTIVOS_CIERRE,
  MOTIVO_CIERRE_LABEL,
  TIPOS_CLIENTE,
  TIPO_CLIENTE_LABEL,
  describirIdentidad,
  normalizarTelefonoMx,
  primerNombre,
  telefonoBonito,
  tiempoRelativo,
  type ClienteFicha,
  type ClienteIdentidad,
  type ClientPanelProps,
  type ClienteTipo,
  type EstadoConversacion,
  type Etapa,
  type Etiqueta,
  type EtiquetaColor,
  type EventoConversacion,
  type Interes,
  type PerfilCompra,
  type MotivoCierre,
  type StaffMiembro,
} from "@/lib/admin/chats-tipos";
import CanalIcono from "./CanalIcono";
import { ETIQUETA_TONO } from "./ListaConversaciones";

/* ---------- Vocabulario local ---------- */

const COLUMNAS_CLIENTE = "id, telefono, nombre, email, notas, perfil, canal_origen, tipo, interes, created_at";
const COLUMNAS_ETIQUETA = "id, nombre, color";

/** Lo que el staff puede corregir de la ficha sin salir del chat. */
type DatosEditables = {
  nombre: string;
  email: string;
  tipo: ClienteTipo;
  interes: Interes | null;
  notas: string;
};

/** `actual` es lo que se ve en los campos; `guardado`, lo último que hay en la base. */
type Formulario = { actual: DatosEditables; guardado: DatosEditables };

/** Campos de la conversación que se cambian desde "Seguimiento". */
type PatchSeguimiento = {
  estado?: EstadoConversacion;
  etapa?: Etapa;
  asignada_a?: string | null;
  motivo_cierre?: MotivoCierre | null;
};

function datosDe(cliente: ClienteFicha): DatosEditables {
  return {
    nombre: cliente.nombre ?? "",
    email: cliente.email ?? "",
    tipo: cliente.tipo,
    interes: cliente.interes,
    notas: cliente.notas ?? "",
  };
}

function hayCambios(form: Formulario): boolean {
  return JSON.stringify(form.actual) !== JSON.stringify(form.guardado);
}

const CAMPOS_EDITABLES = ["nombre", "email", "tipo", "interes", "notas"] as const satisfies readonly (keyof DatosEditables)[];

function copiarCampo<K extends keyof DatosEditables>(destino: DatosEditables, origen: DatosEditables, campo: K) {
  destino[campo] = origen[campo];
}

/** Campos que el staff cambió respecto de lo último que se leyó de la base. */
function camposTocados(form: Formulario): (keyof DatosEditables)[] {
  return CAMPOS_EDITABLES.filter((campo) => form.actual[campo] !== form.guardado[campo]);
}

/**
 * Llegan datos nuevos de la base (el bot u otra persona guardó algo) mientras
 * el formulario está abierto: cada campo que el staff no tocó toma el valor
 * nuevo; lo que está escribiendo se respeta.
 */
function fusionarFormulario(previo: Formulario | null, datos: DatosEditables): Formulario {
  const actual = { ...datos };
  if (previo) for (const campo of camposTocados(previo)) copiarCampo(actual, previo.actual, campo);
  return { actual, guardado: datos };
}

/** Campos del perfil (compra, refacciones o taller), en el orden en que le sirven al asesor. */
const CAMPOS_PERFIL: [keyof PerfilCompra, string][] = [
  ["moto", "Moto que quiere"],
  ["pago", "Contado o crédito"],
  ["enganche", "Enganche"],
  ["presupuesto", "Presupuesto"],
  ["plazo", "Para cuándo"],
  ["uso", "Uso"],
  ["vehiculo", "Su moto"],
  ["solicitud", "Pieza / servicio"],
  ["kilometraje", "Kilometraje"],
  ["ubicacion", "Ciudad"],
  ["horario_visita", "Horario que pidió"],
  ["notas", "Notas del bot"],
];

function perfilParaMostrar(perfil: PerfilCompra | null | undefined): [string, string][] {
  if (!perfil) return [];
  return CAMPOS_PERFIL.flatMap(([campo, etiqueta]) => {
    const valor = perfil[campo];
    return typeof valor === "string" && valor.trim() ? [[etiqueta, valor.trim()] as [string, string]] : [];
  });
}

/** Color estable para una etiqueta nueva: el mismo nombre siempre cae en el mismo tono. */
function colorPorNombre(nombre: string): EtiquetaColor {
  let hash = 0;
  for (const letra of nombre.toLowerCase()) hash = (hash * 31 + letra.charCodeAt(0)) >>> 0;
  return COLORES_ETIQUETA[hash % COLORES_ETIQUETA.length];
}

function firmaSeguimiento(c: { estado: string; etapa: string; asignada_a: string | null; motivo_cierre: string | null }): string {
  return `${c.estado}|${c.etapa}|${c.asignada_a ?? ""}|${c.motivo_cierre ?? ""}`;
}

function textoIdentidad(identidad: ClienteIdentidad): string {
  if (identidad.username) return `@${identidad.username}`;
  if (identidad.nombre_perfil?.trim()) return identidad.nombre_perfil.trim();
  if (identidad.tipo === "wa_id") return telefonoBonito(identidad.external_id);
  return identidad.external_id;
}

function textoEvento(evento: EventoConversacion, staff: StaffMiembro[]): string {
  const d = evento.detalle ?? {};
  const cadena = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
  switch (evento.tipo) {
    case "asignacion": {
      const destino = cadena(d.a);
      if (!destino) return "Se quitó la asignación";
      const persona = staff.find((s) => s.user_id === destino);
      return persona ? `Asignada a ${persona.nombre}` : "Se asignó la conversación";
    }
    case "etapa": {
      const de = cadena(d.de);
      const a = cadena(d.a);
      return `Etapa: ${de ? (ETAPA_LABEL[de as Etapa] ?? de) : "—"} → ${a ? (ETAPA_LABEL[a as Etapa] ?? a) : "—"}`;
    }
    case "estado": {
      const de = cadena(d.de);
      const a = cadena(d.a);
      return `${de ? (ESTADO_CONVERSACION_LABEL[de as EstadoConversacion] ?? de) : "—"} → ${
        a ? (ESTADO_CONVERSACION_LABEL[a as EstadoConversacion] ?? a) : "—"
      }`;
    }
    case "cierre": {
      const motivo = cadena(d.motivo);
      return `Conversación cerrada${motivo ? ` · ${MOTIVO_CIERRE_LABEL[motivo as MotivoCierre] ?? motivo}` : ""}`;
    }
    case "fusion":
      return "Se fusionó con otro contacto";
    case "respuesta_privada":
      return d.modo === "publica" ? "Respuesta pública al comentario" : "Respuesta privada al comentario";
    case "escalada": {
      const motivo = cadena(d.motivo);
      return `El bot pidió una persona${motivo ? ` · ${motivo}` : ""}`;
    }
    case "documento": {
      const nombre = cadena(d.nombre_archivo);
      const que = d.media_type === "image" ? "una imagen" : "un documento";
      return `Envió ${que}${nombre ? ` · ${nombre}` : ""}${d.media_path ? "" : " (no se pudo descargar)"}`;
    }
    case "visita":
      return "Se agendó una llamada";
    default:
      return String(evento.tipo);
  }
}

/* ---------- Piezas ---------- */

function Seccion({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="shrink-0 border-b border-line px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="t-brace">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Mismo dibujo que `Chip` de ui.tsx; aquí acepta la medida táctil y `disabled`. */
function ChipFicha({
  activo,
  onClick,
  disabled,
  tactil,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  disabled?: boolean;
  tactil: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activo}
      className={`rounded-full border text-[12.5px] font-medium transition-colors disabled:opacity-50 ${
        tactil ? "min-h-11 px-4 py-2" : "px-3 py-1"
      } ${activo ? "border-ink bg-ink text-white" : "border-line bg-porcelain text-ink-soft hover:border-line-strong hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function Esqueleto({ filas = 2 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-bg-soft" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

/* ---------- Ficha ---------- */

/**
 * Ficha del contacto junto al hilo: quién es, cómo va el seguimiento y qué
 * historial tiene (lo que busca, seguimiento, actividad).
 *
 * El estado interno vive en `Ficha`, montada con `key` por conversación y
 * por cliente: al cambiar de chat (o cuando una fusión mueve la conversación
 * a otro contacto) todo arranca limpio, sin arrastrar campos a medio editar.
 */
export default function ClientPanel(props: ClientPanelProps) {
  return <Ficha key={`${props.conversacion.id}:${props.conversacion.cliente_id}`} {...props} />;
}

function Ficha({
  conversacion,
  etiquetas,
  etiquetasCliente,
  staff,
  usuarioId,
  onAbrirConversacion,
  onVolver,
  className = "",
}: ClientPanelProps) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const clienteId = conversacion.cliente_id;
  const conversacionId = conversacion.id;
  // Con flecha de volver la ficha es una pantalla táctil: todo lo que se toca mide 44 px.
  const tactil = Boolean(onVolver);

  const [cargando, setCargando] = useState(true);
  const [cliente, setCliente] = useState<ClienteFicha | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [identidades, setIdentidades] = useState<ClienteIdentidad[]>([]);
  const [eventos, setEventos] = useState<EventoConversacion[]>([]);

  const [guardandoDatos, setGuardandoDatos] = useState(false);

  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [guardandoTelefono, setGuardandoTelefono] = useState(false);
  /** Número ya normalizado que resultó ser de otro contacto: espera la confirmación de fusionar. */
  const [telefonoEnConflicto, setTelefonoEnConflicto] = useState<string | null>(null);

  const [guardandoSeguimiento, setGuardandoSeguimiento] = useState(false);
  const [optimista, setOptimista] = useState<{ firma: string; patch: PatchSeguimiento } | null>(null);
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [motivoElegido, setMotivoElegido] = useState<MotivoCierre>("otro");

  const [etiquetasExtra, setEtiquetasExtra] = useState<Etiqueta[]>([]);
  const [ajustesEtiquetas, setAjustesEtiquetas] = useState<Record<string, boolean>>({});
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [creandoEtiqueta, setCreandoEtiqueta] = useState(false);

  /* ----- Carga y tiempo real ----- */

  useEffect(() => {
    let activo = true;

    function aplicarCliente(ficha: ClienteFicha) {
      const datos = datosDe(ficha);
      setCliente(ficha);
      // Si alguien está escribiendo, no se le pisan los campos que tocó; los
      // demás se ponen al día con lo que haya guardado el bot u otra persona.
      setForm((previo) => fusionarFormulario(previo, datos));
    }

    async function cargar() {
      const [clienteRes, identidadesRes, eventosRes] = await Promise.all([
        supabase.from("clientes").select(COLUMNAS_CLIENTE).eq("id", clienteId).maybeSingle(),
        supabase.from("cliente_identidades").select("*").eq("cliente_id", clienteId).order("created_at"),
        supabase
          .from("eventos_conversacion")
          .select("*")
          .eq("conversacion_id", conversacionId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (!activo) return;

      const ficha = (clienteRes.data as unknown as ClienteFicha | null) ?? null;
      if (ficha) aplicarCliente(ficha);
      setIdentidades((identidadesRes.data ?? []) as unknown as ClienteIdentidad[]);
      setEventos((previos) => {
        // Un evento que llegó por tiempo real mientras cargaba no se pierde.
        const cargados = (eventosRes.data ?? []) as unknown as EventoConversacion[];
        const nuevos = previos.filter((p) => !cargados.some((c) => c.id === p.id));
        return [...nuevos, ...cargados];
      });
      setCargando(false);
    }

    async function refrescarCliente() {
      const { data } = await supabase.from("clientes").select(COLUMNAS_CLIENTE).eq("id", clienteId).maybeSingle();
      // Tras una fusión el contacto de origen ya no existe: se conserva lo
      // que había hasta que la bandeja entregue la conversación con su nuevo dueño.
      if (!activo || !data) return;
      const ficha = data as unknown as ClienteFicha;
      aplicarCliente(ficha);
    }

    void cargar();

    // Sufijo propio de cada montaje: el cliente de tiempo real reutiliza un
    // canal que todavía se está cerrando si el nombre coincide (pasa al
    // remontar la ficha de la misma conversación).
    const sufijo = Math.random().toString(36).slice(2, 8);
    const canalRt = supabase
      .channel(`ficha-${conversacionId}-${sufijo}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "eventos_conversacion", filter: `conversacion_id=eq.${conversacionId}` },
        (payload) => {
          const nuevo = payload.new as EventoConversacion;
          setEventos((previos) => (previos.some((e) => e.id === nuevo.id) ? previos : [nuevo, ...previos].slice(0, 30)));
        },
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clientes", filter: `id=eq.${clienteId}` }, () => {
        void refrescarCliente();
      })
      .subscribe();

    return () => {
      activo = false;
      void supabase.removeChannel(canalRt);
    };
  }, [clienteId, conversacionId, supabase]);

  const perfilVisible = useMemo(() => perfilParaMostrar(cliente?.perfil), [cliente?.perfil]);

  /* ----- Identidad y teléfono ----- */

  const telefono = cliente ? cliente.telefono : conversacion.cliente_telefono;
  const emailVisible = cliente ? cliente.email : conversacion.cliente_email;
  const nombreVisible = cliente?.nombre?.trim() || describirIdentidad(conversacion);

  async function guardarTelefono(fusionar: boolean) {
    const normalizado = fusionar ? telefonoEnConflicto : normalizarTelefonoMx(telefonoNuevo);
    if (!normalizado) {
      toast.error("El número no parece un celular mexicano válido (10 dígitos)");
      return;
    }
    setGuardandoTelefono(true);
    try {
      const respuesta = await guardarTelefonoContacto(clienteId, normalizado, fusionar);
      setTelefonoEnConflicto(null);
      setTelefonoNuevo("");
      if (respuesta.fusionado || respuesta.clienteId !== clienteId) {
        // La conversación ahora apunta al contacto que ya tenía ese número;
        // la bandeja recarga por tiempo real y la ficha se vuelve a montar.
        toast.success("Contactos fusionados");
        onAbrirConversacion(conversacionId);
      } else {
        toast.success("Teléfono guardado");
        setCliente((previo) => (previo ? { ...previo, telefono: normalizado } : previo));
      }
    } catch (err) {
      if (!fusionar && err instanceof BotApiError && err.code === "telefono_en_uso") {
        setTelefonoEnConflicto(normalizado);
        return;
      }
      toast.error(err instanceof BotApiError ? err.message : "No se pudo guardar el teléfono.");
    } finally {
      setGuardandoTelefono(false);
    }
  }

  /* ----- Datos ----- */

  function editar<K extends keyof DatosEditables>(campo: K, valor: DatosEditables[K]) {
    setForm((previo) => (previo ? { ...previo, actual: { ...previo.actual, [campo]: valor } } : previo));
  }

  async function guardarDatos() {
    if (!form) return;
    // Solo viaja lo que el staff cambió: así no se pisa con un valor viejo lo
    // que el bot haya guardado entretanto en los otros campos (nombre, correo,
    // interés), aunque el aviso de tiempo real no haya llegado.
    const tocados = camposTocados(form);
    if (tocados.length === 0) return;
    const enviados = form.actual;
    const limpio: DatosEditables = {
      nombre: enviados.nombre.trim(),
      email: enviados.email.trim(),
      tipo: enviados.tipo,
      interes: enviados.interes,
      notas: enviados.notas.trim(),
    };
    if (tocados.includes("email") && limpio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio.email)) {
      toast.error("El correo no parece válido.");
      return;
    }
    const patch: Partial<Pick<ClienteFicha, "nombre" | "email" | "tipo" | "interes" | "notas">> = {};
    if (tocados.includes("nombre")) patch.nombre = limpio.nombre || null;
    if (tocados.includes("email")) patch.email = limpio.email || null;
    if (tocados.includes("tipo")) patch.tipo = limpio.tipo;
    if (tocados.includes("interes")) patch.interes = limpio.interes;
    if (tocados.includes("notas")) patch.notas = limpio.notas || null;

    setGuardandoDatos(true);
    // Sin updated_at: lo pone el trigger clientes_set_updated_at.
    const { data, error } = await supabase.from("clientes").update(patch).eq("id", clienteId).select("id");
    setGuardandoDatos(false);
    if (error || !data?.length) {
      toast.error("No se pudieron guardar los datos.");
      return;
    }
    // Solo los campos enviados pasan a "guardado"; los demás quedan como
    // llegaron de la base (pudieron cambiar por tiempo real durante el guardado).
    setForm((previo) => {
      if (!previo) return previo;
      const actual = { ...previo.actual };
      const guardado = { ...previo.guardado };
      for (const campo of tocados) {
        copiarCampo(guardado, limpio, campo);
        // Si siguió escribiendo en ese campo mientras se guardaba, se respeta lo que escribió.
        if (previo.actual[campo] === enviados[campo]) copiarCampo(actual, limpio, campo);
      }
      return { actual, guardado };
    });
    setCliente((previo) => (previo ? { ...previo, ...patch } : previo));
    toast.success("Datos guardados");
  }

  /* ----- Seguimiento ----- */

  // Lo elegido se muestra al instante y vale mientras la bandeja no entregue
  // la conversación actualizada (su firma cambia y el ajuste deja de aplicar).
  const firmaActual = firmaSeguimiento(conversacion);
  const ajuste = optimista && optimista.firma === firmaActual ? optimista.patch : null;
  const estado: EstadoConversacion = ajuste?.estado ?? conversacion.estado;
  const etapa: Etapa = ajuste?.etapa ?? conversacion.etapa;
  const asignadaA: string | null = ajuste && "asignada_a" in ajuste ? (ajuste.asignada_a ?? null) : conversacion.asignada_a;
  const motivoCierre: MotivoCierre | null =
    ajuste && "motivo_cierre" in ajuste ? (ajuste.motivo_cierre ?? null) : conversacion.motivo_cierre;

  /** El contacto volvió a escribir y el bot ya le abrió otra conversación: se ofrece saltar a esa. */
  async function avisarOtraAbierta() {
    let otraId: string | null = null;
    if (conversacion.identidad_id !== null) {
      const base = supabase
        .from("conversaciones_resumen")
        .select("id")
        .eq("identidad_id", conversacion.identidad_id)
        .neq("estado", "cerrada")
        .neq("id", conversacionId);
      const { data } = await (conversacion.hilo_externo ? base.eq("hilo_externo", conversacion.hilo_externo) : base.is("hilo_externo", null))
        .limit(1)
        .maybeSingle();
      otraId = (data?.id as string | undefined) ?? null;
    }
    const destino = otraId;
    toast.error(
      "Este contacto ya tiene otra conversación abierta",
      destino ? { action: { label: "Abrir", onClick: () => onAbrirConversacion(destino) } } : undefined,
    );
  }

  async function actualizarConversacion(patch: PatchSeguimiento, visible: PatchSeguimiento, mensajeError: string): Promise<boolean> {
    setOptimista({ firma: firmaActual, patch: visible });
    setGuardandoSeguimiento(true);
    const { data, error } = await supabase.from("conversaciones").update(patch).eq("id", conversacionId).select("id");
    setGuardandoSeguimiento(false);
    if (error?.code === "23505") {
      // conversaciones_hilo_abierto_idx: solo puede haber una abierta por identidad e hilo.
      setOptimista(null);
      await avisarOtraAbierta();
      return false;
    }
    if (error || !data?.length) {
      setOptimista(null);
      toast.error(mensajeError);
      return false;
    }
    return true;
  }

  function asignar(agenteId: string | null) {
    void actualizarConversacion({ asignada_a: agenteId }, { asignada_a: agenteId }, "No se pudo asignar la conversación.");
  }

  function cambiarEtapa(nueva: Etapa) {
    void actualizarConversacion({ etapa: nueva }, { etapa: nueva }, "No se pudo cambiar la etapa.");
  }

  function cambiarMotivo(motivo: MotivoCierre) {
    void actualizarConversacion({ motivo_cierre: motivo }, { motivo_cierre: motivo }, "No se pudo cambiar el motivo.");
  }

  async function elegirEstado(destino: EstadoConversacion) {
    if (destino === estado) return;
    if (destino === "cerrada") {
      setMotivoElegido(motivoCierre ?? "otro");
      setCierreAbierto(true);
      return;
    }
    if (estado === "cerrada") {
      // Reabrir: vuelve a la etapa de trabajo y se limpia el motivo.
      const patch: PatchSeguimiento = { estado: destino, etapa: "en_atencion", motivo_cierre: null };
      const ok = await actualizarConversacion(patch, patch, "No se pudo reabrir la conversación.");
      if (ok) toast.success("Conversación reabierta");
      return;
    }
    const ok = await actualizarConversacion({ estado: destino }, { estado: destino }, "No se pudo cambiar quién atiende este chat.");
    if (ok) toast.success(destino === "escalada" ? "El bot dejó de responder en este chat." : "El bot vuelve a responder en este chat.");
  }

  async function confirmarCierre() {
    const motivo = motivoElegido;
    setCierreAbierto(false);
    // El trigger conversaciones_etapa_asignacion pasa la etapa a "cerrado".
    const ok = await actualizarConversacion(
      { estado: "cerrada", motivo_cierre: motivo },
      { estado: "cerrada", etapa: "cerrado", motivo_cierre: motivo },
      "No se pudo cerrar la conversación.",
    );
    if (ok) toast.success("Conversación cerrada");
  }

  /* ----- Etiquetas ----- */

  // Los ajustes locales (asignar / quitar al instante) se sueltan en cuanto
  // la bandeja trae lo mismo desde la base.
  const firmaEtiquetas = etiquetasCliente
    .map((e) => e.id)
    .sort()
    .join(",");
  const [firmaEtiquetasVista, setFirmaEtiquetasVista] = useState(firmaEtiquetas);
  if (firmaEtiquetasVista !== firmaEtiquetas) {
    setFirmaEtiquetasVista(firmaEtiquetas);
    const enBase = new Set(etiquetasCliente.map((e) => e.id));
    setAjustesEtiquetas((previos) => Object.fromEntries(Object.entries(previos).filter(([id, valor]) => enBase.has(id) !== valor)));
  }

  /** Catálogo local = el de la bandeja + lo creado o recargado desde esta ficha. */
  const etiquetasLocales = useMemo(() => {
    const porId = new Map<string, Etiqueta>();
    for (const e of etiquetas) porId.set(e.id, e);
    for (const e of etiquetasCliente) if (!porId.has(e.id)) porId.set(e.id, e);
    for (const e of etiquetasExtra) if (!porId.has(e.id)) porId.set(e.id, e);
    return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [etiquetas, etiquetasCliente, etiquetasExtra]);

  const idsAsignadas = useMemo(() => {
    const ids = new Set(etiquetasCliente.map((e) => e.id));
    for (const [id, valor] of Object.entries(ajustesEtiquetas)) {
      if (valor) ids.add(id);
      else ids.delete(id);
    }
    return ids;
  }, [etiquetasCliente, ajustesEtiquetas]);

  const asignadas = etiquetasLocales.filter((e) => idsAsignadas.has(e.id));
  const disponibles = etiquetasLocales.filter((e) => !idsAsignadas.has(e.id));

  function soltarAjuste(etiquetaId: string) {
    setAjustesEtiquetas((previos) => {
      const siguiente = { ...previos };
      delete siguiente[etiquetaId];
      return siguiente;
    });
  }

  async function asignarEtiqueta(etiqueta: Etiqueta): Promise<boolean> {
    if (idsAsignadas.has(etiqueta.id)) return true;
    setAjustesEtiquetas((previos) => ({ ...previos, [etiqueta.id]: true }));
    const { error } = await supabase.from("cliente_etiquetas").insert({ cliente_id: clienteId, etiqueta_id: etiqueta.id });
    // 23505 aquí es la clave primaria (cliente, etiqueta): ya estaba asignada, no es un fallo.
    if (error && error.code !== "23505") {
      soltarAjuste(etiqueta.id);
      toast.error("No se pudo asignar la etiqueta.");
      return false;
    }
    return true;
  }

  async function quitarEtiqueta(etiqueta: Etiqueta) {
    setAjustesEtiquetas((previos) => ({ ...previos, [etiqueta.id]: false }));
    const { error } = await supabase.from("cliente_etiquetas").delete().eq("cliente_id", clienteId).eq("etiqueta_id", etiqueta.id);
    if (error) {
      soltarAjuste(etiqueta.id);
      toast.error("No se pudo quitar la etiqueta.");
    }
  }

  async function crearEtiqueta() {
    const nombre = nuevaEtiqueta.trim().replace(/\s+/g, " ");
    if (!nombre || creandoEtiqueta) return;

    // Primero el catálogo: escribir "vip" asigna la "VIP" que ya existe.
    const existente = etiquetasLocales.find((e) => e.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (existente) {
      if (await asignarEtiqueta(existente)) setNuevaEtiqueta("");
      return;
    }

    setCreandoEtiqueta(true);
    const { data, error } = await supabase
      .from("etiquetas")
      .insert({ nombre, color: colorPorNombre(nombre) })
      .select(COLUMNAS_ETIQUETA)
      .single();

    if (error?.code === "23505") {
      // etiquetas.nombre es unique: otra persona la creó hace un momento.
      toast.error("Esa etiqueta ya existe");
      const { data: catalogo } = await supabase.from("etiquetas").select(COLUMNAS_ETIQUETA).order("nombre");
      if (catalogo) setEtiquetasExtra(catalogo as unknown as Etiqueta[]);
      setCreandoEtiqueta(false);
      return;
    }
    if (error || !data) {
      toast.error("No se pudo crear la etiqueta.");
      setCreandoEtiqueta(false);
      return;
    }

    const creada = data as unknown as Etiqueta;
    setEtiquetasExtra((previas) => [...previas.filter((e) => e.id !== creada.id), creada]);
    setNuevaEtiqueta("");
    setCreandoEtiqueta(false);
    await asignarEtiqueta(creada);
  }

  /* ----- Render ----- */

  // En táctil, 16 px de letra: iOS hace zoom al enfocar campos más chicos
  // (`.admin-input` no está en una capa de Tailwind, por eso el `!`).
  const campo = `admin-input ${tactil ? "h-11 !text-base" : ""}`;

  return (
    <aside className={"flex min-h-0 flex-col overflow-y-auto bg-porcelain " + className}>
      {onVolver && (
        <div className="sticky top-0 z-10 flex shrink-0 items-center gap-1 border-b border-line bg-porcelain px-2 py-2">
          <button type="button" onClick={onVolver} aria-label="Volver al chat" className="flex size-11 shrink-0 items-center justify-center text-ink hover:bg-bg-soft">
            <ArrowLeft size={20} aria-hidden />
          </button>
          <h2 className="t-display truncate text-lg leading-tight">Ficha del contacto</h2>
        </div>
      )}

      {/* 1. Identidad */}
      <section className="shrink-0 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <CanalIcono canal={conversacion.canal} leadAds={conversacion.hilo_externo === HILO_LEAD_ADS} size={24} />
          <h3 className="t-display min-w-0 break-words text-xl leading-tight">{nombreVisible}</h3>
        </div>
        {emailVisible && (
          <a href={`mailto:${emailVisible}`} className="mt-1 block break-all text-xs text-ink-soft hover:text-accent">
            {emailVisible}
          </a>
        )}

        {identidades.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {identidades.map((identidad) => (
              <li key={identidad.id} className="flex items-center gap-2 text-xs text-ink-soft">
                <CanalIcono canal={identidad.canal} size={14} />
                <span className="min-w-0 truncate">{textoIdentidad(identidad)}</span>
                <span className="shrink-0 text-[10px] text-muted">desde {fechaLima(identidad.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        {!cargando && identidades.length === 0 && (
          <p className="mt-3 text-xs text-muted">
            {conversacion.canal !== "web"
              ? `Contacto de ${CANAL_LABEL[conversacion.canal]}.`
              : conversacion.hilo_externo === HILO_LEAD_ADS
                ? "Llegó por el formulario de un anuncio de Facebook o Instagram."
                : "Llegó por el formulario de la web."}
          </p>
        )}
        {conversacion.fuente && (
          <div className="mt-3 text-xs text-ink-soft">
            <span className="admin-label">Origen</span>
            <span className="text-ink">{conversacion.fuente}</span>
            {conversacion.cliente_fuente && conversacion.cliente_fuente !== conversacion.fuente && (
              <span className="mt-0.5 block text-muted">Primer contacto: {conversacion.cliente_fuente}</span>
            )}
          </div>
        )}

        <div className="mt-3">
          {telefono ? (
            <a
              href={`https://wa.me/${telefono.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-2 text-sm text-ink hover:text-accent ${tactil ? "min-h-11" : ""}`}
            >
              <span className="tabular">{telefonoBonito(telefono)}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">WhatsApp</span>
            </a>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void guardarTelefono(false);
              }}
            >
              <input
                value={telefonoNuevo}
                onChange={(e) => setTelefonoNuevo(e.target.value)}
                inputMode="tel"
                autoComplete="off"
                placeholder="Celular (10 dígitos)"
                aria-label="Celular del contacto"
                className={campo}
              />
              <button type="submit" disabled={guardandoTelefono || !telefonoNuevo.trim()} className={`admin-btn ghost shrink-0 ${tactil ? "min-h-11" : ""}`}>
                Guardar
              </button>
            </form>
          )}
        </div>

      </section>

      {/* 2. Datos */}
      <Seccion titulo="Datos">
        {form ? (
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="admin-label">Nombre</span>
              <input value={form.actual.nombre} onChange={(e) => editar("nombre", e.target.value)} placeholder="Sin nombre todavía" className={campo} />
            </label>
            <label className="block">
              <span className="admin-label">Correo</span>
              <input
                type="email"
                value={form.actual.email}
                onChange={(e) => editar("email", e.target.value)}
                placeholder="correo@ejemplo.com"
                autoComplete="off"
                className={campo}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="admin-label">Tipo</span>
                <select value={form.actual.tipo} onChange={(e) => editar("tipo", e.target.value as ClienteTipo)} className={campo}>
                  {TIPOS_CLIENTE.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_CLIENTE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="admin-label">Interés</span>
                <select
                  value={form.actual.interes ?? ""}
                  onChange={(e) => editar("interes", e.target.value ? (e.target.value as Interes) : null)}
                  className={campo}
                >
                  <option value="">Sin definir</option>
                  {INTERESES.map((i) => (
                    <option key={i} value={i}>
                      {INTERES_LABEL[i]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="admin-label">Notas internas</span>
              <textarea
                value={form.actual.notas}
                onChange={(e) => editar("notas", e.target.value)}
                rows={3}
                placeholder="Lo que conviene recordar de esta persona…"
                className={`admin-input resize-y ${tactil ? "!text-base" : ""}`}
              />
            </label>
            <button
              type="button"
              onClick={() => void guardarDatos()}
              disabled={guardandoDatos || !hayCambios(form)}
              className={`admin-btn w-full ${tactil ? "min-h-11" : ""}`}
            >
              {guardandoDatos ? "Guardando…" : "Guardar datos"}
            </button>
          </div>
        ) : cargando ? (
          <Esqueleto filas={3} />
        ) : (
          <p className="text-xs text-muted">No se pudo cargar la ficha de este contacto.</p>
        )}
      </Seccion>

      {/* Lo que busca (lo llena el bot con guardar_perfil_busqueda) */}
      <Seccion titulo="Lo que busca">
        {cargando ? (
          <Esqueleto />
        ) : perfilVisible.length === 0 ? (
          <p className="text-xs text-muted">Todavía no ha contado qué busca.</p>
        ) : (
          <dl className="flex flex-col gap-2 text-sm">
            {perfilVisible.map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{etiqueta}</dt>
                <dd className="whitespace-pre-wrap text-ink-soft">{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </Seccion>

      {/* 3. Seguimiento */}
      <Seccion titulo="Seguimiento">
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="admin-label">Asignada a</span>
            <select value={asignadaA ?? ""} onChange={(e) => asignar(e.target.value || null)} disabled={guardandoSeguimiento} className={campo}>
              <option value="">Sin asignar</option>
              {/* Quien la tiene ya no figura en el staff activo: se muestra igual para no perder el dato. */}
              {asignadaA && !staff.some((s) => s.user_id === asignadaA) && (
                <option value={asignadaA}>{conversacion.asignada_nombre ?? "Otra persona"}</option>
              )}
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.user_id === usuarioId ? `Yo (${primerNombre(s.nombre) || s.nombre})` : s.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="admin-label">Etapa</span>
            <select value={etapa} onChange={(e) => cambiarEtapa(e.target.value as Etapa)} disabled={guardandoSeguimiento} className={campo}>
              {ETAPAS.map((e) => (
                <option key={e} value={e}>
                  {ETAPA_LABEL[e]}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="admin-label">Quién atiende</span>
            <div className="flex flex-wrap gap-1.5">
              {ESTADOS_CONVERSACION.map((opcion) => (
                <ChipFicha
                  key={opcion}
                  activo={estado === opcion}
                  onClick={() => void elegirEstado(opcion)}
                  disabled={guardandoSeguimiento}
                  tactil={tactil}
                >
                  {ESTADO_CONVERSACION_LABEL[opcion]}
                </ChipFicha>
              ))}
            </div>
            {estado === "cerrada" && <p className="mt-2 text-xs text-muted">Para reabrirla, elige quién la atiende.</p>}
          </div>

          {(estado === "cerrada" || etapa === "cerrado") && (
            <label className="block">
              <span className="admin-label">Motivo del cierre</span>
              <select
                value={motivoCierre ?? "otro"}
                onChange={(e) => cambiarMotivo(e.target.value as MotivoCierre)}
                disabled={guardandoSeguimiento}
                className={campo}
              >
                {MOTIVOS_CIERRE.map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_CIERRE_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </Seccion>

      {/* 4. Etiquetas */}
      <Seccion titulo="Etiquetas">
        {asignadas.length === 0 ? (
          <p className="text-xs text-muted">Sin etiquetas todavía.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {asignadas.map((e) => {
              const tono = ETIQUETA_TONO[e.color] ?? ETIQUETA_TONO.slate;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => void quitarEtiqueta(e)}
                  aria-label={`Quitar etiqueta ${e.nombre}`}
                  title="Quitar"
                  className={`inline-flex items-center gap-1.5 rounded-full text-xs font-medium transition-opacity hover:opacity-70 ${
                    tactil ? "min-h-11 px-3" : "px-2.5 py-1"
                  }`}
                  style={{ background: tono.fondo, color: tono.texto }}
                >
                  <Tag size={11} aria-hidden />
                  {e.nombre}
                  <X size={12} aria-hidden />
                </button>
              );
            })}
          </div>
        )}

        {disponibles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {disponibles.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => void asignarEtiqueta(e)}
                className={`inline-flex items-center gap-1 rounded-full border border-dashed border-line-strong text-xs text-ink-soft transition-colors hover:border-solid hover:border-accent hover:text-accent-deep ${
                  tactil ? "min-h-11 px-3" : "px-2.5 py-1"
                }`}
              >
                <Plus size={12} aria-hidden />
                {e.nombre}
              </button>
            ))}
          </div>
        )}

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void crearEtiqueta();
          }}
        >
          <input
            value={nuevaEtiqueta}
            onChange={(e) => setNuevaEtiqueta(e.target.value)}
            maxLength={40}
            placeholder="Nueva etiqueta…"
            aria-label="Nombre de la etiqueta nueva"
            className={campo}
          />
          <button type="submit" disabled={creandoEtiqueta || !nuevaEtiqueta.trim()} className={`admin-btn ghost shrink-0 ${tactil ? "min-h-11" : ""}`}>
            Crear
          </button>
        </form>
      </Seccion>

      {/* 7. Actividad */}
      <Seccion titulo="Actividad">
        {cargando ? (
          <Esqueleto />
        ) : eventos.length === 0 ? (
          <p className="text-xs text-muted">Todavía no hay movimientos en esta conversación.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 break-words text-ink-soft">{textoEvento(ev, staff)}</span>
                <span className="shrink-0 text-[10px] text-muted">{tiempoRelativo(ev.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {/* Cerrar pide el motivo: es lo que después alimenta "ganadas / perdidas". */}
      <DialogShell
        abierto={cierreAbierto}
        onCerrar={() => setCierreAbierto(false)}
        titulo="Cerrar la conversación"
        descripcion="El bot deja de responder aquí. Si el contacto vuelve a escribir, se abre una conversación nueva."
        ancho="460px"
        pie={
          <>
            <button type="button" onClick={() => setCierreAbierto(false)} className="admin-btn ghost min-h-11">
              Cancelar
            </button>
            <button type="button" onClick={() => void confirmarCierre()} disabled={guardandoSeguimiento} className="admin-btn min-h-11">
              Cerrar conversación
            </button>
          </>
        }
      >
        <span className="admin-label">Motivo del cierre</span>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS_CIERRE.map((m) => (
            <ChipFicha key={m} activo={motivoElegido === m} onClick={() => setMotivoElegido(m)} tactil>
              {MOTIVO_CIERRE_LABEL[m]}
            </ChipFicha>
          ))}
        </div>
      </DialogShell>

      {/* El número ya es de otro contacto: fusionar mueve todo el historial y no se deshace. */}
      <DialogShell
        abierto={telefonoEnConflicto !== null}
        onCerrar={() => setTelefonoEnConflicto(null)}
        titulo="Ese número ya es de otro contacto"
        descripcion="Si son la misma persona, puedes fusionarlos."
        ancho="460px"
        pie={
          <>
            <button type="button" onClick={() => setTelefonoEnConflicto(null)} className="admin-btn ghost min-h-11">
              Cancelar
            </button>
            <button type="button" onClick={() => void guardarTelefono(true)} disabled={guardandoTelefono} className="admin-btn min-h-11">
              {guardandoTelefono ? "Fusionando…" : "Fusionar"}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          El {telefonoEnConflicto ? telefonoBonito(telefonoEnConflicto) : "número"} ya está registrado en otro contacto. Al fusionar, esta
          conversación, sus notas y sus etiquetas pasan a ese contacto y esta ficha desaparece. No se puede deshacer.
        </p>
      </DialogShell>
    </aside>
  );
}
