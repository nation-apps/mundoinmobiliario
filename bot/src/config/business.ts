import { env } from "./env.js";

/** Marca de un dato que el negocio todavía no entregó. El prompt la convierte en «no lo sabes: lo confirma un asesor». */
export const POR_DEFINIR = "POR_DEFINIR";

/**
 * Datos del negocio. Lo que no es POR_DEFINIR salió del sitio https://eventos.mundoinmobiliario.tv/ (revisado el
 * 2026-10-05). Lo que diga POR_DEFINIR hay que llenarlo con el dueño antes de salir a producción: el bot no inventa nada
 * (precios, fechas, horarios) y para cada dato pendiente dice que un asesor lo confirma.
 */
export const NEGOCIO = {
  nombre: "Mundo Inmobiliario",
  rubro: "empresa de educación e inversión inmobiliaria",
  pais: "México",
  /** Operan también en Estados Unidos y España según el sitio. */
  alcance: "México, Estados Unidos y España",
  ciudad: POR_DEFINIR,
  fundador: "Luis Ramírez",
  fundadorBio:
    "abogado, autor y empresario inmobiliario con más de 15 años de experiencia; según su sitio ha desarrollado 28 edificios, " +
    "fundado 10 empresas inmobiliarias y acompañado a más de 5,000 inversionistas",
  /** Qué enseñan, tal cual lo comunica el sitio. */
  propuesta:
    "métodos para invertir en bienes raíces, generar ingresos por rentas y construir libertad financiera, con formación " +
    "estructurada y mentoría, para quien empieza y para quien ya invierte",
  /** Número del bot (el que escribe). Por ahora, el número de prueba de Meta. */
  whatsappBot: POR_DEFINIR,
  /** WhatsApp o teléfono de los asesores, por si el bot deriva. */
  whatsappAsesores: POR_DEFINIR,
  email: POR_DEFINIR,
  web: "https://eventos.mundoinmobiliario.tv/",
  instagram: "@luisinverpresario",
  facebook: "@luisinverpresario",
  /** Otros canales del contenido del fundador. */
  contenido: "podcast en Spotify, canal de YouTube, programa de radio «Mundo Inmobiliario» y el libro «El Señor de las Rentas»",
  direccionOficina: POR_DEFINIR,
  horarioTexto: POR_DEFINIR,
  /** Seminario gratuito de entrada. */
  seminarioFormato:
    "Gratuito, en línea por Zoom, en horario de la Ciudad de México, con Luis Ramírez. Cubre el mercado inmobiliario mexicano " +
    "actual, la metodología DEAL (Diagnóstico, Estrategia, Acción, Legado), más de 15 técnicas inmobiliarias, estrategias para " +
    "invertir sin capital inicial y cómo armar un plan de inversión personal. Para registrarse piden nombre, correo y WhatsApp",
  /** La del sitio (miércoles 19 de agosto, 8 pm CDMX) ya pasó: no usarla hasta que el negocio confirme la próxima. */
  seminarioFecha: POR_DEFINIR,
  seminarioLink: "https://eventos.mundoinmobiliario.tv/gratis/seminario",
  /** Entrada VIP del seminario (da acceso a las grabaciones según el sitio). */
  seminarioVip: POR_DEFINIR,
  programaAvanzado:
    "Formación en línea con un método paso a paso para comprar tu primera propiedad rentable en menos de 90 días",
  mentoria: "Acompañamiento personalizado y revisión de tus operaciones para invertir con seguridad y confianza",
  master: "Formación integral para escalar tu cartera inmobiliaria con estrategia, fiscalidad y gestión profesional",
  /** Precios, formas de pago y fechas de inicio de los programas: el sitio no los publica. */
  preciosProgramas: POR_DEFINIR,
  formasDePago: POR_DEFINIR,
  /** Garantía o política de devolución, si existe. */
  garantia: POR_DEFINIR,
} as const;

export const BUSINESS_TIMEZONE = env.BUSINESS_TIMEZONE;

export const definido = (valor: string): boolean => valor !== POR_DEFINIR && valor.trim() !== "";
