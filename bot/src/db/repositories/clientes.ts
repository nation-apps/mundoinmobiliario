import { supabase } from "../client.js";
import { normalizarTelefono, variantesTelefono } from "../../lib/telefono.js";

export type CanalOrigen = "whatsapp" | "messenger" | "instagram" | "tiktok" | "web" | "manual";

/** Canales por los que puede aparecer alguien SIN teléfono (se le conoce solo por su identidad en ese canal). */
export type CanalLead = "messenger" | "instagram" | "tiktok";

/** 'prospecto' hasta que compra; lo pasa a 'cliente' el trigger de cierre ganado, o el staff a mano. */
/** Lo que el cliente va contando de su situación como inversionista; todo opcional, se completa conforme avanza el chat. */
export type PerfilInversionista = {
  experiencia?: string | undefined;
  objetivo?: string | undefined;
  capital?: string | undefined;
  plazo?: string | undefined;
  ubicacion?: string | undefined;
  notas?: string | undefined;
};

export type TipoCliente = "prospecto" | "cliente" | "ex_cliente";

/** Mismo check que `clientes.interes` (0001_nucleo.sql). */
export const INTERESES = ["seminario", "programa_avanzado", "mentoria", "master", "libro", "otro"] as const;
export type Interes = (typeof INTERESES)[number];

/**
 * La tabla `clientes` es la misma que usan las reservas del sitio
 * (0001_base_schema.sql) más las columnas que agrega 0006 para el bot.
 */
export type Cliente = {
  id: string;
  /** Null para un lead de Instagram/Messenger hasta que da su número. Formato 52 + 10 dígitos. */
  telefono: string | null;
  nombre: string | null;
  email: string | null;
  notas: string | null;
  /** Lo que busca, ordenado (operación, tipo, zona, presupuesto…). Lo escribe guardar_perfil_busqueda. */
  perfil: PerfilInversionista;
  canal_origen: CanalOrigen;
  tipo: TipoCliente;
  interes: Interes | null;
  created_at: string;
  updated_at: string;
};

/**
 * Busca un cliente por su teléfono (wa_id de Meta); lo crea si no existe.
 * `canalOrigen` solo se usa al crear.
 */
export async function findOrCreateByPhone(telefonoCrudo: string, nombre?: string, canalOrigen: CanalOrigen = "whatsapp"): Promise<Cliente> {
  // En la base el teléfono se guarda normalizado (52 + 10 dígitos en México), pero Meta puede entregar el móvil con o
  // sin el "1" después del 52: se busca por las dos formas para no duplicar la ficha.
  const telefono = normalizarTelefono(telefonoCrudo) ?? telefonoCrudo;
  const { data: existing, error: findError } = await supabase.from("clientes").select("*").in("telefono", variantesTelefono(telefono)).maybeSingle();
  if (findError) throw findError;
  if (existing) return existing as Cliente;

  const { data: created, error: insertError } = await supabase
    .from("clientes")
    .insert({ telefono, nombre: nombre ?? null, canal_origen: canalOrigen })
    .select("*")
    .single();

  if (insertError) {
    // 23505 = unique_violation: dos mensajes del mismo número llegaron casi
    // a la vez. El que perdió la carrera relee la fila que el otro insertó.
    if (insertError.code === "23505") {
      const { data: retried, error: retryError } = await supabase.from("clientes").select("*").in("telefono", variantesTelefono(telefono)).single();
      if (retryError) throw retryError;
      return retried as Cliente;
    }
    throw insertError;
  }
  return created as Cliente;
}

/** Un lead que llega por Messenger o Instagram: sin teléfono todavía. */
export async function crearClienteLead(params: { nombre: string | null; canalOrigen: CanalLead }): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .insert({ nombre: params.nombre, canal_origen: params.canalOrigen })
    .select("*")
    .single();
  if (error) throw error;
  return data as Cliente;
}

/**
 * Lo que manda el formulario del sitio (POST /public/leads). Si el teléfono
 * ya existe, solo se completan los datos que faltaban.
 */
export async function registrarLeadWeb(params: {
  telefono: string;
  nombre: string;
  email?: string | undefined;
  interes?: Interes | undefined;
}): Promise<Cliente> {
  const existente = await getClienteByTelefono(params.telefono);
  if (existente) {
    const completar: Partial<Pick<Cliente, "nombre" | "email" | "interes">> = {};
    if (!existente.nombre) completar.nombre = params.nombre;
    if (!existente.email && params.email) completar.email = params.email;
    if (!existente.interes && params.interes) completar.interes = params.interes;
    if (Object.keys(completar).length === 0) return existente;

    const { data, error } = await supabase.from("clientes").update(completar).eq("id", existente.id).select("*").single();
    if (error) throw error;
    return data as Cliente;
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      telefono: params.telefono,
      nombre: params.nombre,
      email: params.email ?? null,
      canal_origen: "web",
      interes: params.interes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const ganador = await getClienteByTelefono(params.telefono);
      if (ganador) return ganador;
    }
    throw error;
  }
  return data as Cliente;
}

export async function guardarEmailCliente(clienteId: string, email: string): Promise<void> {
  const { error } = await supabase.from("clientes").update({ email }).eq("id", clienteId);
  if (error) throw error;
}

export async function guardarNombreCliente(clienteId: string, nombre: string): Promise<void> {
  const { error } = await supabase.from("clientes").update({ nombre }).eq("id", clienteId);
  if (error) throw error;
}

export async function guardarInteresCliente(clienteId: string, interes: Interes): Promise<void> {
  const { error } = await supabase.from("clientes").update({ interes }).eq("id", clienteId);
  if (error) throw error;
}

/**
 * Escribe el teléfono directo — quien llama ya confirmó que no pertenece a
 * otro cliente. El trigger `clientes_telefono_califica` hace el resto.
 */
export async function guardarTelefonoCliente(clienteId: string, telefono: string): Promise<void> {
  const { error } = await supabase.from("clientes").update({ telefono }).eq("id", clienteId);
  if (error) throw error;
}

export async function getClienteByTelefono(telefono: string): Promise<Cliente | null> {
  const { data, error } = await supabase.from("clientes").select("*").in("telefono", variantesTelefono(telefono)).maybeSingle();
  if (error) throw error;
  return data as Cliente | null;
}

/** `fusionar_clientes` (función SQL de 0006) mueve identidades, conversaciones, citas y ventas y borra el origen. */
export async function fusionarClientes(origenId: string, destinoId: string): Promise<void> {
  const { error } = await supabase.rpc("fusionar_clientes", { p_origen: origenId, p_destino: destinoId });
  if (error) throw error;
}

export async function getClienteById(id: string): Promise<Cliente | null> {
  const { data, error } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Cliente | null;
}

/**
 * Mezcla lo nuevo con el perfil que ya había (lo ya guardado no se pierde si el modelo manda solo un campo).
 * Un campo vacío no borra nada.
 */
export async function guardarPerfilCliente(clienteId: string, nuevo: PerfilInversionista): Promise<PerfilInversionista> {
  const { data, error: leerError } = await supabase.from("clientes").select("perfil").eq("id", clienteId).single();
  if (leerError) throw leerError;
  const actual = ((data as { perfil: PerfilInversionista | null } | null)?.perfil ?? {}) as PerfilInversionista;
  const limpio = Object.fromEntries(Object.entries(nuevo).filter(([, v]) => typeof v === "string" && v.trim() !== "")) as PerfilInversionista;
  const perfil = { ...actual, ...limpio };
  const { error } = await supabase.from("clientes").update({ perfil }).eq("id", clienteId);
  if (error) throw error;
  return perfil;
}
