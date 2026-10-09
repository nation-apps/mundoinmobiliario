import { env } from "./env.js";

/** Marca de un dato que el negocio todavía no entregó. El prompt la convierte en «no lo sabes: lo confirma un asesor». */
export const POR_DEFINIR = "POR_DEFINIR";

/**
 * Datos de Mundo de Motos, tomados del documento «Implementación CRM - Mundo de Motos» (Google Docs, 9-oct-2026). Lo
 * que diga POR_DEFINIR el bot no lo inventa (precios, existencias, condiciones de crédito) y dice que un asesor lo
 * confirma. Cuando el negocio entregue catálogo con precios, condiciones de financiamiento o el enlace de Google Maps,
 * se llenan aquí.
 */
export const NEGOCIO = {
  nombre: "Mundo de Motos",
  /** La venta de motos nuevas se presenta como TVS Motor Cancún, en alianza con Mundo de Motos. */
  rubro: "agencia TVS y refaccionaria y taller multimarca",
  pais: "México",
  ciudad: "Cancún, Quintana Roo",
  motos:
    "motos nuevas de la marca TVS (la venta de unidades se presenta como TVS Motor Cancún, en alianza con Mundo de " +
    "Motos). Modelos con los que se ha trabajado: HLX 150, Apache RTR 160, RTR 200, RTR 310 y RR 310. La " +
    "disponibilidad de cada modelo, versión y color siempre se consulta con un asesor",
  refacciones:
    "refacciones para modelos seleccionados de distintas marcas, principalmente Italika, Bajaj, Vento, Hero, Suzuki y " +
    "Honda: balatas o pastillas de freno, carburadores, CDI, filtros de aire y de aceite. Multimarca no quiere decir " +
    "que haya todas las piezas para todas las motos",
  /** Lo que se confirmó que NO hay (conversaciones del 6 y 7 de octubre). Actualizar cuando cambie el inventario. */
  noManejamos: "rines, llantas, cubre cárter ni cubrepuños",
  accesorios: "accesorios para motociclistas, incluidos cascos (solo los que estén en el catálogo vigente)",
  taller:
    "taller multimarca para mantenimiento, servicio preventivo, cambio de piezas y limpieza de componentes, con " +
    "atención especializada en TVS. No se ofrece diagnóstico especializado para motos de otras marcas",
  /** No hay catálogo autorizado con precios todavía: los da un asesor. */
  precios: POR_DEFINIR,
  financiamiento:
    "hay venta de contado y financiada. El financiamiento está sujeto a documentación, revisión de Buró de Crédito, " +
    "aprobación y disponibilidad",
  /** Del documento «INFORMACIÓN CRM» (9-oct-2026). Enganche mínimo, plazos y qué financiera aplica: los confirma un asesor. */
  requisitosCredito:
    "las financieras revisan el Buró de Crédito con los datos del cliente y piden INE, comprobante de domicilio y " +
    "estado de cuenta o comprobante de ingresos; con eso deciden si aprueban el crédito para la unidad que busca. El " +
    "enganche, los plazos y la financiera los confirma un asesor",
  /** Tarifas de servicios de taller definidos. */
  tarifasTaller: POR_DEFINIR,
  garantia: POR_DEFINIR,
  /** Número del bot (el que escribe). Por ahora, el número de prueba de Meta. */
  whatsappBot: POR_DEFINIR,
  sucursal: "Mundo de Motos – TVS Motor Cancún, Avenida Yaxchilán 573, Cancún, Quintana Roo",
  /** Enlace oficial de Google Maps: falta que el negocio lo comparta. */
  mapa: POR_DEFINIR,
  /** Del documento «INFORMACIÓN CRM» (9-oct-2026). Las citas se agendan dentro de este horario. */
  horarioTexto: "lunes a viernes de 9 am a 7 pm, y sábado y domingo de 9 am a 2 pm",
  email: "mundodemotossureste@gmail.com",
  /** No hay un sitio propio confirmado (el de TVS México es de la marca, no de la sucursal). */
  web: POR_DEFINIR,
  redes:
    "Mundo de Motos: Facebook, Instagram y YouTube @mundodemotosmx. TVS Motor Cancún: Facebook @tvsmotorcancun e " +
    "Instagram @tvsmotor.cancun",
} as const;

export const BUSINESS_TIMEZONE = env.BUSINESS_TIMEZONE;

export const definido = (valor: string): boolean => valor !== POR_DEFINIR && valor.trim() !== "";
