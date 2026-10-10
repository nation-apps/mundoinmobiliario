"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import CanalIcono from "@/components/admin/chats/CanalIcono";
import { fechaHoraLima } from "@/components/admin/clientes/formato";
import { BotApiError, estadoCanales } from "@/lib/admin/bot-api";
import {
  BOT_PUBLIC_URL,
  CANALES_CONFIGURABLES,
  CANAL_LABEL,
  type CanalConfig,
  type CanalConfigurable,
  type CanalesProps,
  type EstadoCanales,
} from "@/lib/admin/chats-tipos";
import { createBrowserSupabase } from "@/lib/supabase/client";

const COLUMNAS =
  "canal, activo, ia_activa, ia_comentarios_activa, texto_respuesta_privada, cuenta_id, cuenta_nombre, ultimo_webhook_at";

/** Lo único que esta página escribe en public.canales. */
type CambioCanal = Partial<
  Pick<CanalConfig, "activo" | "ia_activa" | "ia_comentarios_activa" | "texto_respuesta_privada">
>;

/** Para qué sirve cada canal en Mundo Motos: lo primero que lee quien entra aquí. */
const PARA_QUE: Record<CanalConfigurable, string> = {
  whatsapp: "Canal principal: cotizaciones, crédito y dudas sobre las motos y el taller.",
  messenger: "Mensajes y comentarios de la página de Facebook.",
  instagram: "Mensajes directos y comentarios de la cuenta de Instagram del negocio.",
  tiktok: "Todavía no conectado: los comentarios se atienden desde la app de TikTok.",
};

const TOKEN_OCULTO = "••••••••••••";

function ordenar(filas: CanalConfig[]): CanalConfig[] {
  return filas
    .filter((fila) => CANALES_CONFIGURABLES.includes(fila.canal))
    .sort((a, b) => CANALES_CONFIGURABLES.indexOf(a.canal) - CANALES_CONFIGURABLES.indexOf(b.canal));
}

/* ---------- Piezas pequeñas ---------- */

type Tono = "bien" | "neutro" | "aviso" | "mal";

const TONO: Record<Tono, { fondo: string; texto: string }> = {
  bien: { fondo: "rgba(12,163,12,0.10)", texto: "#0a7d0a" },
  neutro: { fondo: "rgba(29,19,21,0.06)", texto: "#8d7b76" },
  aviso: { fondo: "rgba(242,165,22,0.18)", texto: "#8a5a00" },
  mal: { fondo: "rgba(212,32,41,0.10)", texto: "#a3161d" },
};

/** Mismo dibujo que `EstadoBadge` de ui.tsx; el texto siempre dice el estado. */
function Insignia({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ background: TONO[tono].fondo, color: TONO[tono].texto }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Interruptor con el mismo dibujo que el Bot/Yo de Hilo.tsx; todo el renglón lo dispara. */
function Interruptor({
  etiqueta,
  activo,
  deshabilitado,
  onCambiar,
}: {
  etiqueta: string;
  activo: boolean;
  deshabilitado?: boolean;
  onCambiar: (valor: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-4 text-sm text-ink">
      <span>{etiqueta}</span>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        disabled={deshabilitado}
        onClick={() => onCambiar(!activo)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          activo ? "bg-accent" : "bg-line-strong"
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 size-4 rounded-full bg-porcelain shadow-sm transition-transform ${
            activo ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function Datos({ filas }: { filas: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
      {filas.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="contents">
          <dt className="text-muted">{etiqueta}</dt>
          <dd className="break-words text-right text-ink">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Tarjeta de un canal ---------- */

/** Lo que el bot y la base saben de la cuenta conectada, en filas listas para mostrar. */
function filasDe(config: CanalConfig, estado: EstadoCanales | null): [string, string][] {
  const filas: [string, string][] = [];

  if (config.canal === "whatsapp") {
    // El bot devuelve el Phone Number ID de Meta, no un teléfono.
    if (estado) filas.push(["ID del número (Meta)", estado.whatsapp?.numero ?? "—"]);
    if (config.cuenta_nombre) filas.push(["Cuenta", config.cuenta_nombre]);
    if (estado) {
      filas.push(["Plantillas (WABA)", estado.whatsapp?.plantillasDisponibles ? "Disponibles" : "Falta el WABA ID"]);
    }
  } else if (config.canal === "messenger") {
    const pagina = estado?.messenger?.pagina ?? config.cuenta_nombre;
    if (estado || pagina) filas.push(["Página", pagina ?? "—"]);
    if (estado) {
      filas.push(["Webhook suscrito", estado.messenger?.suscrito ? "Sí" : "No"]);
      // Sin fecha y con la página detectada = token permanente.
      const vence = estado.messenger?.tokenVence;
      filas.push(["Token vence", vence ? fechaHoraLima(vence) : estado.messenger?.pagina ? "No vence" : "—"]);
    }
  } else if (config.canal === "instagram") {
    const usuario = estado?.instagram?.username;
    const cuenta = usuario ? `@${usuario}` : config.cuenta_nombre;
    if (estado || cuenta) filas.push(["Cuenta", cuenta ?? "—"]);
  } else if (config.cuenta_nombre) {
    filas.push(["Cuenta", config.cuenta_nombre]);
  }

  filas.push([
    "Último evento recibido",
    config.ultimo_webhook_at ? fechaHoraLima(config.ultimo_webhook_at) : "Todavía ninguno",
  ]);
  return filas;
}

function explicacion(config: CanalConfig): string {
  const base = !config.activo
    ? "Con el canal apagado, los mensajes siguen llegando a Chats, pero el bot no responde ni envía respuestas privadas."
    : config.ia_activa
      ? "Con la IA encendida, los mensajes nuevos se responden solos; el equipo puede tomar cualquier conversación desde Chats."
      : "Con la IA apagada, los mensajes nuevos quedan en Chats como sin responder: alguien del equipo tiene que contestarlos.";
  return config.canal === "tiktok"
    ? `${base} TikTok todavía no está conectado: los interruptores quedan guardados para cuando lo esté.`
    : base;
}

function TarjetaCanal({
  config,
  estado,
  estadoCargando,
  onCambiar,
}: {
  config: CanalConfig;
  estado: EstadoCanales | null;
  estadoCargando: boolean;
  onCambiar: (cambio: CambioCanal) => Promise<void>;
}) {
  const textoGuardado = config.texto_respuesta_privada ?? "";
  const [texto, setTexto] = useState(textoGuardado);
  const [textoPrevio, setTextoPrevio] = useState(textoGuardado);
  const [guardando, setGuardando] = useState(false);
  // Aparte del de los interruptores: si guardar el texto (al salir del
  // recuadro) los deshabilitara, el clic que provocó ese blur se perdería.
  const [guardandoTexto, setGuardandoTexto] = useState(false);

  // Si el texto cambió en la base (otra persona, realtime o un rollback),
  // el borrador se pone al día sin pasar por un efecto.
  if (textoPrevio !== textoGuardado) {
    setTextoPrevio(textoGuardado);
    setTexto(textoGuardado);
  }

  const esMeta = config.canal === "messenger" || config.canal === "instagram";
  const configurado = estado ? Boolean(estado[config.canal]?.configurado) : null;

  async function cambiar(cambio: CambioCanal) {
    setGuardando(true);
    await onCambiar(cambio);
    setGuardando(false);
  }

  async function guardarTexto() {
    const limpio = texto.trim();
    if (limpio === textoGuardado) {
      if (texto !== limpio) setTexto(limpio);
      return;
    }
    setGuardandoTexto(true);
    await onCambiar({ texto_respuesta_privada: limpio || null });
    setGuardandoTexto(false);
  }

  return (
    <section className="admin-card flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-display flex items-center gap-2.5 text-xl leading-none">
          <CanalIcono canal={config.canal} size={22} />
          {CANAL_LABEL[config.canal]}
        </h2>
        {estadoCargando ? (
          <Insignia tono="neutro">Consultando…</Insignia>
        ) : configurado === null ? (
          <Insignia tono="aviso">Estado desconocido</Insignia>
        ) : configurado ? (
          <Insignia tono="bien">Conectado</Insignia>
        ) : (
          <Insignia tono="neutro">Sin configurar</Insignia>
        )}
      </header>

      <p className="text-[13px] leading-relaxed text-ink-soft">{PARA_QUE[config.canal]}</p>

      <Datos filas={filasDe(config, estado)} />

      <div className="flex flex-col border-t border-line pt-2">
        <Interruptor
          etiqueta="Canal activo"
          activo={config.activo}
          deshabilitado={guardando}
          onCambiar={(valor) => void cambiar({ activo: valor })}
        />
        <Interruptor
          etiqueta="IA responde mensajes"
          activo={config.ia_activa}
          deshabilitado={guardando}
          onCambiar={(valor) => void cambiar({ ia_activa: valor })}
        />
        {config.canal !== "whatsapp" && (
          <Interruptor
            etiqueta="IA responde comentarios por privado"
            activo={config.ia_comentarios_activa}
            deshabilitado={guardando}
            onCambiar={(valor) => void cambiar({ ia_comentarios_activa: valor })}
          />
        )}
        <p className="mt-1 text-xs leading-relaxed text-muted">{explicacion(config)}</p>
      </div>

      {esMeta && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <label htmlFor={`respuesta-privada-${config.canal}`} className="admin-label">
            Respuesta privada automática al comentario
          </label>
          <textarea
            id={`respuesta-privada-${config.canal}`}
            className="admin-input"
            rows={3}
            placeholder="¡Gracias por comentar! Te escribimos por privado con la información…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => void guardarTexto()}
            disabled={guardandoTexto}
          />
          <p className="text-xs leading-relaxed text-muted">
            Se envía una sola vez por comentario (Meta no permite una segunda) y se guarda al salir del recuadro.
          </p>
          {config.ia_comentarios_activa && !textoGuardado && (
            <p className="text-xs leading-relaxed" style={{ color: TONO.aviso.texto }}>
              El interruptor de comentarios está encendido, pero sin este texto no se envía nada.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- Formulario web y bot ---------- */

/**
 * El formulario del sitio no tiene fila en `canales` (no hay nada que
 * prender). Esta tarjeta lo junta con las piezas del bot que no son un canal
 * y es donde se ve si el bot contesta.
 */
function TarjetaWeb({
  estado,
  estadoCargando,
  errorBot,
  onReintentar,
}: {
  estado: EstadoCanales | null;
  estadoCargando: boolean;
  errorBot: string | null;
  onReintentar: () => void;
}) {
  const siNo = (valor: boolean | undefined) => (valor === undefined ? "—" : valor ? "Sí" : "No");

  return (
    <section className="admin-card flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="t-display flex items-center gap-2.5 text-xl leading-none">
          <CanalIcono canal="web" size={22} />
          Formulario web y bot
        </h2>
        {estadoCargando ? (
          <Insignia tono="neutro">Consultando…</Insignia>
        ) : estado ? (
          <Insignia tono="bien">Bot en línea</Insignia>
        ) : (
          <Insignia tono="mal">Sin conexión con el bot</Insignia>
        )}
      </header>

      <p className="text-[13px] leading-relaxed text-ink-soft">
        Cada envío del formulario de contacto del sitio, y de los formularios de anuncios de Facebook e Instagram, entra a
        Chats como una conversación «Web». No se responde por ahí: desde la conversación se le escribe por WhatsApp.
      </p>

      <Datos
        filas={[
          ["Formulario protegido con token", siNo(estado?.web?.protegido)],
          ["Formularios de anuncios: aviso de Meta suscrito", siNo(estado?.formulariosAnuncios?.suscrito)],
          ["Formularios de anuncios: permiso para leer leads", siNo(estado?.formulariosAnuncios?.permiso)],
          ["IA configurada", siNo(estado?.ia?.configurada)],
          ["Human Agent aprobado por Meta", siNo(estado?.metaHumanAgentAprobado)],
        ]}
      />

      {!estadoCargando && !estado && (
        <div className="flex flex-col items-start gap-3 border-t border-line pt-4">
          <p className="text-xs leading-relaxed text-ink-soft">
            {errorBot ?? "No se pudo consultar al bot."} Los interruptores de esta página se guardan igual: el bot los
            lee cuando vuelve a estar en línea.
          </p>
          <button type="button" onClick={onReintentar} className="admin-btn ghost max-lg:min-h-11">
            Volver a consultar
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------- Bloque "Copiar en Meta" ---------- */

async function copiar(valor: string) {
  try {
    await navigator.clipboard.writeText(valor);
    toast.success("Copiado");
  } catch {
    toast.error("No se pudo copiar. Inténtalo otra vez.");
  }
}

function FilaCopiar({
  etiqueta,
  valor,
  secreto = false,
  sinValor,
  ayuda,
}: {
  etiqueta: string;
  /** null = todavía no hay nada que copiar. */
  valor: string | null;
  /** Se muestra enmascarado hasta que el staff pide verlo. */
  secreto?: boolean;
  sinValor?: string;
  ayuda?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const enmascarado = secreto && !visible;

  return (
    <div className="flex flex-col gap-3 border-t border-line py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <span className="admin-label">{etiqueta}</span>
        {valor === null ? (
          <p className="text-sm text-muted">{sinValor ?? "No disponible"}</p>
        ) : enmascarado ? (
          <p className="font-mono text-sm tracking-widest text-ink" aria-label="Valor oculto">
            {TOKEN_OCULTO}
          </p>
        ) : (
          <p className="break-all font-mono text-sm text-ink">{valor}</p>
        )}
        {ayuda && <p className="mt-1.5 text-xs leading-relaxed text-muted">{ayuda}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {secreto && (
          <button
            type="button"
            disabled={valor === null}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
            className="admin-btn ghost max-lg:min-h-11"
          >
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        )}
        <button
          type="button"
          disabled={valor === null}
          onClick={() => {
            if (valor !== null) void copiar(valor);
          }}
          className="admin-btn max-lg:min-h-11"
        >
          Copiar
        </button>
      </div>
    </div>
  );
}

function CopiarEnMeta({ estado, estadoCargando }: { estado: EstadoCanales | null; estadoCargando: boolean }) {
  const webhooks = estado?.webhooks;
  const token = webhooks?.verifyToken ?? null;
  const tokenMeta = webhooks?.verifyTokenMeta ?? null;
  const ayudaToken = (
    <>
      En el panel de Meta aparece como <em>Verify token</em>.
    </>
  );

  return (
    <section className="admin-card p-5 md:col-span-2">
      <h2 className="t-display text-xl leading-none">Copiar en Meta</h2>
      <p className="mb-4 mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
        Lo que se pega en Meta for Developers al configurar los webhooks de WhatsApp y de Messenger / Instagram.
        {!estadoCargando && !webhooks && " El bot no informó sus direcciones: se muestran las habituales."}
      </p>

      <FilaCopiar etiqueta="URL del webhook de WhatsApp" valor={webhooks?.whatsapp ?? `${BOT_PUBLIC_URL}/webhook`} />
      <FilaCopiar
        etiqueta="URL del webhook de Messenger / Instagram"
        valor={webhooks?.meta ?? `${BOT_PUBLIC_URL}/webhook/meta`}
      />
      <FilaCopiar
        etiqueta="Token de verificación"
        valor={token}
        secreto
        sinValor={
          estadoCargando
            ? "Consultando al bot…"
            : "Se muestra cuando el bot está en línea y tiene WHATSAPP_VERIFY_TOKEN cargado"
        }
        ayuda={ayudaToken}
      />
      {tokenMeta !== null && tokenMeta !== token && (
        <FilaCopiar
          etiqueta="Token de verificación (Messenger / Instagram)"
          valor={tokenMeta}
          secreto
          ayuda={ayudaToken}
        />
      )}

      <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
        Los tokens de acceso, el app secret y el PIN nunca se guardan en la base ni se muestran aquí: viven solo en las
        variables de Railway.
      </p>
    </section>
  );
}

/* ---------- Página ---------- */

export default function Canales({ inicial }: CanalesProps) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [configs, setConfigs] = useState<CanalConfig[]>(() => ordenar(inicial));
  // Nunca `estadoCanales`: así se llama la función importada de bot-api.ts.
  const [estado, setEstado] = useState<EstadoCanales | null>(null);
  const [estadoCargando, setEstadoCargando] = useState(true);
  const [errorBot, setErrorBot] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  // Estado real de cada canal según el bot. Si el bot está caído o sin
  // configurar, la página sigue funcionando con lo que hay en la base.
  useEffect(() => {
    let vivo = true;
    estadoCanales()
      .then((respuesta) => {
        if (!vivo) return;
        setEstado(respuesta);
        setErrorBot(null);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        setEstado(null);
        setErrorBot(err instanceof BotApiError ? err.message : "No se pudo consultar al bot.");
      })
      .finally(() => {
        if (vivo) setEstadoCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [intento]);

  // Los interruptores se ven al día aunque los cambie otra persona, y
  // `ultimo_webhook_at` avanza solo cuando el bot recibe un evento.
  useEffect(() => {
    let vivo = true;
    async function recargar() {
      const { data, error } = await supabase.from("canales").select(COLUMNAS);
      if (!vivo || error || !data) return;
      setConfigs(ordenar(data as CanalConfig[]));
    }
    // Sufijo propio de cada suscripción: el cliente de tiempo real devuelve el
    // canal anterior (que aún se está cerrando) si el nombre coincide.
    const sufijo = Math.random().toString(36).slice(2, 8);
    const suscripcion = supabase
      .channel(`canales-config-${sufijo}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "canales" }, () => {
        void recargar();
      })
      .subscribe();
    return () => {
      vivo = false;
      void supabase.removeChannel(suscripcion);
    };
  }, [supabase]);

  function reintentar() {
    setEstadoCargando(true);
    setIntento((n) => n + 1);
  }

  async function actualizarCanal(canal: CanalConfigurable, cambio: CambioCanal) {
    const anterior = configs.find((c) => c.canal === canal);
    if (!anterior) return;

    setConfigs((filas) => filas.map((c) => (c.canal === canal ? { ...c, ...cambio } : c)));

    // RLS no lanza error cuando no deja escribir: devuelve 0 filas.
    const { data, error } = await supabase.from("canales").update(cambio).eq("canal", canal).select("canal");
    if (error || !data?.length) {
      // Se deshacen solo los campos de este cambio, no la fila entera.
      const deshacer = Object.fromEntries(
        (Object.keys(cambio) as (keyof CambioCanal)[]).map((campo) => [campo, anterior[campo]]),
      ) as CambioCanal;
      setConfigs((filas) => filas.map((c) => (c.canal === canal ? { ...c, ...deshacer } : c)));
      toast.error("No se pudo guardar el cambio.");
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {configs.length === 0 ? (
        <section className="admin-card px-6 py-12 text-center md:col-span-2">
          <p className="text-sm text-muted">
            No hay canales en la base. Aplica la migración 0006_bot_omnicanal.sql en Supabase y vuelve a cargar la
            página.
          </p>
        </section>
      ) : (
        configs.map((config) => (
          <TarjetaCanal
            key={config.canal}
            config={config}
            estado={estado}
            estadoCargando={estadoCargando}
            onCambiar={(cambio) => actualizarCanal(config.canal, cambio)}
          />
        ))
      )}

      <TarjetaWeb estado={estado} estadoCargando={estadoCargando} errorBot={errorBot} onReintentar={reintentar} />

      <CopiarEnMeta estado={estado} estadoCargando={estadoCargando} />
    </div>
  );
}
