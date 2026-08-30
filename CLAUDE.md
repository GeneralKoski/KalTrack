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

**Il telefono è la fonte di verità.** Tutti i dati vivono in SQLite sul telefono
(`expo-sqlite`), lo schema è creato da migrazioni numerate tracciate in
`PRAGMA user_version`. Ogni tabella ha `id` (UUID), `created_at`, `updated_at`,
`deleted_at`.

Dalla Fase 5 esiste anche un backend Laravel (`backend/`), ma non cambia questa
regola: l'app scrive su SQLite come ha sempre fatto e continua a funzionare
senza rete e senza account. Il server tiene una **copia**. Non è un'app che
parla con un'API, è un'app locale che tiene una copia altrove: la differenza si
sente in palestra, dove il segnale non c'è e una serie va registrata lo stesso.

Il layer `src/db/` è l'unico che conosce SQL:

- `sqliteAdapter.ts` — interfaccia `LocalDatabase` che astrae il driver. L'app
  la riempie con expo-sqlite, i test con better-sqlite3 in memoria, quindi le
  query si testano davvero invece di essere mockate.
- `index.ts` — singleton `getDb()`, PRAGMA di connessione, `initDatabase()`.
- `migrations/` — runner e migrazioni numerate.
- `queries/` — funzioni tipizzate per dominio. **Le schermate non contengono
  SQL.**

### Sincronizzazione

`src/services/sync.ts`, `backend/README.md` per il lato server. Quattro regole
che sembrano dettagli e sono ognuna un difetto già pagato:

1. **Mai `DELETE FROM` su una tabella sincronizzata.** Una riga tolta davvero
   non ha più modo di dire all'altro dispositivo che è stata tolta: il server
   rimanda la sua copia e la riga risorge. Si scrive `deleted_at`, e le letture
   filtrano `deleted_at IS NULL`. Vale anche per le riscritture in blocco (gli
   ingredienti di una ricetta): cancellare e reinserire con id nuovi fa
   accumulare duplicati sull'altro telefono.
2. **Le ore non si confrontano come stringhe.** La stessa ora è
   `...T10:00:00.000Z` qui e `...T10:00:00+00:00` dal server. Si passa da
   `Date.parse`, e si legge il timestamp dentro il payload (quello del telefono
   d'origine, con i millesimi) e non quello della busta.
3. **Due segnaposto, non uno** (`src/services/syncMarkers.ts`). `sync.cursor` è
   il contatore del server, `sync.pushed_at` l'ora di questo telefono. Sono
   locali, non viaggiano, e si azzerano a ogni accesso perché valgono per un
   account solo.
4. **Un'impostazione che parla del dispositivo non si sincronizza.** Va in
   `LOCAL_ONLY_SETTINGS`. Una che parla dei dati sì: `plan_applied:<data>` deve
   viaggiare, o l'altro telefono riapplica il piano e duplica i pasti.

### Le foto

La sincronizzazione porta le **righe**, non i file. Quattro colonne contengono
un percorso (`foods.image_uri`, `recipes.photo_uri`, `meal_entries.photo_uri`,
`progress_photos.uri`) e su un altro telefono quel percorso non ha niente
dietro.

I byte viaggiano a parte (`src/services/photoSync.ts`, `/api/images`), e
l'identita' di una foto e' il suo **nome**: la cartella dell'app cambia da
sistema a sistema, il nome no. Per questo i nomi sono UUID - due foto diverse
che collidono su un nome diventerebbero la stessa foto sull'altro telefono.

Una foto che qui non c'e' si disegna con un segnaposto e non con un rettangolo
vuoto (`SyncedPhoto`): il rettangolo vuoto sembra un difetto dell'app, il
segnaposto dice che la foto esiste e non e' ancora arrivata.

### Il confronto con gli amici

`src/domain/comparison.ts`. Le regole **non** sono uniformi, ed e' una scelta di
prodotto scritta nei test:

- passi e allenamenti hanno un vincitore;
- le calorie si affiancano **senza** vincitore - mangiare piu' o meno di
  un'altra persona non e' meglio ne' peggio, e una spunta sarebbe un consiglio
  sbagliato;
- il peso non si confronta affatto;
- un numero mancante non e' un pareggio ne' un ultimo posto.

Cambiarle deve essere deliberato: hanno test propri che le enunciano.

### Nomi utente

"A" e "a" sono lo stesso nome: se uno e' preso l'altro non e' disponibile. Le
maiuscole si conservano, il confronto le ignora, e la regola vale **ovunque** -
accesso, unicita', apertura di un profilo, ricerca. Lato server c'e' un solo
posto che lo sa (`User::whereHandle`).

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

## AI

Tutte le capability passano da Groq: Whisper per la trascrizione, un modello con
function calling per l'assistente, un modello vision per la stima da foto.
`expo-speech` per le risposte parlate (on-device).

La chiave **la porta chi usa l'app**: si inserisce in Profilo > Impostazioni e
vive in SecureStore su quel telefono (`src/stores/aiKeyStore.ts`). Non e' nel
bundle e non e' nel database.

Non va salvata in `settings`: quella tabella si sincronizza, e la chiave
finirebbe sul server in chiaro dentro `sync_records`. E' la scorciatoia ovvia
ed e' esattamente il danno che questa scelta toglie.
