// Crea (o reinicia) las cuentas del panel: usuario de Supabase Auth con correo confirmado + fila en `staff`.
// Las contraseñas van SOLO al archivo de salida (permiso 600), nunca a la consola.
//
// Uso, desde la raíz del repo y con las variables del bot:
//   railway run -s mundoinmobiliario -- node bot/scripts/crear-cuentas-equipo.mjs cuentas.json CUENTAS-PRUEBA.local.txt
// cuentas.json: [{ "email": "...", "nombre": "...", "rol": "admin" | "asistente" | "vendedor" }, ...]
//
// Si el correo ya existe, se le pone una contraseña nueva y se actualiza su fila de staff: correrlo dos veces no duplica nada.
import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error("Uso: node bot/scripts/crear-cuentas-equipo.mjs <cuentas.json> <archivo-de-salida>");
  process.exit(1);
}

const ROLES = new Set(["admin", "asistente", "vendedor"]);
const cuentas = JSON.parse(readFileSync(entrada, "utf8"));
for (const c of cuentas) {
  if (!c.email || !c.nombre || !ROLES.has(c.rol)) throw new Error(`Cuenta inválida: ${JSON.stringify(c)}`);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** Contraseña de prueba fácil de dictar: Prueba-<parte del correo>-<4 dígitos><letra>. */
function contrasenaDePrueba(email) {
  const base = email.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(-8);
  const letra = "abcdefghjkmnpqrstuvwxyz"[randomInt(23)];
  return `Prueba-${base}-${randomInt(1000, 10000)}${letra}`;
}

async function usuarioPorCorreo(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (encontrado || data.users.length < 200) return encontrado ?? null;
  }
}

const lineas = [];
for (const c of cuentas) {
  const password = contrasenaDePrueba(c.email);
  let usuario = await usuarioPorCorreo(c.email);
  if (usuario) {
    const { error } = await sb.auth.admin.updateUserById(usuario.id, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await sb.auth.admin.createUser({ email: c.email, password, email_confirm: true });
    if (error) throw error;
    usuario = data.user;
  }

  const { error: staffError } = await sb
    .from("staff")
    .upsert({ user_id: usuario.id, nombre: c.nombre, email: c.email, rol: c.rol, activo: true }, { onConflict: "user_id" });
  if (staffError) throw staffError;

  lineas.push(`${c.rol.padEnd(9)} ${c.nombre.padEnd(24)} ${c.email.padEnd(34)} ${password}`);
  console.log(`listo: ${c.email} (${c.rol})`);
}

writeFileSync(
  salida,
  [
    "Cuentas del panel de Mundo Motos (SOLO PRUEBAS: cambiarlas antes de usar el panel con clientes reales).",
    "No subir a git ni pegar en chats.",
    "",
    ...lineas,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(salida, 0o600);
console.log(`Contraseñas guardadas en ${salida} (permiso 600).`);
