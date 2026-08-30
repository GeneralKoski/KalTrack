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
PORT="${1:-8000}"

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

echo ""
echo "  APK   : $APK_NAME ($(du -h "$APK" | cut -f1))"
echo ""
echo "  Sul telefono, stessa Wi-Fi, apri:"
echo ""
echo "      http://$IP:$PORT/$APK_NAME"
echo ""
echo "  Oppure la cartella:  http://$IP:$PORT/"
echo "  (Ctrl-C per fermare)"
echo ""

# Sta in ascolto su tutta la rete locale, non solo su localhost: e' il punto.
# Resta acceso finche' non lo fermi tu, quindi non lasciarlo in piedi su una
# rete di cui non ti fidi.
cd "$APK_DIR"
exec python3 -m http.server "$PORT" --bind 0.0.0.0
