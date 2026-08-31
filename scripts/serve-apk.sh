#!/usr/bin/env bash
#
# Serve l'APK release sulla Wi-Fi di casa, per scaricarlo dal telefono.
#
# Uso (dalla root del repo):
#   ./scripts/serve-apk.sh          # porta 8000
#   ./scripts/serve-apk.sh 8080     # porta diversa
#
# Sul telefono, collegato alla stessa Wi-Fi, apri l'indirizzo stampato, tocca
# l'APK e installa. Android chiedera' di autorizzare l'installazione da questa
# fonte: e' normale per un'app che non arriva dal Play Store.
#
# Ctrl-C per fermare.
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK_DIR="$PROJECT_DIR/android/app/build/outputs/apk/release"

# --- Porta ------------------------------------------------------------------
# Senza una porta scelta a mano si prende la prima libera da 8000 in su.
# Sulla 8000 spesso c'e' gia' `php artisan serve` del backend, e siccome qui si
# ascolta su tutta la rete locale (0.0.0.0) il conflitto c'e' anche quando
# quello sta solo su 127.0.0.1. Prima usciva uno stack trace di Python lungo
# trenta righe che non diceva ne' il perche' ne' cosa fare.
porta_libera() {
  python3 -c '
import socket, sys
inizio = int(sys.argv[1])
for porta in range(inizio, inizio + 20):
    s = socket.socket()
    try:
        s.bind(("0.0.0.0", porta))
        print(porta)
        break
    except OSError:
        continue
    finally:
        s.close()
' "$1"
}

if [[ $# -ge 1 ]]; then
  # Porta chiesta esplicitamente: se e occupata si dice chi la tiene, invece di
  # spostarsi in silenzio su un altra e stampare un indirizzo diverso da quello
  # che ci si aspettava.
  PORT="$1"
  if [[ "$(porta_libera "$PORT")" != "$PORT" ]]; then
    echo "ERRORE: la porta $PORT e gia occupata da:" >&2
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tail -n +2 >&2
    echo "        Prova con:  ./scripts/serve-apk.sh $((PORT + 1))" >&2
    exit 1
  fi
else
  PORT="$(porta_libera 8000)"
  if [[ -z "$PORT" ]]; then
    echo "ERRORE: nessuna porta libera fra 8000 e 8019" >&2
    exit 1
  fi
fi

# Il piu' recente, con ripiego sul nome che genera gradle.
APK="$(ls -t "$APK_DIR"/kaltrack-*.apk "$APK_DIR"/app-release.apk 2>/dev/null | head -1 || true)"
if [[ -z "$APK" ]]; then
  echo "ERRORE: nessun APK in $APK_DIR" >&2
  echo "        Costruiscilo prima con ./scripts/build-apk.sh" >&2
  exit 1
fi

# L'IP del Mac sulla rete locale: il telefono deve poter arrivare qui.
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -z "$IP" ]]; then
  echo "ERRORE: nessun IP sulla rete locale (sei connesso al Wi-Fi?)" >&2
  exit 1
fi

APK_NAME="$(basename "$APK")"
DOWNLOAD_URL="http://$IP:$PORT/$APK_NAME"
LOCAL_URL="http://localhost:$PORT/$APK_NAME"

echo ""
echo "============================================================"
echo "  APK PRONTO AL DOWNLOAD"
echo "  File : $APK_NAME ($(du -h "$APK" | cut -f1))"
echo "  URL  : $DOWNLOAD_URL"
echo "  Local: $LOCAL_URL"
echo "============================================================"
echo ""
echo "  Inquadra questo QR Code dal telefono (connesso allo stesso Wi-Fi):"
echo ""

# Stampa il QR Code direttamente nel terminale
node -e '
  try {
    const qrcode = require("qrcode-terminal");
    qrcode.generate(process.argv[1], { small: true });
  } catch (e) {
    // Continua senza errore se il modulo non fosse presente
  }
' "$DOWNLOAD_URL"

echo ""
echo "  Oppure apri dal browser del telefono:"
echo "    $DOWNLOAD_URL"
echo ""
echo "  (Premi Ctrl-C per terminare il server)"
echo "------------------------------------------------------------"
echo ""

# Sta in ascolto su tutta la rete locale, non solo su localhost: e' il punto.
cd "$APK_DIR"
exec python3 -m http.server "$PORT" --bind 0.0.0.0
