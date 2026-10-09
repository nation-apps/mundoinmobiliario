import { env } from "./env.js";

/** Marca de un dato que el negocio todavía no entregó. El prompt la convierte en «no lo sabes: lo confirma un asesor». */
export const POR_DEFINIR = "POR_DEFINIR";

/**
 * Datos de Mundo Motos. Lo que diga POR_DEFINIR hay que llenarlo con el dueño antes de abrir el bot al público: el bot
 * no inventa nada (modelos, precios, existencias, financiamiento, horarios) y para cada dato pendiente dice que un
 * asesor lo confirma.
 */
export const NEGOCIO = {
  nombre: "Mundo Motos",
  rubro: "agencia de motocicletas",
  pais: "México",
  ciudad: POR_DEFINIR,
  /** Qué vende y qué servicios da (motos nuevas, seminuevas, refacciones, taller…), tal cual lo diga el negocio. */
  propuesta: POR_DEFINIR,
  /** Marcas y modelos que maneja. */
  marcas: POR_DEFINIR,
  /** Precios o rangos que el bot puede dar. Si el negocio prefiere que solo los dé un asesor, se deja en POR_DEFINIR. */
  precios: POR_DEFINIR,
  /** Crédito o financiamiento: con quién, requisitos, enganche. */
  financiamiento: POR_DEFINIR,
  formasDePago: POR_DEFINIR,
  /** Garantía de las motos y del servicio. */
  garantia: POR_DEFINIR,
  /** Servicio de taller, refacciones y accesorios. */
  servicio: POR_DEFINIR,
  /** Número del bot (el que escribe). Por ahora, el número de prueba de Meta. */
  whatsappBot: POR_DEFINIR,
  /** WhatsApp o teléfono de los asesores, por si el bot deriva. */
  whatsappAsesores: POR_DEFINIR,
  email: POR_DEFINIR,
  web: POR_DEFINIR,
  instagram: POR_DEFINIR,
  facebook: POR_DEFINIR,
  /** Sucursal o sucursales, con dirección. */
  sucursales: POR_DEFINIR,
  horarioTexto: POR_DEFINIR,
} as const;

export const BUSINESS_TIMEZONE = env.BUSINESS_TIMEZONE;

export const definido = (valor: string): boolean => valor !== POR_DEFINIR && valor.trim() !== "";
