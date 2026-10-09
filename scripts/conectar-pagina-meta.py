#!/usr/bin/env python3
"""
Conecta una Página de Facebook al bot, sin mostrar ningún token: sus leads de formularios de anuncios (con la marca que
va en el campo «origen»: «Campaña Formulario Meta <marca>») y, con --mensajes, sus mensajes directos de Messenger y los
de su Instagram vinculado. Se corre una vez por página (Mundo de Motos tiene dos: TVS Motor Cancún y Mundo de Motos MX).

Antes: en el Explorador de la Graph API (app «Mundo Motos») genera un token de usuario con leads_retrieval,
pages_manage_ads, pages_manage_metadata, pages_read_engagement, pages_show_list, ads_management, business_management
y, para los mensajes, instagram_basic, instagram_manage_messages y pages_messaging. En la ventana de Facebook marca el
negocio y las páginas. Cópialo con el botón de copiar.

Uso (desde la raíz del repo, con el proyecto de Railway enlazado):
    python3 scripts/conectar-pagina-meta.py                        # lista las páginas que ve el token
    python3 scripts/conectar-pagina-meta.py <ID> --marca TVS        # solo leads de esa página
    python3 scripts/conectar-pagina-meta.py <ID> --marca TVS --mensajes
        # además, sus DMs de Messenger e Instagram (el bot atiende los mensajes de UNA sola página)
    --anuncios  guarda también el token de usuario (vence en ~60 días) para saber de qué página es cada anuncio de
                WhatsApp («Campaña WhatsApp Meta <marca>»).

Qué hace:
  1. Cambia el token del portapapeles por uno de larga duración (con el App secret que ya está en Railway).
  2. Pide el token de la página (con un token de usuario de larga duración, el de la página no vence).
  3. Agrega o actualiza la página en META_PAGINAS (id, marca, token). Con --mensajes guarda además META_PAGE_ID,
     META_PAGE_ACCESS_TOKEN y META_IG_ACCOUNT_ID. Railway reinicia el bot solo.
  4. Suscribe la página a `leadgen` (y a los mensajes si es la de --mensajes) y muestra los formularios que puede leer.
"""
import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

APP_ID = "2544073699424560"
VERSION = "v26.0"
SERVICIO = "mundoinmobiliario"
PERMISOS_NECESARIOS = {"leads_retrieval", "pages_manage_ads", "pages_manage_metadata", "pages_show_list"}
# Sin estos llegan los leads pero no los mensajes directos: se avisa, no se detiene.
PERMISOS_MENSAJES = {"instagram_basic", "instagram_manage_messages", "pages_messaging"}
CAMPOS_SOLO_LEADS = "leadgen"
CAMPOS_CON_MENSAJES = "leadgen,messages,messaging_postbacks,message_echoes"


def graph(ruta: str, params: dict, metodo: str = "GET") -> dict:
    url = f"https://graph.facebook.com/{VERSION}/{ruta}"
    datos = urllib.parse.urlencode(params)
    pedido = (
        urllib.request.Request(f"{url}?{datos}")
        if metodo == "GET"
        else urllib.request.Request(url, data=datos.encode(), method=metodo)
    )
    try:
        with urllib.request.urlopen(pedido, timeout=30) as respuesta:
            return json.load(respuesta)
    except urllib.error.HTTPError as e:
        error = json.load(e).get("error", {})
        raise RuntimeError(f"Meta rechazó {ruta}: {error.get('message')} (código {error.get('code')})") from None


def variables_railway() -> dict:
    salida = subprocess.run(
        ["railway", "variables", "-s", SERVICIO, "--json"], capture_output=True, text=True, check=True
    ).stdout
    return json.loads(salida)


def main() -> None:
    parser = argparse.ArgumentParser(description="Conecta una página de Facebook al bot (sin mostrar tokens).")
    parser.add_argument("pagina", nargs="?", help="ID de la página (si se omite, se listan)")
    parser.add_argument("--marca", help="Marca para el campo «origen» (p. ej. TVS, «Mundo de Motos»)")
    parser.add_argument("--mensajes", action="store_true", help="Esta página atiende los DMs de Messenger e Instagram")
    parser.add_argument("--anuncios", action="store_true", help="Guarda el token de usuario para leer anuncios")
    args = parser.parse_args()

    token_usuario = subprocess.run(["pbpaste"], capture_output=True, text=True).stdout.strip()
    if not token_usuario.startswith("EAA"):
        sys.exit("El portapapeles no tiene un token de Meta. Genera el token en el Explorador y cópialo.")

    variables = variables_railway()
    app_secret = variables.get("META_APP_SECRET") or variables.get("WHATSAPP_APP_SECRET")
    if not app_secret:
        sys.exit("No encontré el App secret en Railway (META_APP_SECRET o WHATSAPP_APP_SECRET).")

    largo = graph(
        "oauth/access_token",
        {
            "grant_type": "fb_exchange_token",
            "client_id": APP_ID,
            "client_secret": app_secret,
            "fb_exchange_token": token_usuario,
        },
    )["access_token"]

    paginas = graph("me/accounts", {"fields": "id,name,access_token,tasks", "access_token": largo}).get("data", [])
    if not paginas:
        sys.exit("Esa cuenta no administra ninguna página, o no se eligió la página al generar el token.")

    print("Páginas que ve el token:")
    for p in paginas:
        anuncia = "puede anunciar" if "ADVERTISE" in p.get("tasks", []) else "SIN permiso para anunciar"
        print(f"  {p['id']}  {p['name']}  ({anuncia})")

    if not args.pagina:
        if len(paginas) > 1:
            sys.exit("\nCorre el script otra vez con el ID de la página y su marca, p. ej.: <ID> --marca TVS")
        args.pagina = paginas[0]["id"]
    pagina = next((p for p in paginas if p["id"] == args.pagina), None)
    if not pagina:
        sys.exit(f"La página {args.pagina} no está en la lista.")
    marca = args.marca or pagina["name"]

    token_pagina = pagina["access_token"]
    info = graph("debug_token", {"input_token": token_pagina, "access_token": token_pagina})["data"]
    permisos = set(info.get("scopes", []))
    faltan = PERMISOS_NECESARIOS - permisos
    vence = "no vence" if not info.get("expires_at") else "VENCE (genera el token de nuevo)"
    print(f"\nPágina elegida: {pagina['name']} ({pagina['id']}), marca «{marca}». Token de página: {vence}.")
    if faltan:
        sys.exit(f"Al token le faltan permisos: {', '.join(sorted(faltan))}. Márcalos en el Explorador y genera otro.")

    # La página que atiende los DMs: la de --mensajes, o la que ya lo era (volver a conectarla no le quita los mensajes).
    con_mensajes = args.mensajes or variables.get("META_PAGE_ID") == pagina["id"]
    nuevas = []

    actuales = []
    try:
        actuales = json.loads(variables.get("META_PAGINAS") or "[]")
    except json.JSONDecodeError:
        print("Aviso: META_PAGINAS no era JSON válido; se reemplaza.")
    actuales = [p for p in actuales if isinstance(p, dict) and p.get("id") != pagina["id"]]
    actuales.append({"id": pagina["id"], "marca": marca, "token": token_pagina})
    nuevas += ["--set", f"META_PAGINAS={json.dumps(actuales, ensure_ascii=False)}"]

    if con_mensajes:
        faltan_mensajes = PERMISOS_MENSAJES - permisos
        if faltan_mensajes:
            print(f"Aviso: sin {', '.join(sorted(faltan_mensajes))} no llegan los mensajes directos.")
        instagram = graph(
            pagina["id"], {"fields": "instagram_business_account{id,username}", "access_token": token_pagina}
        ).get("instagram_business_account")
        if instagram:
            print(f"Instagram vinculado: @{instagram.get('username')} ({instagram['id']}).")
            nuevas += ["--set", f"META_IG_ACCOUNT_ID={instagram['id']}"]
        else:
            print("Aviso: la página no tiene una cuenta de Instagram profesional vinculada; solo Messenger.")
        nuevas += ["--set", f"META_PAGE_ID={pagina['id']}", "--set", f"META_PAGE_ACCESS_TOKEN={token_pagina}"]

    if args.anuncios:
        nuevas += ["--set", f"META_ADS_TOKEN={largo}"]

    subprocess.run(["railway", "variables", "-s", SERVICIO, *nuevas], capture_output=True, text=True, check=True)
    print(
        "Guardado en Railway: la página en META_PAGINAS"
        + (" y como página de mensajes" if con_mensajes else "")
        + (" y el token de anuncios (vence en ~60 días)" if args.anuncios else "")
        + ". El bot se reinicia solo."
    )

    campos = CAMPOS_CON_MENSAJES if con_mensajes else CAMPOS_SOLO_LEADS
    suscripcion = graph(
        f"{pagina['id']}/subscribed_apps", {"subscribed_fields": campos, "access_token": token_pagina}, metodo="POST"
    )
    print(f"Página suscrita a {campos}: {'sí' if suscripcion.get('success') else 'no'}.")

    try:
        formularios = graph(
            f"{pagina['id']}/leadgen_forms",
            {"fields": "name,status", "limit": "10", "access_token": token_pagina},
        ).get("data", [])
        print(f"Formularios que el bot puede leer: {len(formularios)}")
        for f in formularios:
            print(f"  - {f.get('name')} ({f.get('status')})")
    except RuntimeError as e:
        print(f"Aviso: no se pudieron listar los formularios ({e}). Revisa el acceso a clientes potenciales.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        sys.exit(str(e))
