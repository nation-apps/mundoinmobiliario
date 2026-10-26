/**
 * Carga de /admin/metricas. SOLO servidor: usa la sesión del staff (RLS), así
 * que no debe importarse desde un componente con "use client".
 */

import { createServerSupabase } from "@/lib/supabase/server-auth";
import { anuncioDeMensajes } from "./anuncio";
import { armarLlegadas, type ResumenConversacion } from "./llegadas";
import {
  calcularMetricas,
  rangoDelPeriodo,
  type FilaAbierta,
  type FilaMetrica,
  type Metricas,
  type MiembroEquipo,
  type PeriodoId,
} from "./metricas";

/** PostgREST devuelve hasta 1000 filas por pedido: se pide por páginas. */
const PAGINA = 1000;
/** Tope de seguridad: más que esto en un periodo y la página avisa que los números pueden quedar cortos. */
const TOPE = 20_000;

const COLUMNAS =
  "id, cliente_id, canal, origen, hilo_externo, estado, etapa, motivo_cierre, motivo_perdida, asignada_a, fuente, created_at, primera_respuesta_at, primera_respuesta_humana_at";

type Pagina<T> = (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function todas<T>(pedir: Pagina<T>): Promise<{ filas: T[]; truncado: boolean }> {
  const filas: T[] = [];
  for (let desde = 0; desde < TOPE; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}

export type ResultadoMetricas = { ok: true; metricas: Metricas } | { ok: false; error: string };

export async function cargarMetricas(periodo: PeriodoId): Promise<ResultadoMetricas> {
  try {
    const supabase = await createServerSupabase();
    const rango = rangoDelPeriodo(periodo, new Date());

    const [conversaciones, abiertas, equipo] = await Promise.all([
      todas<FilaMetrica>((desde, hasta) =>
        supabase
          .from("conversaciones")
          .select(COLUMNAS)
          .gte("created_at", rango.previoInicio.toISOString())
          .lte("created_at", rango.fin.toISOString())
          .order("created_at", { ascending: true })
          .range(desde, hasta),
      ),
      todas<FilaAbierta>((desde, hasta) =>
        supabase
          .from("conversaciones_resumen")
          .select("id, asignada_a, ultimo_rol, estado")
          .neq("estado", "cerrada")
          .order("id")
          .range(desde, hasta),
      ),
      supabase.from("staff").select("user_id, nombre, rol, activo"),
    ]);
    if (equipo.error) throw new Error(equipo.error.message);

    // De qué anuncio vino cada lead: lo dicen los primeros mensajes (formulario de anuncios o clic a WhatsApp).
    const mensajesConAnuncio = await todas<{ conversacion_id: string; metadata: Record<string, unknown> | null; created_at: string; contenido: string | null }>((desde, hasta) =>
      supabase
        .from("mensajes")
        .select("conversacion_id, metadata, created_at, contenido")
        // También los formularios sin anuncio: son llegadas aunque Meta todavía no diga de qué anuncio vinieron.
        .or("metadata->>ad_id.not.is.null,metadata->anuncio->>id.not.is.null,metadata->>leadgen_id.not.is.null")
        .gte("created_at", rango.previoInicio.toISOString())
        .order("created_at", { ascending: true })
        .range(desde, hasta),
    );
    const anuncioPorConversacion = new Map<string, ReturnType<typeof anuncioDeMensajes>>();
    for (const m of mensajesConAnuncio.filas) {
      if (anuncioPorConversacion.has(m.conversacion_id)) continue; // el primero es el que trajo al lead
      const anuncio = anuncioDeMensajes([m.metadata]);
      if (anuncio) anuncioPorConversacion.set(m.conversacion_id, anuncio);
    }
    // Los contactos con la etiqueta «Prueba» (números del equipo para probar) no cuentan en ninguna métrica.
    const prueba = await clientesDePrueba(supabase);
    const ini = rango.inicio.getTime();
    const finMs = rango.fin.getTime();
    const pruebasExcluidas = conversaciones.filas.filter((f) => f.cliente_id && prueba.has(f.cliente_id) && Date.parse(f.created_at) >= ini && Date.parse(f.created_at) <= finMs).length;
    const filas = conversaciones.filas.filter((f) => !(f.cliente_id && prueba.has(f.cliente_id))).map((f) => {
      const anuncio = anuncioPorConversacion.get(f.id);
      return anuncio?.id ? { ...f, anuncio_id: anuncio.id, anuncio_nombre: anuncio.nombre, anuncio_campana: anuncio.campana } : f;
    });

    const filasAnuncio = await filasPorAnuncio(supabase, rango, filas, mensajesConAnuncio.filas, prueba);
    const llegadas = await cargarLlegadas(supabase, rango, filas, mensajesConAnuncio.filas, prueba);

    return {
      ok: true,
      metricas: {
        ...calcularMetricas({
        periodo,
        rango,
        filas,
        filasAnuncio,
        abiertas: abiertas.filas,
        equipo: (equipo.data ?? []) as MiembroEquipo[],
        truncado: conversaciones.truncado || abiertas.truncado || mensajesConAnuncio.truncado,
        }),
        llegadas,
        pruebasExcluidas,
      },
    };
  } catch (err) {
    console.error("[metricas] No se pudieron calcular:", err);
    return { ok: false, error: "No se pudieron leer las conversaciones. Recarga la página en un momento." };
  }
}

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * «Por anuncio» contado como lo cuenta Meta: una fila por cada llegada desde un anuncio en el periodo (un formulario enviado o un
 * mensaje de clic a WhatsApp), una sola vez por conversación y anuncio, aunque la conversación sea anterior (p. ej. alguien que ya
 * escribía y hoy llenó un formulario). Las conversaciones nuevas del periodo sin ningún anuncio van como «sin anuncio».
 */
async function filasPorAnuncio(
  supabase: Supabase,
  rango: { inicio: Date; fin: Date },
  filas: FilaMetrica[],
  mensajes: { conversacion_id: string; metadata: Record<string, unknown> | null; created_at: string }[],
  prueba: Set<string>,
): Promise<FilaMetrica[]> {
  const ini = rango.inicio.getTime();
  const fin = rango.fin.getTime();
  const enPeriodo = (iso: string) => {
    const t = Date.parse(iso);
    return t >= ini && t <= fin;
  };

  const llegadas = new Map<string, { conversacionId: string; anuncio: NonNullable<ReturnType<typeof anuncioDeMensajes>>; tipo: "formulario" | "whatsapp" }>();
  for (const m of mensajes) {
    if (!enPeriodo(m.created_at)) continue;
    const anuncio = anuncioDeMensajes([m.metadata]);
    if (!anuncio?.id) continue;
    // Un formulario y un chat de la misma persona desde el mismo anuncio son dos resultados para Meta: se cuentan los dos.
    const tipo = typeof m.metadata?.leadgen_id === "string" ? "formulario" : "whatsapp";
    const clave = `${m.conversacion_id}|${anuncio.id}|${tipo}`;
    if (!llegadas.has(clave)) llegadas.set(clave, { conversacionId: m.conversacion_id, anuncio, tipo });
  }

  // Las conversaciones de esas llegadas que no están entre las del periodo (son anteriores): se traen aparte.
  const porId = new Map(filas.map((f) => [f.id, f]));
  const faltan = [...new Set([...llegadas.values()].map((l) => l.conversacionId))].filter((id) => !porId.has(id));
  for (let i = 0; i < faltan.length; i += 100) {
    const { data, error } = await supabase.from("conversaciones").select(COLUMNAS).in("id", faltan.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as FilaMetrica[]) porId.set(f.id, f);
  }

  const resultado: FilaMetrica[] = [];
  const conAnuncio = new Set<string>();
  for (const { conversacionId, anuncio, tipo } of llegadas.values()) {
    const f = porId.get(conversacionId);
    if (!f || (f.cliente_id && prueba.has(f.cliente_id))) continue;
    conAnuncio.add(conversacionId);
    resultado.push({ ...f, anuncio_id: anuncio.id, anuncio_nombre: anuncio.nombre, anuncio_campana: anuncio.campana, llegada_tipo: tipo });
  }
  for (const f of filas) {
    if (enPeriodo(f.created_at) && !conAnuncio.has(f.id) && !f.anuncio_id) resultado.push(f);
  }
  return resultado;
}

/** Los clientes con una etiqueta que se llame «Prueba» (o la contenga): números del equipo para probar. */
async function clientesDePrueba(supabase: Supabase): Promise<Set<string>> {
  const { data: etiquetas, error } = await supabase.from("etiquetas").select("id").ilike("nombre", "%prueba%");
  if (error || !etiquetas?.length) return new Set();
  const { data } = await supabase
    .from("cliente_etiquetas")
    .select("cliente_id")
    .in(
      "etiqueta_id",
      etiquetas.map((e: { id: string }) => e.id),
    );
  return new Set(((data ?? []) as { cliente_id: string }[]).map((r) => r.cliente_id));
}

/** De a 100 ids por pedido (van en la URL). */
async function porTandas<T>(ids: string[], pedir: (tanda: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await pedir(ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
  }
  return filas;
}

/** «Llegadas por anuncio»: una fila por persona que llegó en el periodo, con cómo llegó (ver llegadas.ts). */
async function cargarLlegadas(
  supabase: Supabase,
  rango: { inicio: Date; fin: Date },
  filas: FilaMetrica[],
  mensajes: { conversacion_id: string; metadata: Record<string, unknown> | null; created_at: string; contenido: string | null }[],
  prueba: Set<string>,
) {
  const ini = rango.inicio.getTime();
  const fin = rango.fin.getTime();
  const conAnuncio = new Set(mensajes.map((m) => m.conversacion_id));
  const whatsappSinAnuncio = filas.filter((f) => {
    const t = Date.parse(f.created_at);
    return f.canal === "whatsapp" && t >= ini && t <= fin && !conAnuncio.has(f.id);
  });

  // Quién escribió primero en esos chats: si fue el vendedor, la persona no había escrito (no se sabe de qué anuncio vino).
  const primeros = await porTandas<{ conversacion_id: string; rol: string; created_at: string }>(
    whatsappSinAnuncio.map((f) => f.id),
    (tanda) => supabase.from("mensajes").select("conversacion_id, rol, created_at").in("conversacion_id", tanda).eq("tipo", "mensaje").order("created_at", { ascending: true }).limit(5000),
  );
  const primerRol = new Map<string, string>();
  for (const m of primeros) if (!primerRol.has(m.conversacion_id)) primerRol.set(m.conversacion_id, m.rol);

  const enPeriodo = mensajes.filter((m) => {
    const t = Date.parse(m.created_at);
    return t >= ini && t <= fin;
  });
  const ids = [...new Set([...enPeriodo.map((m) => m.conversacion_id), ...whatsappSinAnuncio.map((f) => f.id)])];
  const resumen = await porTandas<ResumenConversacion & { id: string }>(ids, (tanda) =>
    supabase.from("conversaciones_resumen").select("id, cliente_id, cliente_nombre, cliente_telefono, asignada_nombre, etapa").in("id", tanda),
  );

  return armarLlegadas({
    desde: ini,
    hasta: fin,
    mensajes: enPeriodo,
    whatsappSinAnuncio: whatsappSinAnuncio.map((f) => ({ id: f.id, created_at: f.created_at, primerRol: primerRol.get(f.id) ?? null })),
    resumen: new Map(resumen.map((r) => [r.id, r])),
    prueba,
  });
}
