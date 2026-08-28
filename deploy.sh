#!/bin/bash
set -e

# =============================================================================
# Deploy Script - Expo (Android / iOS)
# Automatizza la build di produzione per Android e iOS.
# Il nome dell'app viene letto dinamicamente da app.config.ts.
# =============================================================================

YELLOW='\033[1;33m'
GREEN='\033[1;32m'
RED='\033[1;31m'
CYAN='\033[1;36m'
NC='\033[0m'

BASEDIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$BASEDIR/.env"
ENV_BACKUP="$BASEDIR/.env.backup"

# Rileva il file di configurazione Expo (dinamico o statico)
APP_CONFIG=""
for candidate in "app.config.ts" "app.config.js" "app.json"; do
  if [ -f "$BASEDIR/$candidate" ]; then
    APP_CONFIG="$BASEDIR/$candidate"
    break
  fi
done

if [ -z "$APP_CONFIG" ]; then
  printf "${RED}Errore: nessun file di config trovato (app.config.ts, app.config.js o app.json) in ${BASEDIR}.${NC}\n"
  exit 1
fi

# Estrae il nome dell'app dal config (fallback: "Expo App")
APP_NAME=$(grep -E '^[[:space:]]*"?name"?:[[:space:]]*"' "$APP_CONFIG" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
APP_NAME=${APP_NAME:-"Expo App"}

printf "${CYAN}========================================${NC}\n"
printf "${CYAN}  ${APP_NAME} - Deploy${NC}\n"
printf "${CYAN}========================================${NC}\n"
printf "\n"

# --- Step 0: Selezione ambiente ---
printf "${YELLOW}Seleziona l'ambiente di build:${NC}\n"
printf "  1) test\n"
printf "  2) prod\n"
read -p "Scelta [1-2]: " env_choice
printf "\n"

case $env_choice in
  1) ENV_NAME="test" ;;
  2) ENV_NAME="prod" ;;
  *)
    printf "${RED}Scelta non valida.${NC}\n"
    exit 1
    ;;
esac

ENV_SOURCE="$BASEDIR/.env.${ENV_NAME}"

# Controlla che il file .env.<ambiente> esista
if [ ! -f "$ENV_SOURCE" ]; then
  printf "${RED}Errore: file .env.${ENV_NAME} non trovato!${NC}\n"
  printf "Crea il file .env.${ENV_NAME} con le variabili per l'ambiente ${ENV_NAME}.\n"
  exit 1
fi

printf "Build iniziato: $(date)\n"
printf "Ambiente: ${CYAN}${ENV_NAME}${NC}\n"
printf "\n"

# --- Step 1: Swap .env con .env.<ambiente> ---
printf "${YELLOW}[1/4] Configurazione environment ${ENV_NAME}...${NC}\n"
cp "$ENV_FILE" "$ENV_BACKUP"
cp "$ENV_SOURCE" "$ENV_FILE"
printf "${GREEN}  ✔ .env sostituito con .env.${ENV_NAME} (backup salvato in .env.backup)${NC}\n"
printf "\n"

# Funzione di cleanup: ripristina .env originale
cleanup() {
  printf "\n"
  printf "${YELLOW}Ripristino .env originale...${NC}\n"
  if [ -f "$ENV_BACKUP" ]; then
    cp "$ENV_BACKUP" "$ENV_FILE"
    rm "$ENV_BACKUP"
    printf "${GREEN}  ✔ .env ripristinato${NC}\n"
  else
    printf "${RED}  ✘ Nessun backup trovato (.env.backup)${NC}\n"
  fi
}

# Registra cleanup in caso di errore (set -e termina lo script)
trap cleanup ERR INT TERM

# --- Step 2: Installazione dipendenze ---
printf "${YELLOW}[2/4] Installazione dipendenze...${NC}\n"
(cd "$BASEDIR" && npm install)
printf "\n"

# --- Step 3: Selezione target ---
printf "${YELLOW}[3/4] Scegli il target di build:${NC}\n"
printf "  1) Android (apre Android Studio)\n"
printf "  2) iOS (apre Xcode)\n"
read -p "Scelta [1-2]: " choice
printf "\n"

# --- Step 4: Aggiornamento versione + prebuild ---
printf "${YELLOW}[4/4] Aggiornamento versione e prebuild...${NC}\n"

# Estrae i valori correnti dal config via regex (gestisce chiavi con o senza virgolette)
CURRENT_VERSION=$(grep -E '^[[:space:]]*"?version"?:[[:space:]]*"' "$APP_CONFIG" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
CURRENT_IOS_BUILD=$(grep -E '^[[:space:]]*"?buildNumber"?:[[:space:]]*"' "$APP_CONFIG" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
CURRENT_ANDROID_VCODE=$(grep -E '^[[:space:]]*"?versionCode"?:[[:space:]]*[0-9]+' "$APP_CONFIG" | head -1 | sed -E 's/.*"?versionCode"?:[[:space:]]*([0-9]+).*/\1/')

# Fallback se i campi non sono presenti nel config
CURRENT_VERSION=${CURRENT_VERSION:-"1.0.0"}
CURRENT_IOS_BUILD=${CURRENT_IOS_BUILD:-0}
CURRENT_ANDROID_VCODE=${CURRENT_ANDROID_VCODE:-0}

# Calcola versione suggerita (incrementa patch)
SUGGESTED_VERSION=$(python3 -c "
v = '$CURRENT_VERSION'.split('.')
v[-1] = str(int(v[-1]) + 1)
print('.'.join(v))
")

if [ "$choice" = "1" ]; then
  SUGGESTED_BUILD=$((CURRENT_ANDROID_VCODE + 1))
  printf "${YELLOW}[3b] Aggiornamento versione Android${NC}\n"
  printf "  Valori attuali:  version=${CYAN}${CURRENT_VERSION}${NC}  versionCode=${CYAN}${CURRENT_ANDROID_VCODE}${NC}\n"
  printf "  Valori suggeriti: version=${GREEN}${SUGGESTED_VERSION}${NC}  versionCode=${GREEN}${SUGGESTED_BUILD}${NC}\n"
  printf "\n"
  read -p "  Nuova version [$SUGGESTED_VERSION]: " NEW_VERSION
  NEW_VERSION=${NEW_VERSION:-$SUGGESTED_VERSION}
  read -p "  Nuovo versionCode [$SUGGESTED_BUILD]: " NEW_BUILD
  NEW_BUILD=${NEW_BUILD:-$SUGGESTED_BUILD}

  # Aggiorna il file di config
  sed -i '' -E "s/^([[:space:]]*\"?version\"?:[[:space:]]*)\"[^\"]+\"/\1\"${NEW_VERSION}\"/" "$APP_CONFIG"
  if grep -qE '^[[:space:]]*"?versionCode"?:[[:space:]]*[0-9]+' "$APP_CONFIG"; then
    sed -i '' -E "s/^([[:space:]]*\"?versionCode\"?:[[:space:]]*)[0-9]+/\1${NEW_BUILD}/" "$APP_CONFIG"
    printf "${GREEN}  ✔ $(basename "$APP_CONFIG") aggiornato: version=${NEW_VERSION} versionCode=${NEW_BUILD}${NC}\n"
  else
    printf "${GREEN}  ✔ $(basename "$APP_CONFIG") aggiornato: version=${NEW_VERSION}${NC}\n"
    printf "${YELLOW}  ⚠ Campo 'versionCode' assente nel config: impostalo a ${NEW_BUILD} manualmente (o lascia gestire a EAS).${NC}\n"
  fi
else
  SUGGESTED_BUILD=$((CURRENT_IOS_BUILD + 1))
  printf "${YELLOW}[3b] Aggiornamento versione iOS${NC}\n"
  printf "  Valori attuali:  version=${CYAN}${CURRENT_VERSION}${NC}  buildNumber=${CYAN}${CURRENT_IOS_BUILD}${NC}\n"
  printf "  Valori suggeriti: version=${GREEN}${SUGGESTED_VERSION}${NC}  buildNumber=${GREEN}${SUGGESTED_BUILD}${NC}\n"
  printf "\n"
  read -p "  Nuova version [$SUGGESTED_VERSION]: " NEW_VERSION
  NEW_VERSION=${NEW_VERSION:-$SUGGESTED_VERSION}
  read -p "  Nuovo buildNumber [$SUGGESTED_BUILD]: " NEW_BUILD
  NEW_BUILD=${NEW_BUILD:-$SUGGESTED_BUILD}

  # Aggiorna il file di config
  sed -i '' -E "s/^([[:space:]]*\"?version\"?:[[:space:]]*)\"[^\"]+\"/\1\"${NEW_VERSION}\"/" "$APP_CONFIG"
  if grep -qE '^[[:space:]]*"?buildNumber"?:[[:space:]]*"' "$APP_CONFIG"; then
    sed -i '' -E "s/^([[:space:]]*\"?buildNumber\"?:[[:space:]]*)\"[^\"]+\"/\1\"${NEW_BUILD}\"/" "$APP_CONFIG"
    printf "${GREEN}  ✔ $(basename "$APP_CONFIG") aggiornato: version=${NEW_VERSION} buildNumber=${NEW_BUILD}${NC}\n"
  else
    printf "${GREEN}  ✔ $(basename "$APP_CONFIG") aggiornato: version=${NEW_VERSION}${NC}\n"
    printf "${YELLOW}  ⚠ Campo 'buildNumber' assente nel config: impostalo a ${NEW_BUILD} manualmente (o lascia gestire a EAS).${NC}\n"
  fi
fi
printf "\n"

case $choice in
  1)
    printf "${YELLOW}Prebuild Android...${NC}\n"
    (cd "$BASEDIR" && npx expo prebuild --platform android --clean)
    printf "${GREEN}  ✔ Prebuild Android completato${NC}\n"
    printf "\n"
    printf "${YELLOW}Apertura Android Studio...${NC}\n"
    open -a "Android Studio" "$BASEDIR/android"
    printf "${GREEN}  ✔ Android Studio aperto${NC}\n"
    ;;
  2)
    printf "${YELLOW}Prebuild iOS...${NC}\n"
    (cd "$BASEDIR" && npx expo prebuild --platform ios --clean)
    printf "\n"

    # Rileva il nome del progetto Xcode generato da prebuild (dipende da name in app.config.ts)
    IOS_XCODE_NAME=$(find "$BASEDIR/ios" -maxdepth 1 -name "*.xcworkspace" -exec basename {} .xcworkspace \; | head -1)
    if [ -z "$IOS_XCODE_NAME" ]; then
      printf "${RED}  ✘ Nessun .xcworkspace trovato in ios/${NC}\n"
      exit 1
    fi

    # Fix: expo prebuild non aggiorna MARKETING_VERSION e CURRENT_PROJECT_VERSION nel pbxproj
    PBXPROJ="$BASEDIR/ios/${IOS_XCODE_NAME}.xcodeproj/project.pbxproj"
    printf "${YELLOW}Sincronizzazione versione nel progetto Xcode (${IOS_XCODE_NAME})...${NC}\n"
    sed -i '' "s/MARKETING_VERSION = .*/MARKETING_VERSION = ${NEW_VERSION};/g" "$PBXPROJ"
    sed -i '' "s/CURRENT_PROJECT_VERSION = .*/CURRENT_PROJECT_VERSION = ${NEW_BUILD};/g" "$PBXPROJ"
    printf "${GREEN}  ✔ Versione aggiornata: ${NEW_VERSION} (build ${NEW_BUILD})${NC}\n"
    printf "\n"

    printf "${YELLOW}Apertura Xcode...${NC}\n"
    open -a "Xcode" "$BASEDIR/ios/${IOS_XCODE_NAME}.xcworkspace"
    printf "${GREEN}  ✔ Xcode aperto${NC}\n"
    ;;
  *)
    printf "${RED}Scelta non valida.${NC}\n"
    exit 1
    ;;
esac

printf "\n"
printf "${CYAN}========================================${NC}\n"
printf "${GREEN}  Prebuild completato! $(date)${NC}\n"
printf "${CYAN}========================================${NC}\n"
printf "\n"
printf "${YELLOW}Prossimi step:${NC}\n"
if [ "$choice" = "1" ]; then
  printf "  Android: Build > Generate Signed Bundle/APK in Android Studio\n"
fi
if [ "$choice" = "2" ]; then
  printf "  iOS: Product > Archive in Xcode, poi upload su App Store Connect\n"
fi
printf "\n"
printf "${YELLOW}  ATTENZIONE: Il file .env è attualmente configurato per ${ENV_NAME}.${NC}\n"
printf "${YELLOW}  Completa la build in Android Studio/Xcode prima di ripristinarlo.${NC}\n"
printf "\n"
read -p "Hai completato la build? Ripristinare il file .env originale? [y/N]: " restore_choice
if [ "$restore_choice" = "y" ] || [ "$restore_choice" = "Y" ]; then
  cleanup
else
  printf "\n"
  printf "${YELLOW}⚠ Il file .env di produzione è ancora attivo.${NC}\n"
  printf "${YELLOW}  Per ripristinare manualmente:${NC}\n"
  printf "  cp .env.backup .env && rm .env.backup\n"
fi
