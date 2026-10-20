import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from "@whiskeysockets/baileys";
import { supabase } from "../db/client.js";
import { LINEA_POR_DEFECTO, idsDeLineas } from "../lib/lineas.js";

/**
 * Sesión de WhatsApp (Baileys) guardada en la tabla `whatsapp_qr_sesion` (0010): sobrevive a reinicios y despliegues del
 * bot, que en Railway pierde el disco cada vez. Una fila por llave (`creds` y cada llave Signal). Solo la service role
 * la lee: contiene las llaves de cifrado del número.
 *
 * Con varias líneas, cada una guarda lo suyo en la misma tabla: la línea por defecto (TVS) usa las claves de siempre, sin
 * prefijo (así la sesión que ya estaba conectada no se pierde), y las demás las prefijan con «<línea>:».
 */

const TABLA = "whatsapp_qr_sesion";
const CLAVE_CREDS = "creds";
/** Supabase limita el largo de las URL de `.in()`: se lee y se borra en lotes. */
const LOTE = 100;

/** El prefijo de las claves de una línea: ninguno para la línea por defecto. */
function prefijoDe(linea: string): string {
  return linea === LINEA_POR_DEFECTO ? "" : `${linea}:`;
}

const aTexto = (valor: unknown): string => JSON.stringify(valor, BufferJSON.replacer);
const deTexto = <T>(texto: string): T => JSON.parse(texto, BufferJSON.reviver) as T;
const claveDe = (linea: string, tipo: string, id: string): string => `${prefijoDe(linea)}${tipo}:${id}`;

async function leerClaves(claves: string[]): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  for (let i = 0; i < claves.length; i += LOTE) {
    const { data, error } = await supabase
      .from(TABLA)
      .select("clave, valor")
      .in("clave", claves.slice(i, i + LOTE));
    if (error) throw error;
    for (const fila of (data ?? []) as { clave: string; valor: string }[]) resultado.set(fila.clave, fila.valor);
  }
  return resultado;
}

async function escribirClaves(filas: { clave: string; valor: string }[]): Promise<void> {
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await supabase
      .from(TABLA)
      .upsert(filas.slice(i, i + LOTE).map((f) => ({ ...f, updated_at: new Date().toISOString() })), { onConflict: "clave" });
    if (error) throw error;
  }
}

async function borrarClaves(claves: string[]): Promise<void> {
  for (let i = 0; i < claves.length; i += LOTE) {
    const { error } = await supabase.from(TABLA).delete().in("clave", claves.slice(i, i + LOTE));
    if (error) throw error;
  }
}

/** ¿Ya hay un número vinculado guardado? Con eso el bot reconecta solo al arrancar, sin pedir un QR nuevo. */
export async function haySesionGuardada(linea: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLA)
    .select("clave")
    .eq("clave", `${prefijoDe(linea)}${CLAVE_CREDS}`)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Borra lo guardado de UNA línea: ese número queda desvinculado y la próxima conexión pide un QR nuevo. */
export async function borrarSesionGuardada(linea: string): Promise<void> {
  const otras = idsDeLineas().filter((id) => id !== LINEA_POR_DEFECTO);
  let consulta = supabase.from(TABLA).delete();
  if (linea === LINEA_POR_DEFECTO) {
    // La línea por defecto no tiene prefijo: se borra todo lo que no sea de otra línea.
    consulta = consulta.neq("clave", "");
    for (const id of otras) consulta = consulta.not("clave", "like", `${id}:%`);
  } else {
    consulta = consulta.like("clave", `${linea}:%`);
  }
  const { error } = await consulta;
  if (error) throw error;
}

export async function usarSesionSupabase(linea: string): Promise<{ state: AuthenticationState; guardarCreds: () => Promise<void> }> {
  const claveCreds = `${prefijoDe(linea)}${CLAVE_CREDS}`;
  const guardadas = await leerClaves([claveCreds]);
  const credsTexto = guardadas.get(claveCreds);
  const creds: AuthenticationCreds = credsTexto ? deTexto<AuthenticationCreds>(credsTexto) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(tipo: T, ids: string[]) => {
          const filas = await leerClaves(ids.map((id) => claveDe(linea, tipo, id)));
          const datos: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            const texto = filas.get(claveDe(linea, tipo, id));
            if (texto === undefined) continue;
            let valor = deTexto<SignalDataTypeMap[T]>(texto);
            if (tipo === "app-state-sync-key" && valor) {
              valor = proto.Message.AppStateSyncKeyData.fromObject(valor as object) as unknown as SignalDataTypeMap[T];
            }
            datos[id] = valor;
          }
          return datos;
        },
        set: async (datos) => {
          const escribir: { clave: string; valor: string }[] = [];
          const borrar: string[] = [];
          for (const tipo of Object.keys(datos) as (keyof SignalDataTypeMap)[]) {
            const porId = datos[tipo] ?? {};
            for (const id of Object.keys(porId)) {
              const valor = porId[id];
              if (valor) escribir.push({ clave: claveDe(linea, tipo, id), valor: aTexto(valor) });
              else borrar.push(claveDe(linea, tipo, id));
            }
          }
          if (escribir.length) await escribirClaves(escribir);
          if (borrar.length) await borrarClaves(borrar);
        },
      },
    },
    guardarCreds: () => escribirClaves([{ clave: claveCreds, valor: aTexto(creds) }]),
  };
}
