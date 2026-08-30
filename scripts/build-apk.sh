#!/usr/bin/env bash
#
# Costruisce l'APK release di KalTrack, firmato, pronto da installare a mano.
#
# Uso (dalla root del repo):
#   ./scripts/build-apk.sh            # versione da app.json
#   ./scripts/build-apk.sh 1.1.0      # imposta anche la versione
#
# Poi, per prenderlo dal telefono:
#   ./scripts/serve-apk.sh
#
# SOLO ANDROID, e non e' una dimenticanza: per iOS servirebbero le API key di
# App Store Connect, che questo progetto non ha, e un'app personale su iPhone si
# installa comunque via Xcode. Per quella strada c'e' `deploy.sh` in root, che
# fa il prebuild e apre Xcode.
#
# Il keystore e le password stanno in credentials.json, che e' gitignorato.
# Perderlo vuol dire non poter piu' aggiornare un'app gia' installata: Android
# rifiuta un aggiornamento firmato con una chiave diversa da quella di prima.
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CREDENTIALS="$PROJECT_DIR/credentials.json"
APK_PATH="$PROJECT_DIR/android/app/build/outputs/apk/release/app-release.apk"

if [[ ! -f "$CREDENTIALS" ]]; then
  echo "ERRORE: credentials.json non trovato in $CREDENTIALS" >&2
  echo "        Serve il keystore di firma. Vedi README, sezione APK." >&2
  exit 1
fi

# --- Versione (facoltativa) ------------------------------------------------
# app.json e' la fonte unica: se ne passi una nuova, viene scritta li' e in
# package.json, cosi' i due non divergono.
if [[ $# -ge 1 ]]; then
  NEW_VERSION="$1"
  if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERRORE: versione non valida '$NEW_VERSION' (serve X.Y.Z)" >&2
    exit 1
  fi
  APP_JSON="$PROJECT_DIR/app.json" PACKAGE_JSON="$PROJECT_DIR/package.json" \
    NEW_VER="$NEW_VERSION" node - <<'PATCH'
const fs = require("fs");
const v = process.env.NEW_VER;
const re = /("version":\s*")[0-9]+\.[0-9]+\.[0-9]+(")/;
for (const p of [process.env.APP_JSON, process.env.PACKAGE_JSON]) {
  const s = fs.readFileSync(p, "utf8");
  if (!re.test(s)) {
    console.error(`ERRORE: campo version non trovato in ${p}`);
    process.exit(1);
  }
  fs.writeFileSync(p, s.replace(re, `$1${v}$2`));
}
PATCH
  echo "==> Versione impostata a $NEW_VERSION (app.json + package.json)"
fi

# --- Credenziali -----------------------------------------------------------
# Lette da credentials.json e mai scritte qui dentro: questo file e' versionato,
# quello no.
eval "$(node -e '
  const c = require(process.argv[1]).android.keystore;
  const q = s => "'"'"'" + String(s).replace(/'"'"'/g, "'"'"'\\'"'"''"'"'") + "'"'"'";
  process.stdout.write(
    "KEYSTORE=" + q(c.keystorePath) + "\n" +
    "STORE_PASSWORD=" + q(c.keystorePassword) + "\n" +
    "KEY_ALIAS=" + q(c.keyAlias) + "\n" +
    "KEY_PASSWORD=" + q(c.keyPassword) + "\n"
  );
' "$CREDENTIALS")"

[[ "$KEYSTORE" = /* ]] || KEYSTORE="$PROJECT_DIR/$KEYSTORE"
if [[ ! -f "$KEYSTORE" ]]; then
  echo "ERRORE: keystore non trovato in $KEYSTORE" >&2
  exit 1
fi

# --- L'indirizzo del server ------------------------------------------------
# Finisce dentro l'APK al momento del bundle: un APK costruito con .env che
# punta all'emulatore non troverebbe niente dal telefono, e la cosa si scopre
# solo aprendo l'app. Meglio dirlo adesso.
API_URL="$(grep -E '^EXPO_PUBLIC_API_URL=' "$PROJECT_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
echo "==> Server configurato: ${API_URL:-<nessuno: l'app restera' solo locale>}"
case "$API_URL" in
  *localhost*|*10.0.2.2*|*127.0.0.1*)
    echo "    ATTENZIONE: e' un indirizzo locale del computer. Dal telefono" >&2
    echo "    non sara' raggiungibile: account, amici e sincronizzazione" >&2
    echo "    non funzioneranno." >&2
    ;;
esac

# --- Prebuild --------------------------------------------------------------
# android/ e' gitignorato e rigenerato SEMPRE da app.json: cosi' ogni modifica
# di configurazione (icona, permessi, SDK) entra nell'APK senza doversene
# ricordare. La firma release viene re-iniettata sotto, quindi sopravvive.
echo "==> Rigenero android/ da app.json (expo prebuild --clean)..."
( cd "$PROJECT_DIR" && npx expo prebuild --platform android --clean )

# --- versionCode -----------------------------------------------------------
# Epoch in secondi: cresce da solo e non ha bisogno di un contatore da
# ricordare, visto che android/ viene rigenerato ogni volta. Senza, prebuild
# lo lascia a 1 e Android rifiuta l'aggiornamento di un APK gia' installato.
VERSION_CODE="$(date +%s)"
GRADLE_FILE="$PROJECT_DIR/android/app/build.gradle" NEW_VC="$VERSION_CODE" node - <<'PATCH'
const fs = require("fs");
const p = process.env.GRADLE_FILE, vc = process.env.NEW_VC;
let s = fs.readFileSync(p, "utf8");
if (!/versionCode\s+\d+/.test(s)) {
  console.error("ERRORE: versionCode non trovato in build.gradle");
  process.exit(1);
}
fs.writeFileSync(p, s.replace(/versionCode\s+\d+/, `versionCode ${vc}`));
PATCH
echo "==> versionCode impostato a $VERSION_CODE"

# --- Firma release ---------------------------------------------------------
# Il template di Expo firma anche la release con il keystore di debug. Qui
# iniettiamo la configurazione vera, in modo idempotente: il marcatore
# KALTRACK_SIGNING evita di rifarlo due volte, e il --clean di sopra la
# cancellerebbe comunque a ogni giro.
GRADLE="$PROJECT_DIR/android/app/build.gradle"
if ! grep -q "KALTRACK_SIGNING" "$GRADLE"; then
  echo "==> Configuro la firma release in build.gradle..."
  GRADLE_FILE="$GRADLE" node - <<'PATCH'
const fs = require("fs");
const p = process.env.GRADLE_FILE;
let s = fs.readFileSync(p, "utf8");
const rel = `        release { // KALTRACK_SIGNING
            if (project.hasProperty('KALTRACK_STORE_FILE')) {
                storeFile file(project.property('KALTRACK_STORE_FILE'))
                storePassword project.property('KALTRACK_STORE_PASSWORD')
                keyAlias project.property('KALTRACK_KEY_ALIAS')
                keyPassword project.property('KALTRACK_KEY_PASSWORD')
            }
        }
`;
s = s.replace(
  /(signingConfigs \{\n\s*debug \{[\s\S]*?\n\s*\}\n)(\s*\}\n)/,
  `$1${rel}$2`,
);
// Senza la proprieta' si ricade sul debug keystore: cosi' un `gradlew
// assembleRelease` lanciato a mano continua a funzionare come prima.
s = s.replace(
  /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
  `$1signingConfig project.hasProperty('KALTRACK_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`,
);
if (!s.includes("KALTRACK_SIGNING") ||
    !s.includes("signingConfigs.release : signingConfigs.debug")) {
  console.error("ERRORE: build.gradle ha una struttura inattesa, firma non iniettata");
  process.exit(1);
}
fs.writeFileSync(p, s);
PATCH
fi

# --- Build -----------------------------------------------------------------
echo "==> Build APK release in corso (alcuni minuti la prima volta)..."
( cd "$PROJECT_DIR/android" && ./gradlew assembleRelease \
  -PKALTRACK_STORE_FILE="$KEYSTORE" \
  -PKALTRACK_STORE_PASSWORD="$STORE_PASSWORD" \
  -PKALTRACK_KEY_ALIAS="$KEY_ALIAS" \
  -PKALTRACK_KEY_PASSWORD="$KEY_PASSWORD" )

if [[ ! -f "$APK_PATH" ]]; then
  echo "ERRORE: build finita ma APK non trovato in $APK_PATH" >&2
  exit 1
fi

# Nome parlante e versionato: `app-release.apk` sul telefono non dice niente,
# e gradle lo rigenera comunque al giro dopo.
VERSION="$(node -e 'process.stdout.write(require("./app.json").expo.version)')"
DIST_APK="$(dirname "$APK_PATH")/kaltrack-${VERSION}.apk"
mv -f "$APK_PATH" "$DIST_APK"

echo ""
echo "==> APK PRONTO"
echo "    File : $DIST_APK"
echo "    Peso : $(du -h "$DIST_APK" | cut -f1)"
echo ""
echo "    Per scaricarlo dal telefono:  ./scripts/serve-apk.sh"
echo ""
