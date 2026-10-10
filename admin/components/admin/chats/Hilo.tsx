"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bot, ChevronDown, Mail, Paperclip, Send, Sparkles, StickyNote, UserRoundX } from "lucide-react";
import { LogoMarca } from "@/components/admin/iconos/Marcas";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { CLASE_DISPARADOR, Menu, MenuOpcion, MenuSeparador, MenuTitulo, MenuAccion } from "@/components/admin/Menu";
import {
  BotApiError,
  enviarMensajeHumano,
  enviarPlantillaMensaje,
  marcarVisto,
  responderComentario,
  sugerirRespuesta,
} from "@/lib/admin/bot-api";
import {
  CANAL_LABEL,
  ETAPAS,
  ETAPA_LABEL,
  HILO_LEAD_ADS,
  describirIdentidad,
  horaCorta,
  horasRestantesVentana,
  iniciales,
  primerNombre,
  puedeRespuestaPrivada,
  ventanaAbierta,
  ventanaMeta,
  type ConversacionResumen,
  type Etapa,
  type EstadoCanales,
  type EstadoVentana,
  type Mensaje,
  type PlantillaMedia,
  type RespuestaRapida,
  type StaffMiembro,
} from "@/lib/admin/chats-tipos";
import CanalIcono from "./CanalIcono";
import { ETAPA_TONO } from "./ListaConversaciones";

/** Tipo de cada archivo de la biblioteca, a la derecha de su nombre en el menú de adjuntar. */
const TIPO_ADJUNTO: Record<PlantillaMedia["tipo"], string> = { image: "Foto", video: "Video", audio: "Audio", document: "Doc" };

/* ---------- Burbujas ---------- */

function textoMetadata(mensaje: Mensaje, clave: string): string | null {
  const valor = mensaje.metadata[clave];
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

/** Formulario instantáneo de un anuncio: de qué formulario, anuncio y campaña vino (lo que Meta haya dado). */
function DatosAnuncio({ mensaje }: { mensaje: Mensaje }) {
  const formulario = textoMetadata(mensaje, "formulario");
  const anuncio = textoMetadata(mensaje, "anuncio");
  const campana = textoMetadata(mensaje, "campana");
  const red = textoMetadata(mensaje, "plataforma") === "ig" ? "Instagram" : "Facebook";
  return (
    <div className="mb-1.5 border-b border-ink/10 pb-1.5 text-[11px] text-muted">
      <span className="font-semibold uppercase tracking-[0.12em]">
        Formulario de anuncio · {red}
        {mensaje.metadata.organico === true ? " (orgánico)" : ""}
      </span>
      {formulario && <span className="block">Formulario: {formulario}</span>}
      {anuncio && <span className="block">Anuncio: {anuncio}</span>}
      {campana && <span className="block">Campaña: {campana}</span>}
    </div>
  );
}

function DatosFormulario({ mensaje }: { mensaje: Mensaje }) {
  if (mensaje.metadata.origen === HILO_LEAD_ADS) return <DatosAnuncio mensaje={mensaje} />;
  const asunto = typeof mensaje.metadata.asunto === "string" ? mensaje.metadata.asunto : null;
  const pagina = typeof mensaje.metadata.pagina === "string" ? mensaje.metadata.pagina : null;
  if (!asunto && !pagina) return null;
  return (
    <div className="mb-1.5 border-b border-ink/10 pb-1.5 text-[11px] text-muted">
      <span className="font-semibold uppercase tracking-[0.12em]">Formulario web</span>
      {asunto && <span className="block">Asunto: {asunto}</span>}
      {pagina && <span className="block break-all">Desde: {pagina}</span>}
    </div>
  );
}

function useUrlFirmada(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let activo = true;
    const supabase = createBrowserSupabase();
    supabase.storage
      .from("adjuntos")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (activo) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      activo = false;
    };
  }, [path]);
  return url;
}

function MediaEnBurbuja({ mensaje }: { mensaje: Mensaje }) {
  const firmada = useUrlFirmada(mensaje.media_path);
  const url = mensaje.media_url ?? firmada;
  if (!url) return mensaje.media_path ? <p className="mb-1.5 text-xs italic opacity-70">Cargando adjunto…</p> : null;
  if (mensaje.media_type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="mb-1.5 max-h-64 object-cover" />;
  }
  if (mensaje.media_type === "video") return <video src={url} controls className="mb-1.5 max-h-64" />;
  if (mensaje.media_type === "audio") return <audio src={url} controls className="mb-1.5 w-full max-w-64" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mb-1.5 block text-xs underline underline-offset-2">
      Ver archivo
    </a>
  );
}

function Burbuja({
  mensaje,
  staffPorId,
  admitePrivado,
  onResponderComentario,
}: {
  mensaje: Mensaje;
  staffPorId: Map<string, StaffMiembro>;
  admitePrivado: boolean;
  onResponderComentario: (m: Mensaje, modo: "publico" | "privado") => void;
}) {
  if (mensaje.tipo === "sistema") {
    return (
      <p className="t-mono mx-auto max-w-[85%] rounded-full bg-bg-soft px-3 py-1 text-center text-[10.5px] text-muted">{mensaje.contenido}</p>
    );
  }
  if (mensaje.tipo === "nota") {
    const autor = mensaje.autor_id ? staffPorId.get(mensaje.autor_id)?.nombre : null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-md border border-amber/50 bg-[rgba(242,165,22,0.10)] px-3.5 py-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-ink">
            <StickyNote size={12} aria-hidden />
            Nota interna{autor ? ` · ${autor}` : ""} · {horaCorta(mensaje.created_at)}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-ink">{mensaje.contenido}</p>
        </div>
      </div>
    );
  }

  const esCliente = mensaje.rol === "user";
  const esHumano = mensaje.rol === "humano";
  const permalink = typeof mensaje.metadata.permalink === "string" ? mensaje.metadata.permalink : null;
  // Lo que el equipo escribió fuera del panel: desde la app WhatsApp Business del celular o la bandeja de Meta.
  const etiquetaVia =
    mensaje.metadata.via === "whatsapp_business_app" ? "celular" : mensaje.metadata.via === "business_suite" ? "Business Suite" : null;

  return (
    <div className={`flex ${esCliente ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
          esCliente
            ? "rounded-bl-md border border-line bg-porcelain text-ink"
            : esHumano
              ? "rounded-br-md bg-accent text-white"
              : "rounded-br-md bg-ink text-white"
        }`}
      >
        {mensaje.tipo === "comentario" && (
          <p className={`mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${esCliente ? "text-muted" : "text-porcelain/70"}`}>
            Comentario
            {permalink && (
              <>
                {" · "}
                <a href={permalink} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Ver publicación
                </a>
              </>
            )}
          </p>
        )}
        {esCliente && <DatosFormulario mensaje={mensaje} />}
        <MediaEnBurbuja mensaje={mensaje} />
        <p className="whitespace-pre-wrap break-words text-sm">{mensaje.contenido}</p>

        {mensaje.tipo === "comentario" && esCliente && (
          <div className="mt-1.5 flex flex-wrap gap-x-3">
            <button
              type="button"
              onClick={() => onResponderComentario(mensaje, "publico")}
              className="text-[11px] font-semibold underline underline-offset-2 max-lg:inline-flex max-lg:min-h-11 max-lg:items-center"
            >
              Responder en público
            </button>
            {admitePrivado && (
              <button
                type="button"
                disabled={!puedeRespuestaPrivada(mensaje)}
                onClick={() => onResponderComentario(mensaje, "privado")}
                title={!puedeRespuestaPrivada(mensaje) ? "Ya se usó la respuesta privada, o pasaron más de 7 días" : undefined}
                className="text-[11px] font-semibold underline underline-offset-2 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40 max-lg:inline-flex max-lg:min-h-11 max-lg:items-center"
              >
                Responder por privado
              </button>
            )}
          </div>
        )}

        {mensaje.error_entrega && (
          <p className="mt-1 text-[11px] font-semibold text-[#ffb4b4]" title={mensaje.error_entrega}>
            No le llegó al cliente
          </p>
        )}
        <div className={`mt-1 flex items-center gap-1 text-[10px] ${esCliente ? "text-muted" : "text-porcelain/60"}`}>
          {!esCliente && (
            <span className="t-mono flex items-center gap-1 uppercase tracking-[0.1em]">
              {!esHumano && <Bot size={11} aria-hidden />}
              {esHumano ? `Equipo${etiquetaVia ? ` · ${etiquetaVia}` : ""}` : "Bot"}
            </span>
          )}
          <span className={`t-mono ${!esCliente ? "ml-auto" : ""}`}>{horaCorta(mensaje.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Hilo ---------- */

type ModoCompositor = "responder" | "nota";

function mismoMensaje(a: Mensaje, b: Mensaje): boolean {
  const claves = Object.keys(a) as (keyof Mensaje)[];
  return claves.length === Object.keys(b).length && claves.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/**
 * Junta lo que ya había en pantalla con lo recién leído de la base. Manda la
 * base, pero un mensaje que llegó en vivo mientras viajaba la consulta no se
 * pierde. Si no hay novedades devuelve el mismo arreglo, para no mover el
 * scroll de quien está leyendo más arriba.
 */
function fusionarMensajes(previos: Mensaje[], leidos: Mensaje[]): Mensaje[] {
  const idsLeidos = new Set(leidos.map((m) => m.id));
  const soloEnVivo = previos.filter((m) => !idsLeidos.has(m.id));
  const fusion = soloEnVivo.length ? [...leidos, ...soloEnVivo].sort((a, b) => a.created_at.localeCompare(b.created_at)) : leidos;
  if (fusion.length === previos.length && fusion.every((m, i) => mismoMensaje(m, previos[i]))) return previos;
  return fusion;
}

export default function Hilo({
  conversacion,
  staff,
  usuarioId,
  estadoCanales,
  respuestasRapidas,
  plantillas,
  onAbrirConversacion,
  onVolver,
  onAbrirContacto,
  onCambio,
}: {
  conversacion: ConversacionResumen | null;
  staff: StaffMiembro[];
  usuarioId: string;
  estadoCanales: EstadoCanales | null;
  respuestasRapidas: RespuestaRapida[];
  plantillas: PlantillaMedia[];
  onAbrirConversacion: (id: string) => void;
  /** Si viene, el hilo se muestra como pantalla propia (app móvil) con flecha para volver. */
  onVolver?: () => void;
  /** Abre la ficha del contacto (en móvil, como pantalla aparte). */
  onAbrirContacto?: () => void;
  /**
   * Avisa a la bandeja de un cambio que ya se guardó (quién atiende, etapa, asignación) para que lo muestre YA, sin
   * esperar el aviso de tiempo real: si ese aviso tarda o no llega, el interruptor se quedaba como estaba aunque el
   * cambio sí se había guardado.
   */
  onCambio?: (id: string, parche: Partial<ConversacionResumen>) => void;
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  // Si ya llega con una conversación, arranca cargando (el efecto la trae).
  const [cargando, setCargando] = useState(conversacion !== null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cambiandoModo, setCambiandoModo] = useState(false);
  const [modoCompositor, setModoCompositor] = useState<ModoCompositor>("responder");
  const [selectorAtajos, setSelectorAtajos] = useState(false);
  // Id de la conversación para la que se pidió la sugerencia (null = ninguna en curso).
  const [sugiriendoPara, setSugiriendoPara] = useState<string | null>(null);
  // Se guarda junto al cliente al que pertenece: así nunca se ofrece el chat de otro contacto.
  const [chatWhatsapp, setChatWhatsapp] = useState<{ clienteId: string; id: string | null } | null>(null);
  const [comentarioActivo, setComentarioActivo] = useState<{ mensaje: Mensaje; modo: "publico" | "privado" } | null>(null);
  const [textoComentario, setTextoComentario] = useState("");
  const [respondiendoComentario, setRespondiendoComentario] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const conversacionId = conversacion?.id ?? null;
  // En escritorio el hilo es una sola instancia que cambia de conversación por
  // props: lo que resuelve tarde (sugerencia de IA, respuesta a un comentario)
  // consulta esta ref para no escribir en el chat equivocado.
  const idActualRef = useRef(conversacionId);
  useEffect(() => {
    idActualRef.current = conversacionId;
  }, [conversacionId]);
  const sugiriendo = sugiriendoPara !== null && sugiriendoPara === conversacionId;
  const canal = conversacion?.canal ?? null;
  const clienteId = conversacion?.cliente_id ?? null;
  const esWeb = canal === "web";
  const esComentario = conversacion?.origen === "comentario";
  const modoHumano = conversacion?.estado === "escalada";
  const humanAgentAprobado = estadoCanales?.metaHumanAgentAprobado ?? false;
  // La IA también se apaga por canal (Canales): con ella apagada el bot no responde aunque el chat diga «Bot».
  const [iaDelCanal, setIaDelCanal] = useState<{ canal: string; encendida: boolean } | null>(null);
  useEffect(() => {
    if (!canal || canal === "web") return;
    let vigente = true;
    supabase
      .from("canales")
      .select("activo, ia_activa")
      .eq("canal", canal)
      .maybeSingle()
      .then(({ data }) => {
        if (vigente && data) setIaDelCanal({ canal, encendida: Boolean(data.activo && data.ia_activa) });
      });
    return () => {
      vigente = false;
    };
  }, [canal, supabase]);
  const iaApagada = iaDelCanal?.canal === canal && iaDelCanal.encendida === false;
  const staffPorId = useMemo(() => new Map(staff.map((s) => [s.user_id, s])), [staff]);
  const chatWhatsappId = esWeb && clienteId !== null && chatWhatsapp?.clienteId === clienteId ? chatWhatsapp.id : null;

  // Al cambiar de conversación el hilo se reinicia durante el render (patrón
  // de React para "ajustar estado cuando cambia una prop"), no en un efecto:
  // así nunca se pinta un cuadro con los mensajes o el borrador del chat anterior.
  const [idPrevio, setIdPrevio] = useState(conversacionId);
  if (idPrevio !== conversacionId) {
    setIdPrevio(conversacionId);
    setMensajes([]);
    setCargando(conversacionId !== null);
    setModoCompositor("responder");
    setTexto("");
    setSelectorAtajos(false);
    setComentarioActivo(null);
    setTextoComentario("");
  }

  useEffect(() => {
    if (!conversacionId) return;
    let activo = true;

    // Se llama al abrir, cada vez que el canal queda suscrito (cubre el hueco
    // entre la lectura y el alta del canal, y las reconexiones) y al volver a
    // primer plano: realtime no reenvía lo que llegó con el socket caído.
    function cargarMensajes(deFondo: boolean) {
      supabase
        .from("mensajes")
        .select("*")
        .eq("conversacion_id", conversacionId)
        .order("created_at", { ascending: true })
        .then(({ data, error }) => {
          if (!activo) return;
          if (error) {
            // Las recargas de fondo fallan en silencio (p. ej. al volver sin red).
            if (!deFondo) toast.error("No se pudo cargar la conversación.");
          } else {
            setMensajes((previos) =>
              fusionarMensajes(
                previos.filter((m) => m.conversacion_id === conversacionId),
                (data ?? []) as Mensaje[],
              ),
            );
          }
          setCargando(false);
        });
    }
    cargarMensajes(false);

    // Sufijo propio de cada suscripción: el cliente de tiempo real devuelve el
    // canal anterior (que aún se está cerrando) si el nombre coincide, y el
    // hilo se quedaría sin mensajes en vivo al reabrir el mismo chat.
    const sufijo = Math.random().toString(36).slice(2, 8);
    const canalRt = supabase
      .channel(`hilo-${conversacionId}-${sufijo}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes", filter: `conversacion_id=eq.${conversacionId}` },
        (payload) => {
          const nuevo = payload.new as Mensaje;
          // El canal de un chat que se acaba de cerrar sigue vivo unos instantes: un mensaje de OTRA conversación
          // que llegue en ese lapso no debe pintarse en el hilo que está abierto ahora.
          if (!activo || nuevo.conversacion_id !== conversacionId) return;
          setMensajes((previos) => (previos.some((m) => m.id === nuevo.id) ? previos : [...previos, nuevo]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mensajes", filter: `conversacion_id=eq.${conversacionId}` },
        (payload) => {
          const actualizado = payload.new as Mensaje;
          if (!activo || actualizado.conversacion_id !== conversacionId) return;
          setMensajes((previos) => previos.map((m) => (m.id === actualizado.id ? actualizado : m)));
        },
      )
      .subscribe((estado) => {
        if (estado === "SUBSCRIBED") cargarMensajes(true);
      });

    function alVolver() {
      if (document.visibilityState === "visible") cargarMensajes(true);
    }
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      activo = false;
      document.removeEventListener("visibilitychange", alVolver);
      supabase.removeChannel(canalRt);
    };
  }, [conversacionId, supabase]);

  // Un lead del formulario que además escribe por WhatsApp tiene ahí su chat real.
  useEffect(() => {
    if (!clienteId || !esWeb) return;
    let activo = true;
    supabase
      .from("conversaciones_resumen")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("canal", "whatsapp")
      .order("actividad_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (activo) setChatWhatsapp({ clienteId, id: (data?.id as string | undefined) ?? null });
      });
    return () => {
      activo = false;
    };
  }, [clienteId, esWeb, supabase]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  // Marcar visto al abrir (solo Meta; cosmético).
  useEffect(() => {
    if (conversacion && (conversacion.canal === "messenger" || conversacion.canal === "instagram") && conversacion.ultimo_rol === "user") {
      marcarVisto(conversacion.id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacionId]);

  async function alternarModo(humano: boolean) {
    if (!conversacion) return;
    setCambiandoModo(true);
    const { data, error } = await supabase
      .from("conversaciones")
      .update({ estado: humano ? "escalada" : "activa" })
      .eq("id", conversacion.id)
      .select("id");
    setCambiandoModo(false);
    if (error || !data?.length) {
      toast.error("No se pudo cambiar quién atiende este chat.");
      return;
    }
    onCambio?.(conversacion.id, { estado: humano ? "escalada" : "activa" });
    toast.success(humano ? "El bot dejó de responder en este chat." : "El bot vuelve a responder en este chat.");
  }

  async function cambiarEtapa(etapa: Etapa) {
    if (!conversacion) return;
    // RLS no lanza error: si no devuelve filas, no se actualizó nada.
    const { data, error } = await supabase.from("conversaciones").update({ etapa }).eq("id", conversacion.id).select("id");
    if (error || !data?.length) toast.error("No se pudo cambiar la etapa.");
    else onCambio?.(conversacion.id, { etapa });
  }

  async function asignar(agenteId: string | null) {
    if (!conversacion) return;
    const { data, error } = await supabase.from("conversaciones").update({ asignada_a: agenteId }).eq("id", conversacion.id).select("id");
    if (error || !data?.length) toast.error("No se pudo asignar la conversación.");
    else onCambio?.(conversacion.id, { asignada_a: agenteId });
  }

  function aplicarVariables(contenido: string): string {
    const nombre = primerNombre(conversacion?.cliente_nombre || conversacion?.identidad_nombre);
    return contenido
      .replaceAll("{{nombre}}", nombre)
      .replace(/ +([,.!?])/g, "$1")
      .replace(/ {2,}/g, " ");
  }

  async function pedirSugerencia() {
    if (!conversacion) return;
    const pedidaPara = conversacion.id;
    setSugiriendoPara(pedidaPara);
    try {
      const { texto: borrador } = await sugerirRespuesta(pedidaPara);
      // Si entretanto se abrió otro chat, el borrador se descarta: era para este contacto.
      if (idActualRef.current === pedidaPara) setTexto(borrador);
    } catch (err) {
      if (idActualRef.current === pedidaPara) toast.error(err instanceof BotApiError ? err.message : "No se pudo generar la sugerencia.");
    } finally {
      // Solo apaga su propio "Pensando…", no el de una sugerencia pedida después en otro chat.
      setSugiriendoPara((previa) => (previa === pedidaPara ? null : previa));
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!conversacion || !texto.trim()) return;

    if (modoCompositor === "nota") {
      setEnviando(true);
      const { error } = await supabase
        .from("mensajes")
        .insert({ conversacion_id: conversacion.id, rol: "humano", tipo: "nota", contenido: texto.trim(), autor_id: usuarioId });
      setEnviando(false);
      if (error) toast.error("No se pudo guardar la nota.");
      else setTexto("");
      return;
    }

    setEnviando(true);
    try {
      await enviarMensajeHumano(conversacion.id, texto.trim());
      setTexto("");
    } catch (err) {
      toast.error(err instanceof BotApiError ? err.message : "No se pudo enviar el mensaje.");
    } finally {
      setEnviando(false);
    }
  }

  async function enviarPlantilla(plantillaId: string) {
    if (!conversacion) return;
    setEnviando(true);
    try {
      await enviarPlantillaMensaje(conversacion.id, plantillaId);
    } catch (err) {
      toast.error(err instanceof BotApiError ? err.message : "No se pudo enviar la multimedia.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarRespuestaComentario() {
    if (!comentarioActivo || !textoComentario.trim()) return;
    const pedidaPara = conversacionId;
    setRespondiendoComentario(true);
    try {
      const resultado = await responderComentario(comentarioActivo.mensaje.id, { modo: comentarioActivo.modo, texto: textoComentario.trim() });
      toast.success(comentarioActivo.modo === "publico" ? "Respuesta pública enviada." : "Respuesta privada enviada.");
      if ("conversacionDmId" in resultado) {
        toast.info("Se abrió el chat privado con este contacto.", {
          action: { label: "Abrir", onClick: () => onAbrirConversacion(resultado.conversacionDmId) },
        });
      }
      // Si ya se cambió de chat, no se cierra ni se vacía un diálogo abierto en el otro.
      if (idActualRef.current === pedidaPara) {
        setComentarioActivo(null);
        setTextoComentario("");
      }
    } catch (err) {
      toast.error(err instanceof BotApiError ? err.message : "No se pudo responder el comentario.");
    } finally {
      setRespondiendoComentario(false);
    }
  }

  if (!conversacion) {
    return (
      <section className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted">Elige una conversación para verla aquí.</p>
      </section>
    );
  }

  const ventana: { abierta: boolean } | EstadoVentana = esComentario
    ? { abierta: true }
    : esWeb
      ? { abierta: false }
      : conversacion.canal === "whatsapp"
        ? { abierta: ventanaAbierta(conversacion) }
        : conversacion.canal === "tiktok"
          ? { abierta: false, motivo: "TikTok todavía no está conectado para responder desde el panel." }
          : ventanaMeta(conversacion, humanAgentAprobado);
  const puedeEnviarTexto = modoCompositor === "nota" || (!esComentario && ventana.abierta);
  const respuestasDelCanal = respuestasRapidas.filter((r) => r.activa && (!r.canal || r.canal === conversacion.canal));
  // Alguien que ya no está activo en el equipo sigue figurando con el nombre que guarda la conversación.
  const asignadaA = conversacion.asignada_a
    ? (staffPorId.get(conversacion.asignada_a) ?? {
        user_id: conversacion.asignada_a,
        nombre: conversacion.asignada_nombre ?? "Otra persona",
        rol: "",
      })
    : null;
  const enlaceWaMe = conversacion.cliente_telefono
    ? `https://wa.me/${conversacion.cliente_telefono.replace(/\D/g, "")}?text=${encodeURIComponent(
        "Hola, te escribimos de Mundo de Motos por el mensaje que nos dejaste.",
      )}`
    : null;

  return (
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-porcelain">
      {/* Cabecera */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {onVolver && (
            <button type="button" onClick={onVolver} aria-label="Volver a los chats" className="flex size-11 shrink-0 items-center justify-center text-ink hover:bg-bg-soft">
              <ArrowLeft size={20} aria-hidden />
            </button>
          )}
          <CanalIcono canal={conversacion.canal} leadAds={conversacion.hilo_externo === HILO_LEAD_ADS} size={26} />
          <button type="button" onClick={onAbrirContacto} className="min-w-0 text-left" disabled={!onAbrirContacto}>
            <h2 className="t-display truncate text-lg leading-tight">{describirIdentidad(conversacion)}</h2>
            <p className="truncate text-[11px] text-muted">
              {(conversacion.canal === "instagram" || conversacion.canal === "tiktok") && conversacion.identidad_username ? (
                <a
                  href={conversacion.canal === "instagram" ? `https://instagram.com/${conversacion.identidad_username}` : `https://www.tiktok.com/@${conversacion.identidad_username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-accent"
                  onClick={(e) => e.stopPropagation()}
                >
                  @{conversacion.identidad_username}
                </a>
              ) : (
                <>
                  {CANAL_LABEL[conversacion.canal]}
                  {conversacion.cliente_telefono ? ` · ${conversacion.cliente_telefono}` : ""}
                </>
              )}
            </p>
          </button>
        </div>

        {/* Sin shrink-0: con la ventana a medio ancho los controles se salían de la columna y tapaban la ficha. */}
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Menu
            etiqueta="Etapa"
            ancho={220}
            alinear="fin"
            claseBoton={CLASE_DISPARADOR}
            boton={
              <>
                <span aria-hidden className="size-2 rounded-full" style={{ background: ETAPA_TONO[conversacion.etapa].punto }} />
                <span className="sr-only">Etapa:</span>
                <span className="font-medium">{ETAPA_LABEL[conversacion.etapa]}</span>
                <ChevronDown size={14} aria-hidden className="text-muted" />
              </>
            }
          >
            <MenuTitulo>Etapa</MenuTitulo>
            {ETAPAS.map((e) => (
              <MenuOpcion
                key={e}
                elegida={conversacion.etapa === e}
                onElegir={() => {
                  if (e !== conversacion.etapa) void cambiarEtapa(e);
                }}
                icono={<span aria-hidden className="size-2 rounded-full" style={{ background: ETAPA_TONO[e].punto }} />}
              >
                {ETAPA_LABEL[e]}
              </MenuOpcion>
            ))}
          </Menu>
          <Menu
            etiqueta="Asignada a"
            ancho={240}
            alinear="fin"
            claseBoton={`${CLASE_DISPARADOR} max-w-[190px]`}
            boton={
              <>
                {asignadaA ? (
                  <span aria-hidden className="t-display flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] text-white">
                    {iniciales(asignadaA.nombre)}
                  </span>
                ) : (
                  <UserRoundX size={15} aria-hidden className="shrink-0 text-muted" />
                )}
                <span className="sr-only">Asignada a:</span>
                <span className="min-w-0 truncate font-medium">
                  {asignadaA ? (asignadaA.user_id === usuarioId ? "Yo" : primerNombre(asignadaA.nombre)) : "Sin asignar"}
                </span>
                <ChevronDown size={14} aria-hidden className="shrink-0 text-muted" />
              </>
            }
          >
            <MenuTitulo>Asignar a</MenuTitulo>
            {staff.map((m) => (
              <MenuOpcion
                key={m.user_id}
                elegida={conversacion.asignada_a === m.user_id}
                onElegir={() => {
                  if (m.user_id !== conversacion.asignada_a) void asignar(m.user_id);
                }}
                icono={
                  <span aria-hidden className="t-display flex size-5 items-center justify-center rounded-full bg-bg-soft text-[10px] text-ink-soft">
                    {iniciales(m.nombre)}
                  </span>
                }
              >
                {m.user_id === usuarioId ? `Yo (${primerNombre(m.nombre)})` : m.nombre}
              </MenuOpcion>
            ))}
            <MenuSeparador />
            <MenuOpcion
              elegida={conversacion.asignada_a === null}
              onElegir={() => {
                if (conversacion.asignada_a !== null) void asignar(null);
              }}
              icono={<UserRoundX size={16} strokeWidth={1.9} aria-hidden />}
            >
              Sin asignar
            </MenuOpcion>
          </Menu>
          {/* Reabrir una cerrada se hace desde la ficha, que maneja etapa, motivo y el choque con otra abierta. */}
          {!esComentario && !esWeb && conversacion.estado !== "cerrada" && (
            <label className="flex min-h-9 shrink-0 cursor-pointer select-none items-center gap-2 rounded-lg border border-line bg-porcelain px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] max-lg:min-h-11">
              <span className={`flex items-center gap-1 ${modoHumano ? "text-muted" : "text-ink"}`}>
                <Bot size={13} aria-hidden />
                Bot
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={modoHumano}
                disabled={cambiandoModo}
                onClick={() => alternarModo(!modoHumano)}
                className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-60 ${modoHumano ? "bg-accent" : "bg-line-strong"}`}
              >
                {/* left-0 es necesario: dentro de un <button> el contenido se centra, y sin él la perilla arranca en el medio y en "Yo" se sale de la pista. */}
                <span className={`absolute left-0 top-0.5 size-4 rounded-full bg-porcelain shadow-sm transition-transform ${modoHumano ? "translate-x-[18px]" : "translate-x-0.5"}`} />
              </button>
              <span className={modoHumano ? "text-ink" : "text-muted"}>Yo</span>
            </label>
          )}
          {iaApagada && !esComentario && !esWeb && (
            <span
              title="La IA de este canal está apagada en Canales: el bot no responde en ningún chat de este canal."
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"
            >
              <Bot size={12} aria-hidden />
              IA del canal apagada
            </span>
          )}
        </div>
      </div>

      {/* Mensajes */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {cargando ? (
          <div className="flex flex-col gap-3">
            <div className="h-12 w-2/3 animate-pulse bg-bg-soft" />
            <div className="ml-auto h-12 w-1/2 animate-pulse bg-bg-soft" />
            <div className="h-12 w-3/5 animate-pulse bg-bg-soft" />
          </div>
        ) : mensajes.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">Todavía no hay mensajes.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {mensajes.map((m) => (
              <Burbuja
                key={m.id}
                mensaje={m}
                staffPorId={staffPorId}
                admitePrivado={conversacion.canal === "messenger" || conversacion.canal === "instagram"}
                onResponderComentario={(mensaje, modo) => {
                  setComentarioActivo({ mensaje, modo });
                  setTextoComentario("");
                }}
              />
            ))}
            <div ref={finRef} />
          </div>
        )}
      </div>

      {/* Compositor */}
      <form onSubmit={enviar} className="relative shrink-0 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex rounded-lg border border-line bg-bg p-0.5" role="tablist" aria-label="Modo del compositor">
            {(["responder", "nota"] as ModoCompositor[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modoCompositor === m}
                onClick={() => setModoCompositor(m)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors max-lg:min-h-11 ${
                  modoCompositor === m
                    ? m === "nota"
                      ? "bg-porcelain text-amber-ink shadow-sm"
                      : "bg-porcelain text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                {m === "responder" ? <Send size={12} aria-hidden /> : <StickyNote size={12} aria-hidden />}
                {m === "responder" ? "Responder" : "Nota interna"}
              </button>
            ))}
          </div>
          {modoCompositor === "responder" && !esComentario && !esWeb && (
            <button
              type="button"
              onClick={pedirSugerencia}
              disabled={sugiriendo}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent transition-colors hover:bg-accent-soft hover:text-accent-deep disabled:opacity-50 max-lg:min-h-11"
            >
              <Sparkles size={14} aria-hidden className={sugiriendo ? "animate-pulse" : ""} />
              {sugiriendo ? "Pensando…" : "Sugerir con IA"}
            </button>
          )}
        </div>

        {modoCompositor === "responder" && !modoHumano && !esComentario && !esWeb && conversacion.estado !== "cerrada" && (
          <p className="mb-2 text-xs text-muted">
            {iaApagada ? (
              <>
                La IA de {CANAL_LABEL[conversacion.canal]} está apagada (en Canales): el bot no responde en este chat. Responde tú.
              </>
            ) : (
              <>
                El bot está atendiendo este chat. Si respondes tú, el chat pasa a <strong>Yo</strong> y el bot deja de responder;
                para devolvérselo, cambia a <strong>Bot</strong>.
              </>
            )}
          </p>
        )}
        {modoCompositor === "responder" && esComentario && (
          <p className="mb-2 rounded-lg bg-bg-soft px-3 py-2 text-xs text-ink-soft">
            Es una conversación de comentarios: responde con los botones de cada comentario, arriba.
          </p>
        )}
        {modoCompositor === "responder" && esWeb && (
          <div className="rounded-xl border border-line bg-bg px-3.5 py-3 text-xs">
            <p className="text-ink-soft">
              Este mensaje llegó por {conversacion.hilo_externo === HILO_LEAD_ADS ? "el formulario de un anuncio" : "el formulario del sitio"}: no
              se responde por aquí. Contáctalo por WhatsApp
              {conversacion.cliente_email ? " o por correo" : ""}.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {chatWhatsappId && (
                <button type="button" onClick={() => onAbrirConversacion(chatWhatsappId)} className="inline-flex items-center gap-1.5 border border-ink bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:border-accent hover:bg-accent max-lg:min-h-11">
                  <LogoMarca marca="whatsapp" size={13} />
                  Abrir su chat de WhatsApp
                </button>
              )}
              {enlaceWaMe && (
                <a href={enlaceWaMe} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-porcelain px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink transition-colors hover:border-[#1daa61] hover:text-[#12804a] max-lg:min-h-11">
                  <LogoMarca marca="whatsapp" size={13} className="text-[#1daa61]" />
                  Escribir por WhatsApp
                </a>
              )}
              {conversacion.cliente_email && (
                <a href={`mailto:${conversacion.cliente_email}`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft transition-colors hover:text-ink max-lg:min-h-11">
                  <Mail size={13} aria-hidden />
                  Responder por correo
                </a>
              )}
            </div>
          </div>
        )}
        {modoCompositor === "responder" && !esComentario && !esWeb && !ventana.abierta && (
          <div className="mb-2 rounded-lg bg-[rgba(242,165,22,0.14)] px-3 py-2 text-xs text-amber-ink">
            {conversacion.canal === "whatsapp"
              ? "Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp no permite texto libre; solo una plantilla aprobada (desde la ficha del contacto)."
              : "motivo" in ventana
                ? ventana.motivo
                : "Ventana cerrada."}
          </div>
        )}

        {selectorAtajos && respuestasDelCanal.length > 0 && (
          <div className="absolute bottom-full left-4 z-10 mb-1 max-h-56 w-72 overflow-y-auto rounded-xl border border-line bg-porcelain p-1.5 shadow-[0_12px_32px_-8px_rgba(10,15,26,0.28)]">
            {respuestasDelCanal
              .filter((r) => texto.length < 2 || r.atajo.startsWith(texto.slice(1).toLowerCase()))
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setTexto(aplicarVariables(r.contenido));
                    setSelectorAtajos(false);
                  }}
                  className="flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left hover:bg-bg-soft"
                >
                  <span className="t-mono text-xs font-semibold text-accent-deep">/{r.atajo}</span>
                  <span className="text-[11px] text-muted">{r.titulo}</span>
                </button>
              ))}
          </div>
        )}

        {(modoCompositor === "nota" || !esWeb) && (
          <div className="flex items-end gap-2">
            {modoCompositor === "responder" && !esComentario && plantillas.length > 0 && (
              <Menu
                etiqueta="Adjuntar multimedia de la biblioteca"
                soloIcono
                lado="arriba"
                ancho={280}
                deshabilitado={!ventana.abierta || enviando}
                claseBoton="inline-flex h-10 shrink-0 items-center gap-1.5 border border-line bg-porcelain px-3 text-xs text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50 aria-expanded:border-accent max-lg:h-11"
                boton={
                  <>
                    <Paperclip size={15} aria-hidden />
                    <span className="max-sm:sr-only">Adjuntar</span>
                  </>
                }
              >
                <MenuTitulo>Multimedia del bot</MenuTitulo>
                {plantillas.map((p) => (
                  <MenuAccion key={p.id} onElegir={() => void enviarPlantilla(p.id)} detalle={TIPO_ADJUNTO[p.tipo]}>
                    {p.nombre}
                  </MenuAccion>
                ))}
              </Menu>
            )}
            {/* En táctil la letra va a 16 px: iOS hace zoom al enfocar campos más chicos. */}
            <textarea
              value={texto}
              onChange={(e) => {
                const valor = e.target.value;
                setTexto(valor);
                setSelectorAtajos(modoCompositor === "responder" && valor.startsWith("/") && !esComentario);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar(e);
                }
              }}
              placeholder={
                modoCompositor === "nota"
                  ? "Escribe una nota interna — nunca se envía…"
                  : esComentario
                    ? "Usa los botones de cada comentario para responder"
                    : ventana.abierta
                      ? "Escribe tu respuesta… (/ para respuestas rápidas)"
                      : "Ventana cerrada"
              }
              disabled={!puedeEnviarTexto || enviando || (esComentario && modoCompositor === "responder")}
              rows={2}
              className="min-h-0 flex-1 resize-none border border-line bg-porcelain px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] focus:border-accent focus:ring-3 focus:ring-accent-soft disabled:opacity-60 max-lg:text-base"
            />
            <button
              type="submit"
              disabled={!puedeEnviarTexto || enviando || !texto.trim() || (esComentario && modoCompositor === "responder")}
              className={`inline-flex h-10 items-center gap-2 px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition-colors disabled:opacity-40 max-lg:h-11 ${
                modoCompositor === "nota" ? "bg-amber-ink hover:bg-[#6f4800]" : "bg-ink hover:bg-accent"
              }`}
            >
              {modoCompositor === "nota" ? <StickyNote size={14} aria-hidden /> : <Send size={14} aria-hidden />}
              {modoCompositor === "nota" ? "Guardar" : "Enviar"}
            </button>
          </div>
        )}

        {modoCompositor === "responder" && !esComentario && ventana.abierta && conversacion.canal === "whatsapp" && (
          <p className="mt-1.5 text-[11px] text-muted">Quedan ~{horasRestantesVentana(conversacion)} h de ventana para escribir libremente.</p>
        )}
        {modoCompositor === "responder" && !esComentario && ventana.abierta && "modo" in ventana && ventana.modo === "HUMAN_AGENT" && (
          <p className="mt-1.5 text-[11px] text-muted">Pasaron más de 24 horas: este mensaje sale con la etiqueta Human Agent (hasta 7 días).</p>
        )}
      </form>

      {comentarioActivo && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-ink/30 p-4 sm:items-center" onClick={() => setComentarioActivo(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-porcelain p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="t-display text-lg">Responder {comentarioActivo.modo === "publico" ? "en público" : "por privado"}</h3>
            <p className="mb-3 mt-1 text-xs text-muted">
              {comentarioActivo.modo === "privado"
                ? `Se le manda como mensaje directo de ${CANAL_LABEL[conversacion.canal]}: es la única vez que se puede usar para este comentario.`
                : "Queda visible debajo del comentario, para cualquiera que vea la publicación."}
            </p>
            <textarea
              value={textoComentario}
              onChange={(e) => setTextoComentario(e.target.value)}
              rows={3}
              placeholder="Escribe la respuesta…"
              className="w-full resize-none border border-line bg-porcelain px-3 py-2 text-sm outline-none focus:border-ink max-lg:text-base"
              autoFocus
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setComentarioActivo(null)} className="border border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] max-lg:min-h-11">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRespuestaComentario}
                disabled={respondiendoComentario || !textoComentario.trim()}
                className="border border-ink bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-porcelain disabled:opacity-40 max-lg:min-h-11"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
