import { env } from "./env.js";

/** Marca de un dato que el negocio todavía no entregó. El prompt la convierte en «no lo sabes: lo confirma un asesor». */
export const POR_DEFINIR = "POR_DEFINIR";

/**
 * Datos del negocio. TODO lo que diga POR_DEFINIR hay que llenarlo con el dueño antes de salir a producción: el bot
 * no inventa nada (precios, zonas, proyectos, horarios) y para cada dato pendiente dice que un asesor lo confirma.
 */
export const NEGOCIO = {
  /** Nombre de la app en Meta. Confirmar el nombre comercial con el que se presenta ante los clientes. */
  nombre: "Mundo Motos",
  rubro: "inmobiliaria",
  pais: "México",
  ciudad: POR_DEFINIR,
  /** Número del bot (el que escribe). Por ahora, el número de prueba de Meta. */
  whatsappBot: POR_DEFINIR,
  /** WhatsApp o teléfono de los asesores, por si el bot deriva. */
  whatsappAsesores: POR_DEFINIR,
  email: POR_DEFINIR,
  web: POR_DEFINIR,
  instagram: POR_DEFINIR,
  direccionOficina: POR_DEFINIR,
  horarioTexto: POR_DEFINIR,
  /** Operaciones que atiende: venta, renta, preventa, etc. */
  operaciones: POR_DEFINIR,
  /** Tipos de inmueble: casas, departamentos, terrenos, locales… */
  tiposInmueble: POR_DEFINIR,
  /** Zonas o ciudades donde trabaja. */
  zonas: POR_DEFINIR,
  /** Rango de precios típico, tal cual lo quiere comunicar el negocio. */
  rangoPrecios: POR_DEFINIR,
  /** Financiamiento que acompañan (crédito bancario, Infonavit, Fovissste, contado…). */
  financiamiento: POR_DEFINIR,
  /** Cómo se agenda una visita (con un asesor, por esta vía, por calendario…). */
  visitas: POR_DEFINIR,
  /** Comisión o costos que el negocio quiere que el bot mencione (o vacío si debe derivar). */
  comisiones: POR_DEFINIR,
} as const;

export const BUSINESS_TIMEZONE = env.BUSINESS_TIMEZONE;

export const definido = (valor: string): boolean => valor !== POR_DEFINIR && valor.trim() !== "";
