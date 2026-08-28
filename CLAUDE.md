# CLAUDE.md

Guida per Claude Code (claude.ai/code) su questo repository.

## Cos'è KalTrack

App mobile personale (iOS e Android, focus Android) per il tracking di
alimentazione, peso, passi e allenamento, con un assistente vocale AI come modo
principale di inserimento dati. Utente singolo, nessun account.

- Design: `docs/superpowers/specs/2026-08-28-kaltrack-design.md`
- Piano Fase 1: `docs/superpowers/plans/2026-08-28-kaltrack-fase-1-nutrizione.md`

## Comandi

```bash
npm start            # Dev server (expo start --dev-client)
npm run android      # Build ed esecuzione su Android (expo run:android)
npm run ios          # Build ed esecuzione su iOS (expo run:ios)
npm run typecheck    # TypeScript (tsc --noEmit)
npm run lint         # ESLint (expo lint)
npm test             # Jest
```

Emulatore e screenshot:

```bash
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1 -no-snapshot-load &
adb exec-out screencap -p > /tmp/kaltrack.png
adb logcat -d -s ReactNativeJS:V | tail -50
```

## Deploy

`deploy.sh` automatizza i prebuild di produzione per Android e iOS. È
project-agnostic: nessun nome app o percorso di config hardcodato.

```bash
./deploy.sh          # Deploy interattivo (chiede ambiente e target)
```

## Architettura

React Native 0.83 + Expo 55 + React 19, New Architecture attiva. iOS 15.1+,
Android SDK 24+. **Nessun target web**: niente `react-native-web`, niente branch
`Platform.OS === "web"`.

### Local-first

Non esiste un backend. Tutti i dati vivono in SQLite sul telefono
(`expo-sqlite`), lo schema è creato da migrazioni numerate tracciate in
`PRAGMA user_version`. Ogni tabella ha `id` (UUID), `created_at`, `updated_at`,
`deleted_at`: lo schema è sync-ready, così un backend Laravel si può innestare
in futuro senza rifare il modello dati.

Il layer `src/db/` è l'unico che conosce SQL:

- `sqliteAdapter.ts` — interfaccia `LocalDatabase` che astrae il driver. L'app
  la riempie con expo-sqlite, i test con better-sqlite3 in memoria, quindi le
  query si testano davvero invece di essere mockate.
- `index.ts` — singleton `getDb()`, PRAGMA di connessione, `initDatabase()`.
- `migrations/` — runner e migrazioni numerate.
- `queries/` — funzioni tipizzate per dominio. **Le schermate non contengono
  SQL.**

### Logica di dominio

`src/domain/` contiene funzioni pure senza React né DB (calcoli nutrizionali,
TDEE, date), tutte coperte da test unitari. Le schermate non calcolano nulla per
conto proprio.

### Lingua

**Solo italiano.** L'app è personale, l'inglese sarebbe stato lavoro doppio su
ogni stringa per un utente che non esiste. La struttura i18n resta in piedi
(`i18n-js`, `useTranslation`, `translationStore`), quindi ogni testo visibile va
comunque scritto come `t("chiave")` e mai come stringa letterale nel JSX.

Per reintrodurre una lingua servono tre modifiche e nient'altro:

1. tradurre una copia di `src/i18n/locales/it.json` (le chiavi ci sono già tutte)
2. registrarla in `src/i18n/index.ts` e in `SUPPORTED_LANGUAGES`
   (`src/stores/translationStore.ts`)
3. aggiungerla a `app.json` > plugin `expo-localization` > `supportedLocales`

Lo store rileva già la lingua del dispositivo e la persiste: con più lingue
disponibili quel comportamento torna attivo da solo.

### Path alias

`@/` per gli import assoluti dalla root (es. `@/src/components/...`). Mai
percorsi relativi `../`.

### Navigazione

React Navigation 7.x con API statica (`createStaticNavigation`). I tipi sono
generati da `StaticParamList` in `src/navigation/index.tsx`. `useAppNav`
centralizza l'unico cast necessario.

### Organizzazione dei componenti

- `src/components/` — generici, presentazionali, riusabili (`ui/`, `form/`,
  `kal/`, `icons/`).
- `src/containers/<feature>/` — componenti legati alla feature (es.
  `src/containers/diary/`). Raggruppati per feature, non per tipo.

Estraendo un componente da una schermata, default a `containers/<feature>/` a
meno che non sia davvero generico.

### Styling

Doppio sistema: `StyleSheet.create()` con token statici da `src/styles.ts`, più
`useAppTheme()` per i colori semantici light/dark (background, surface, border,
text). NativeWind disponibile ma non prevalente. I componenti `Text` e
`TextInput` in `src/components/ui/` risolvono automaticamente Poppins da
fontWeight: **usare sempre quelli**, mai le primitive RN nude.

`theme.colors.macro` (proteine, carboidrati, grassi) sono token: grafici, barre
e legende devono usarli per non divergere.

### Convenzioni non negoziabili

Valgono le guide Dieffetech `docs/react-native/`:

- `TouchableOpacity` con `activeOpacity={0.6}`, mai `Pressable` con
  style-as-function (con NativeWind v4 non viene applicato: nessun feedback al
  tap). `hitSlop={8}` sui target piccoli.
- Token da `@/src/styles`, mai hex o numeri magici inline.
- Elementi assoluti, overlay e bottoni flottanti ancorati con
  `useSafeAreaInsets()`.
- Ogni testo visibile via `t("chiave")`, chiavi in `src/i18n/locales/it.json`.
- Animazioni con `react-native-reanimated`; il suo plugin babel resta l'ultimo.
- TypeScript strict, mai `any`.
- Logging solo via `logger`, mai `console.*`.

## AI (Fase 2)

Tutte le capability passano da Groq: Whisper per la trascrizione, un modello con
function calling per l'assistente, un modello vision per la stima da foto.
`expo-speech` per le risposte parlate (on-device).

La chiave sta in `EXPO_PUBLIC_GROQ_API_KEY` e **finisce nel bundle in chiaro**:
accettabile finché l'APK resta personale, da spostare dietro un proxy se l'app
viene condivisa.
