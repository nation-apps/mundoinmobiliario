#!/usr/bin/env python3
"""
Conecta la Página de Facebook al bot para recibir los leads de formularios de anuncios, sin mostrar ningún token.

Antes: en el Explorador de la Graph API (app «Mundo Motos») genera un token de usuario con leads_retrieval,
pages_manage_ads, pages_manage_metadata, pages_read_engagement, pages_show_list, ads_management y
business_management, y cópialo con el botón de copiar.

Uso (desde la raíz del repo, con el proyecto de Railway enlazado):
    python3 scripts/conectar-pagina-meta.py              # si administras una sola página
    python3 scripts/conectar-pagina-meta.py <ID_PAGINA>  # si hay varias (el script las lista)

Qué hace:
  1. Cambia el token del portapapeles por uno de larga duración (con el App secret que ya está en Railway).
  2. Pide el token de la página (con un token de usuario de larga duración, el de la página no vence).
  3. Guarda META_PAGE_ID y META_PAGE_ACCESS_TOKEN en el servicio del bot (Railway lo reinicia solo).
  4. Suscribe la página al campo `leadgen` del webhook y muestra los formularios que el token puede leer.
"""
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

    print("Páginas que administra la cuenta:")
    for p in paginas:
        anuncia = "puede anunciar" if "ADVERTISE" in p.get("tasks", []) else "SIN permiso para anunciar"
        print(f"  {p['id']}  {p['name']}  ({anuncia})")

    if len(sys.argv) > 1:
        pagina = next((p for p in paginas if p["id"] == sys.argv[1]), None)
        if not pagina:
            sys.exit(f"La página {sys.argv[1]} no está en la lista.")
    elif len(paginas) == 1:
        pagina = paginas[0]
    else:
        sys.exit("Hay varias páginas: vuelve a correr el script con el ID de la página de Mundo Motos.")

    token_pagina = pagina["access_token"]
    info = graph("debug_token", {"input_token": token_pagina, "access_token": token_pagina})["data"]
    permisos = set(info.get("scopes", []))
    faltan = PERMISOS_NECESARIOS - permisos
    vence = "no vence" if not info.get("expires_at") else "VENCE (genera el token de nuevo)"
    print(f"\nPágina elegida: {pagina['name']} ({pagina['id']}). Token de página: {vence}.")
    if faltan:
        sys.exit(f"Al token le faltan permisos: {', '.join(sorted(faltan))}. Márcalos en el Explorador y genera otro.")

    subprocess.run(
        [
            "railway", "variables", "-s", SERVICIO,
            "--set", f"META_PAGE_ID={pagina['id']}",
            "--set", f"META_PAGE_ACCESS_TOKEN={token_pagina}",
        ],
        capture_output=True, text=True, check=True,
    )
    print("Guardado en Railway (META_PAGE_ID y META_PAGE_ACCESS_TOKEN). El bot se reinicia solo.")

    suscripcion = graph(
        f"{pagina['id']}/subscribed_apps",
        {"subscribed_fields": "leadgen", "access_token": token_pagina},
        metodo="POST",
    )
    print(f"Página suscrita al campo leadgen: {'sí' if suscripcion.get('success') else 'no'}.")

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
