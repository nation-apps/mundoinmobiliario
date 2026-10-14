#!/usr/bin/env bash
# Carga las claves de Stripe en el servicio del bot de Railway SIN mostrarlas ni pasarlas por el chat.
# Uso (desde la raíz del repo, con el proyecto de Railway enlazado):  bash scripts/configurar-stripe.sh
# Cada valor se escribe con la pantalla oculta; si se deja vacío, esa variable no se toca.
set -euo pipefail

SERVICIO_BOT="${SERVICIO_BOT:-mundoinmobiliario}"
PANEL_POR_DEFECTO="https://joyful-peace-production-2649.up.railway.app"

pedir() { # nombre, patrón, mensaje
  local nombre="$1" patron="$2" mensaje="$3" valor
  read -r -s -p "$mensaje (vacío = no cambiar): " valor; echo >&2
  [ -z "$valor" ] && return 0
  if ! [[ "$valor" =~ $patron ]]; then
    echo "  ✗ $nombre no tiene el formato esperado; no se guardó." >&2
    return 0
  fi
  railway variables -s "$SERVICIO_BOT" --set "$nombre=$valor" >/dev/null
  echo "  ✓ $nombre guardada en $SERVICIO_BOT" >&2
}

echo "Stripe → Railway ($SERVICIO_BOT). Pega cada valor y presiona Enter; no se verá en pantalla." >&2
pedir STRIPE_SECRET_KEY '^(sk|rk)_(test|live)_[A-Za-z0-9]+$' "Clave secreta (sk_test_… / sk_live_… / rk_…)"
pedir STRIPE_WEBHOOK_SECRET '^whsec_[A-Za-z0-9]+$' "Secreto del webhook (whsec_…)"

read -r -p "Dirección pública del panel [$PANEL_POR_DEFECTO]: " panel
panel="${panel:-$PANEL_POR_DEFECTO}"
if [[ "$panel" =~ ^https://[^[:space:]]+$ ]]; then
  railway variables -s "$SERVICIO_BOT" --set "PANEL_PUBLIC_URL=$panel" >/dev/null
  echo "  ✓ PANEL_PUBLIC_URL = $panel" >&2
else
  echo "  ✗ La dirección debe empezar con https://" >&2
fi
echo "Listo. El bot se reinicia solo con las variables nuevas." >&2
