import { z } from "zod";

/** `VAR=` vacío es "no configurado", no un valor inválido que tumbe el arranque. */
function vacioComoAusente<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema);
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  // WhatsApp, Anthropic y Meta son OPCIONALES a propósito: cada integración
  // se apaga sola si falta su credencial (ver el aviso que se imprime al
  // arrancar) y se activa sin redeploy en cuanto se cargan las variables en
  // Railway, solo reiniciando el servicio.
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  /** Cuenta de WhatsApp Business — de acá cuelgan las plantillas, no del número. */
  WHATSAPP_WABA_ID: z.string().min(1).optional(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Messenger, Instagram y comentarios. META_APP_SECRET y META_VERIFY_TOKEN
  // caen a los de WhatsApp si no se cargan — viven en la misma app de Meta.
  META_GRAPH_VERSION: z.string().default("v26.0"),
  META_APP_SECRET: z.string().min(1).optional(),
  META_VERIFY_TOKEN: z.string().min(1).optional(),
  META_PAGE_ID: z.string().min(1).optional(),
  META_PAGE_ACCESS_TOKEN: z.string().min(1).optional(),
  META_IG_ACCOUNT_ID: z.string().min(1).optional(),
  // Páginas cuyos formularios de anuncios llegan a la bandeja, cada una con su marca (la del campo «origen») y su
  // token: JSON [{"id":"…","marca":"TVS","token":"…"}]. Lo escribe scripts/conectar-pagina-meta.py. La de
  // META_PAGE_ID (mensajes directos) puede estar también aquí para tener su marca.
  META_PAGINAS: z.string().min(1).optional(),
  // Opcional: token con ads_read sobre la cuenta publicitaria, para saber de qué página es un anuncio de WhatsApp
  // (si falta se prueba con los tokens de página).
  META_ADS_TOKEN: z.string().min(1).optional(),
  // Entre 24h y 7 días de la última respuesta, solo un humano puede escribir
  // con el tag HUMAN_AGENT — y solo si Meta aprobó esa función en App Review.
  // Se compara el string tal cual contra "true" (Boolean("false") es true).
  META_HUMAN_AGENT_APROBADO: z
    .string()
    .optional()
    .transform((v) => v === "true")
    .default(false),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  /** URL pública del bot (Railway), p. ej. https://mundoinmobiliario-production.up.railway.app. */
  PUBLIC_BASE_URL: z.string().url(),

  BUSINESS_TIMEZONE: z.string().default("America/Cancun"),
  /** Número (52 + 10 dígitos) que recibe el aviso de "conversación escalada" y el de tope de gasto. */
  ESCALATION_PHONE: z.string().min(1),
  RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().int().positive().default(20),
  DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(500_000),
  /**
   * Cuánto "piensa" el modelo antes de responder (low | medium | high | xhigh | max). Menos esfuerzo = menos tokens de
   * salida (más barato y más rápido). Vacío = el valor por defecto de Anthropic.
   */
  BOT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),

  // Ritmo humano de las respuestas (src/lib/ritmoHumano.ts). RITMO_HUMANO=false lo apaga; RITMO_FACTOR escala la
  // pausa (1 = tal cual, 0.5 = la mitad, 2 = el doble).
  RITMO_HUMANO: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  RITMO_FACTOR: z.coerce.number().min(0).max(3).default(1),

  // Reenvío automático de respuestas que no llegaron (src/seguimientos/reenvios.ts). REENVIOS_ACTIVOS=false lo apaga.
  REENVIOS_ACTIVOS: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  // Revisión de formularios de anuncios (src/meta/reconciliarLeads.ts): trae los leads que el webhook de Meta no avisó.
  // Cobro del CRM con Stripe (src/stripe/*). Sin STRIPE_SECRET_KEY la sección de suscripción del panel queda apagada.
  STRIPE_SECRET_KEY: vacioComoAusente(z.string().min(10).optional()),
  STRIPE_WEBHOOK_SECRET: vacioComoAusente(z.string().min(10).optional()),
  /** `price_…` del producto en Stripe; sin él se cobra STRIPE_PRECIO_CENTAVOS al mes en línea. */
  STRIPE_PRICE_ID: vacioComoAusente(z.string().min(3).optional()),
  STRIPE_PRECIO_CENTAVOS: z.coerce.number().int().min(100).default(3900),
  /** Dirección pública del panel (a ella vuelve Stripe tras pagar). Sin ella se usa la primera de ADMIN_ORIGINS. */
  PANEL_PUBLIC_URL: vacioComoAusente(z.string().url().optional()),
  // Quién atiende una conversación NUEVA: false (por defecto) = una persona («Yo»: el bot guarda los mensajes pero no
  // contesta) y quien quiera el bot mueve el interruptor Bot/Yo del chat; true = el bot contesta desde el primer mensaje.
  BOT_ACTIVO_POR_DEFECTO: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // Conexión de WhatsApp por QR (Baileys, NO oficial de Meta; puede bloquear el número). Con WHATSAPP_QR_ACTIVO=true los envíos
  // y recepciones de WhatsApp van por ese número vinculado y no por la API de Meta. Ver src/whatsapp-qr/.
  WHATSAPP_QR_ACTIVO: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // Primer mensaje automático a quien llena un formulario de anuncios (src/agent/primerMensajeLead.ts). Se enciende y se escribe en el
  // panel (Bienvenida), por línea. Aquí solo los límites que protegen el número: es escribirle primero a gente que no ha escrito.
  LEADS_PRIMER_MENSAJE_MAX_POR_HORA: z.coerce.number().int().min(1).max(60).default(12),
  /** Horas (de BUSINESS_TIMEZONE) entre las que se escribe; fuera de ellas el mensaje espera a que abra el horario. */
  LEADS_PRIMER_MENSAJE_DESDE_HORA: z.coerce.number().int().min(0).max(23).default(8),
  LEADS_PRIMER_MENSAJE_HASTA_HORA: z.coerce.number().int().min(1).max(24).default(21),
  /** Tope de mensajes que salen por minuto por el número del QR (protege el número de un bloqueo por ráfagas). */
  WHATSAPP_QR_MAX_POR_MINUTO: z.coerce.number().int().min(1).max(120).default(15),
  LEADS_RECONCILIAR_ACTIVO: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  LEADS_RECONCILIAR_MIN: z.coerce.number().int().min(1).max(60).default(5),
  /** Cuánto hacia atrás se miran los leads en cada vuelta. */
  LEADS_VENTANA_MIN: z.coerce.number().int().min(10).max(1440).default(120),

  // Orígenes del panel admin autorizados a llamar a /admin/* (separados por
  // coma). El panel de Mundo Motos llama al bot desde el servidor, pero se deja la
  // lista blanca por si se abre desde el navegador.
  ADMIN_ORIGINS: z.string().default(""),
  WEB_ORIGINS: z.string().default(""),
  // Secreto compartido con el sitio (Vercel: BOT_LEADS_TOKEN) para
  // POST /public/leads. Vacío = no configurado.
  PUBLIC_LEADS_TOKEN: vacioComoAusente(z.string().min(16).optional()),
  PUBLIC_RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().int().positive().default(10),

  WHATSAPP_TEMPLATE_LANG: z.string().default("es_MX"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const conValor = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = envSchema.safeParse(conValor);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    console.error(`Variables de entorno inválidas o faltantes:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const whatsappConfigurado = Boolean(
  env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID,
);
export const anthropicConfigurado = Boolean(env.ANTHROPIC_API_KEY);

export const metaAppSecret = env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET;
export const metaVerifyToken = env.META_VERIFY_TOKEN ?? env.WHATSAPP_VERIFY_TOKEN;
export const metaConfigurado = Boolean(env.META_PAGE_ID && env.META_PAGE_ACCESS_TOKEN && metaAppSecret);
export const instagramConfigurado = Boolean(metaConfigurado && env.META_IG_ACCOUNT_ID);

const pendientes: string[] = [];
if (!whatsappConfigurado) pendientes.push("WhatsApp (webhook y envío de mensajes)");
if (!anthropicConfigurado) pendientes.push("Anthropic (agente conversacional)");
if (!metaConfigurado) pendientes.push("Messenger/Instagram (webhook y envío de mensajes)");

if (pendientes.length > 0) {
  console.warn(
    `⚠ Arrancando sin: ${pendientes.join(", ")}. ` +
      `El panel (/admin/*) y los leads del formulario web (/public/leads) funcionan igual — ` +
      `cargar las variables faltantes y reiniciar el servicio activa el resto sin redeploy.`,
  );
} else {
  console.info("✓ Todas las integraciones configuradas (WhatsApp, Anthropic, Messenger/Instagram).");
}
if (!env.PUBLIC_LEADS_TOKEN) {
  console.warn("⚠ Sin PUBLIC_LEADS_TOKEN: POST /public/leads acepta llamadas de WEB_ORIGINS con rate limit por IP.");
}
