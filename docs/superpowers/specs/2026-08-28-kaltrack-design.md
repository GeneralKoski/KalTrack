# KalTrack - Design

Data: 2026-08-28
Stato: approvato

## 1. Obiettivo

App mobile personale (React Native + Expo, iOS e Android con focus Android) per il
tracking di alimentazione, peso, passi e allenamento in palestra, con un assistente
vocale AI come modo principale di inserimento dati.

Utente unico: il proprietario del telefono. Nessun account, nessun login.

## 2. Decisioni architetturali

### 2.1 Local-first

Tutti i dati vivono in SQLite sul telefono, e il telefono resta la fonte di verita'.

> **Aggiornato in Fase 5.** Alla stesura questa sezione si intitolava "nessun backend" e
> diceva che un server applicativo non esisteva. Ora esiste (`backend/`), ma la regola
> non e' cambiata: l'app scrive in locale, funziona offline e funziona senza account. Il
> server tiene una **copia**. Quel che segue resta valido, con le due note in fondo.

Conseguenze accettate:
- Funzionamento offline totale, nessuna latenza di rete per l'uso quotidiano.
- La chiave API Groq sta nel bundle (`EXPO_PUBLIC_GROQ_API_KEY`), quindi in chiaro.
  Accettabile perche' l'APK non viene distribuito. **Debito ancora aperto**: vedi 9.4.
- Perdere il telefono significa perdere i dati, quindi export/backup e' parte della Fase 1
  e non un extra.

Lo schema e' progettato **sync-ready**: ogni tabella ha `id TEXT` (UUID), `created_at`,
`updated_at`, `deleted_at`. Quella previsione ha retto: il backend si e' innestato senza
toccare il modello dati.

Le due note:
- **Perdere il telefono non significa piu' perdere tutto**, se si e' fatto l'accesso. Il
  backup manuale resta comunque, perche' e' l'unico che funziona senza account.
- I costi di infrastruttura non sono piu' zero, ma il server esisteva gia' per altro.

### 2.2 Sorgenti dei dati nutrizionali

Tre livelli, in cascata:
1. **Seed locale** di almeno 150 alimenti comuni italiani (crudi e generici: petto di
   pollo, riso, olio EVO, uovo), curati a mano. Offline, immediato. Il resto del
   catalogo arriva da OpenFoodFacts al primo uso invece di essere scritto a mano.
2. **OpenFoodFacts** per prodotti di marca, via barcode o ricerca testuale. Il risultato
   viene copiato in locale al primo uso, quindi la seconda volta e' offline.
3. **Stima AI** come fallback, marcata `is_estimated`.

### 2.3 AI: Groq

- STT: Whisper large-v3-turbo su Groq. Scelto rispetto allo speech recognizer on-device
  perche' sui nomi di alimenti italiani e sulle quantita' parlate sbaglia molto meno,
  a costo trascurabile.
- LLM con function calling per l'assistente e per il parsing.
- Vision per la stima calorica da foto.
- TTS: `expo-speech`, on-device, gratuito.

I model id esatti si fissano in implementazione verificando la disponibilita' corrente
su Groq, e sono configurabili in un solo punto (`src/ai/config.ts`).

## 3. Base tecnica

### 3.1 Punto di partenza

Copia di `react-native-expo-template` (RN 0.83, Expo 55, React 19, New Architecture),
piu' componenti e pattern estratti da `ZCC-omnia-marine` (progetto Dieffetech gia'
local-first).

### 3.2 Cosa si tiene dal template

- `src/components/ui/` (`Text`, `TextInput` con risoluzione automatica Poppins)
- `src/components/form/`: `DfForm`, `DfInput`, `DfNumberInput`, `DfSelect`, `DfSwitch`,
  `DfDatePicker`, `DfDateMaskInput`, `DfButton`, `DfCheckbox`, `FormScrollContext`
- `DfBottomSheet`, `DfAlert`, `DfImage`, `Skeleton`, `DfBackButton`, `ThemeContext`,
  `FormScreen`
- `components/ui/` gluestack, solo: `gluestack-ui-provider`, `select`, `switch`,
  `alert-dialog`, `icon`, `vstack` (dipendenze reali di DfSelect/DfSwitch/DfAlert)
- Zustand stores, i18n (it/en), `utils/` (toast, logger, dateUtils), navigation static API

### 3.3 Cosa si rimuove dal template

- Auth e backend: `authStore`, `userStore`, `LoginScreen`, `useLogout`, `useUser`,
  `api/client.ts` con interceptor Bearer/refresh, `useApi`, `useGetItem`, `DfApiSelect`
- Schermate demo: `HomeScreen`, `DetailScreen`, `ProfileScreen`, `DfTabView`
- Target web: `react-native-web`, `react-dom`, script `web`/`build:web`, i branch
  `Platform.OS === "web"` (la guida Dieffetech RN vieta il target web sui progetti mobile)
- Dipendenze non usate: `expo-router`, `expo-web-browser`, `expo-glass-effect`,
  `expo-symbols`

### 3.4 Cosa si porta da Omnia Marine

**Layer DB**
- `db/sqliteAdapter.ts`: l'interfaccia `LocalDatabase` che astrae il driver. Qui viene
  implementata con `expo-sqlite`; mantenere la stessa superficie rende il passaggio a
  op-sqlite/SQLCipher una modifica a un solo file. La cifratura non e' necessaria:
  Android cifra gia' lo storage dell'app e op-sqlite complica la build.
- `db/index.ts`: singleton `getDb()` e PRAGMA di connessione (WAL, `synchronous NORMAL`,
  `temp_store MEMORY`) impostate una sola volta all'apertura, fuori da transazione.
- **Divergenza**: Omnia genera lo schema da `entities.ts` con tutte colonne TEXT perche'
  rispecchia un ERP. KalTrack usa **migrazioni numerate** con `PRAGMA user_version`,
  tipi reali e vincoli.
- Pattern `db/queries.ts`: funzioni tipizzate che ritornano row types, mai SQL nelle
  schermate. Suddiviso per dominio: `queries/nutrition.ts`, `queries/workout.ts`,
  `queries/tracking.ts`.
- Pattern `db/devSeed.ts` per i seed di alimenti ed esercizi.

**Hook**
- `useFocusData`: carica dal DB al focus schermata, spinner solo al primo caricamento,
  refresh in sottofondo al re-focus. Preso quasi identico, senza il gancio a `lookupsStore`.
- `useAppNav`: navigazione tipizzata con l'unico cast centralizzato. E' anche
  l'implementazione del tool `navigate` dell'assistente.
- `useOnlineStatus`: usato per sapere se l'AI e' disponibile e comunicarlo invece di far
  fallire la richiesta. Aggiunge `expo-network`.

**UI** - `components/omnia/` rinominati in `components/kal/`: `Card`, `SearchBar`,
`Filters`, `GradientHeader`, `ScreenBackground`, `Avatar`, `Primitives`
(`SectionLabel`, `EmptyState`, `IconTile`, `Chip`, `StatTiles`), `TrafficDot`
(riusato per lo stato rispetto all'obiettivo: sotto / in range / sopra),
`SwipeTabView` (scorrimento tra i giorni del diario), `ExitConfirm`, `toastConfig`.

**Infrastruttura** - `jest.config.js` (preset jest-expo, mapping `@/`), il pattern
`src/domain/` con logica pura testata, `services/errorReport.ts`, `deploy.sh`,
`scripts/serve-apk.sh`.

**Cosa NON si porta**: sync engine, parser Omnia, `entities.ts` spec-driven, SQLCipher e
`encryptionKey.ts`, authStore/profileStore multi-istanza, pdf/print/blob-util.

### 3.5 Dipendenze aggiunte

| Pacchetto | Uso |
|---|---|
| `expo-sqlite` | database locale |
| `expo-audio` | registrazione vocale |
| `expo-speech` | risposte parlate dell'assistente |
| `expo-camera` | foto pasti e scan barcode (integrato) |
| `expo-image-picker` | scelta foto da galleria (Fase 1, foto ricetta) |
| `expo-image-manipulator` | resize e compressione prima dell'invio all'AI |
| `expo-file-system` | base64 per audio e foto |
| `expo-crypto` | `randomUUID()` per gli id |
| `expo-haptics` | feedback sulle azioni rapide |
| `expo-network` | stato online per la disponibilita' AI |
| `expo-linear-gradient` | `GradientHeader` |
| `expo-sharing` | export del backup |

### 3.6 Convenzioni

Valgono le guide Dieffetech `docs/react-native/`:
- `TouchableOpacity` con `activeOpacity={0.6}`, mai `Pressable` con style-as-function
- token statici da `@/src/styles`, mai hex o numeri magici inline
- `StyleSheet.create()` primario, NativeWind disponibile ma non prevalente
- safe area via `useSafeAreaInsets()` per tutto cio' che e' assoluto
- componenti `@/src/components/ui` al posto delle primitive RN nude
- ogni testo visibile via `t("chiave")`, chiavi in `it.json` (app solo italiano)
- animazioni con `react-native-reanimated`
- import con alias `@/`, TypeScript strict, mai `any`
- logging solo via `logger`

## 4. Modello dati

Colonne comuni a tutte le tabelle: `id TEXT PRIMARY KEY` (UUID v4 da `expo-crypto`),
`created_at TEXT`, `updated_at TEXT`, `deleted_at TEXT NULL`.
Migrazioni numerate in `src/db/migrations/`, applicate in base a `PRAGMA user_version`.

### 4.1 Nutrizione

**`foods`** - tabella unica per alimenti base e prodotti di marca.
`name`, `name_norm` (nome normalizzato: minuscolo, senza accenti ne' punteggiatura,
usato dalla ricerca e dal matching vocale), `brand`, `source` (`seed` | `off` | `user` | `ai`), `barcode`, `off_id`,
valori per 100 g o 100 ml: `kcal`, `protein`, `carbs`, `sugars`, `fat`, `saturated_fat`,
`fiber`, `salt`; `is_liquid`, `default_serving_g`, `serving_label` ("1 vasetto = 150 g"),
`image_uri`, `is_favorite`, `usage_count`, `is_estimated`.

**`recipes`** - i pasti custom dell'utente: `name`, `name_norm`, `photo_uri`, `servings`,
`notes`, `is_favorite`, `usage_count`. I valori nutrizionali sono derivati, non memorizzati.

**`recipe_items`** - riga di ricetta: `recipe_id`, `food_id` **oppure** `child_recipe_id`
(una ricetta puo' contenerne un'altra), `quantity_g`, `servings`, `sort`.
Un ingrediente-alimento si conta in **grammi**, un ingrediente-ricetta in **porzioni**:
l'unita' resta cosi' non ambigua a ogni livello di annidamento.
Vincolo: esattamente uno tra `food_id` e `child_recipe_id` valorizzato. Le ricette
annidate sono limitate a profondita' 3 e protette da un check anti-ciclo in fase di
salvataggio.

**`meal_types`** - `name`, `icon`, `sort`, `is_custom`. Seed: colazione, pranzo, cena,
snack, brunch.

**`meals`** - `date` (`YYYY-MM-DD`), `meal_type_id`, `name` (override facoltativo),
`time`, `notes`.

**`meal_entries`** - le righe di un pasto.
`meal_id`, `source_kind` (`food` | `recipe` | `free`), `food_id`, `recipe_id`,
`label` (per le voci libere: "margherita al ristorante"), `quantity_g`, `servings`,
`is_estimated`, `confidence`, `note`, `photo_uri`, `created_via` (`manual` | `voice` | `photo` | `barcode`),
piu' lo **snapshot dei macro al momento dell'inserimento**: `kcal`, `protein`, `carbs`,
`fat`, `sugars`, `saturated_fat`, `fiber`, `salt`.
Lo snapshot e' deliberato: correggere domani i valori di un alimento non deve riscrivere
lo storico.

### 4.2 Obiettivi e corpo

**`profile`** - riga singola: `sex`, `birthdate`, `height_cm`, `activity_level`,
`goal` (`cut` | `maintain` | `bulk`).

**`targets`** - obiettivi storicizzati: `valid_from`, `kcal`, `protein_g`, `carbs_g`,
`fat_g`, `steps`. Storicizzati perche' cambiare obiettivo oggi non deve falsare i
grafici dei mesi passati.

**`weight_logs`** - `date`, `weight_kg`, `body_fat_pct`, `note`.

**`step_logs`** - `date`, `steps`, `source` (`manual` | `voice`).

### 4.3 Palestra

**`exercises`** - `name`, `muscle_group`, `secondary_muscles` (JSON), `equipment` (JSON),
`is_custom`, `is_banned` (mai proporlo), `dislike_level` (0-2: proponilo solo come ultima
risorsa), `notes`, `instructions`. Seed di ~150 esercizi.

**`user_equipment`** - `name`, `available`. Filtra le proposte AI.

**`routines`** - `name`, `is_active`, `notes`, `generated_by_ai`.

**`routine_days`** - `routine_id`, `name` ("Push A"), `sort`.

**`routine_blocks`** - `routine_day_id`, `kind` (`single` | `superset` | `circuit` |
`dropset`), `sort`, `rest_seconds`, `notes`. Il livello di blocco e' cio' che rende
esprimibili superset, circuiti e dropset senza casi speciali sparsi nel codice.

**`block_exercises`** - `routine_block_id`, `exercise_id`, `sort`, `target_sets`,
`target_reps` (testo, es. "8-12"), `target_weight`, `tempo`, `rpe`, `notes`.

**`workout_sessions`** - `date`, `routine_day_id` (facoltativo), `started_at`,
`ended_at`, `notes`.

**`session_sets`** - `workout_session_id`, `exercise_id`, `block_ref`, `set_index`,
`reps`, `weight`, `rpe`, `is_warmup`, `done_at`. Separato dalla scheda: cosa era in
programma e cosa e' stato fatto sono dati distinti.

### 4.4 Sistema

**`settings`** - chiave/valore: `voice_reply_enabled`, `auto_confirm` (per capability),
lingua, unita' di misura.

**`ai_calls`** - log leggero: `capability`, `model`, `tokens_in`, `tokens_out`,
`latency_ms`, `success`, `error`. Utile per capire il consumo e per fare debug di un
parsing andato male.

## 5. Assistente vocale

E' il modo principale di usare l'app, non una scorciatoia accessoria.

### 5.1 Accesso e ciclo

Bottone mic flottante su ogni schermata, ancorato con `useSafeAreaInsets()` sopra la tab
bar. Tap per parlare, non c'e' wake word. Si apre un overlay: onda audio durante la
registrazione, trascrizione, poi risposta.

Ciclo: audio → Whisper (Groq) → LLM con function calling → esecuzione tool → risposta.
Circa 2-4 secondi end-to-end.

### 5.2 Registro dei tool

L'assistente ha un set **chiuso** di azioni dichiarate come funzioni. Aggiungerne una
significa scrivere un file in `src/ai/tools/`, non modificare i prompt.

| Tool | Esempio |
|---|---|
| `navigate(screen, params)` | "portami alla scheda di oggi", "apri i miei prodotti" |
| `add_meal_entries` | "a pranzo 150 g di riso e 200 g di pollo" |
| `create_recipe` | "salva questo come iper pizza proteica" |
| `update_entry` / `delete_entry` | "cambia il riso a 200 grammi" |
| `copy_meal_from_day` | "a cena come ieri" |
| `log_steps` | "lunedi' 8000 passi, martedi' 12000" |
| `log_weight` | "oggi peso 78 e mezzo" |
| `log_set` / `start_session` | "panca 80 per 8" |
| `suggest_alternative` / `swap_exercise` | "trovami un'alternativa alla leg press" |
| `query_summary` | "quante proteine mi mancano oggi?" |
| `set_target` | "alza le calorie a 2400" |

`navigate` e' implementato sopra `navigationRef` e `useAppNav`.

### 5.3 Contesto passato al modello

Compatto, non l'intero database: data e ora, schermata corrente, obiettivi del giorno e
residuo calorico, elenco dei nomi delle ricette dell'utente e dei prodotti piu' usati con
i rispettivi id, ultimi esercizi svolti.

E' questo che permette "sto facendo la mia iper pizza proteica" di agganciare la ricetta
esistente invece di ricostruirla ingrediente per ingrediente.

### 5.4 Risoluzione degli alimenti

**L'LLM estrae solo cosa e quanto, mai i valori nutrizionali.** La risoluzione e' locale
e in cascata:

1. match sulle ricette dell'utente (normalizzazione + distanza di edit)
2. match sui prodotti dell'utente
3. match sul seed locale
4. ricerca OpenFoodFacts
5. stima AI, marcata `is_estimated` con `confidence`

Cosi' i numeri arrivano da dati reali finche' esistono e il modello non puo' inventare le
calorie.

### 5.5 Conferma ed esecuzione

Default: **anteprima + Conferma**. Ogni tool dichiara come renderizzare la propria
anteprima: si vede la riga risultante (alimento, grammi, macro calcolati, destinazione)
prima che venga scritta.

Accanto a Conferma c'e' **"Non chiedere piu' per questa azione"**: da quel momento quel
tipo di azione si esegue subito, con toast e **Annulla** disponibile alcuni secondi.
La preferenza e' **per capability**, non globale, e vive in `settings.auto_confirm`.

Due eccezioni che chiedono conferma sempre, anche con auto-confirm attivo:
- le cancellazioni
- qualsiasi risultato con confidenza bassa o con alimenti non risolti

In Impostazioni c'e' l'elenco delle azioni auto-confermate, con revoca.

Se manca un dato essenziale l'assistente fa una domanda e tiene aperta la sessione invece
di indovinare.

### 5.5-bis Lingua dell'assistente

L'app e' solo italiana (3.6), ma la lingua dell'assistente si decide in tre punti
distinti, con vincoli diversi.

**Trascrizione.** Whisper e' multilingue, ma la lingua va **fissata a `it`**, non
lasciata all'autodetect: su clip corte come "duecento grammi di riso" la rilevazione
automatica a volte sbaglia lingua, e fissarla migliora anche accuratezza e latenza.

**Comprensione e tool calling.** Schema dei tool e istruzioni di sistema **in inglese**,
contenuto utente e risposte **in italiano**. I modelli seguono le istruzioni meglio in
inglese e rispondono comunque nella lingua dell'utente. E' una convenzione interna:
l'utente vede solo italiano.

**Risposta parlata.** La lingua qui non la decide Groq ma il motore TTS del sistema
operativo. iOS ha voci italiane native; su Android arrivano da Google TTS e possono
mancare. Va quindi verificata a runtime la disponibilita' di una voce `it-IT`: se
manca, l'assistente ripiega sul **solo testo**, senza parlare in un'altra lingua ne'
restare muto.

**Due specificita' dell'italiano da gestire esplicitamente nel prompt di parsing:**

- **Gli etti.** "Un etto di prosciutto", "due etti e mezzo di pasta", "mezzo chilo"
  sono il modo normale di esprimere le quantita' in Italia. Vanno normalizzati:
  etto = 100 g, mezzo chilo = 500 g, "un etto e mezzo" = 150 g. Senza istruzione
  esplicita il modello passa a volte `1` invece di `100`.
- **Termini inglesi mescolati.** In nutrizione e palestra si parla italiano usando
  "whey", "overnight oats", "lat machine", "leg press" nella stessa frase. Whisper
  gestisce bene il code-switching; il matching lato locale e' gia' coperto da
  `normalizeText` (5.4), che normalizza entrambe le lingue allo stesso modo.

### 5.6 Risposte parlate

Risposta vocale con `expo-speech` in italiano, attiva di default, disattivabile da
Impostazioni (`voice_reply_enabled`). Il testo e' comunque sempre a schermo: la voce e' un
canale in piu', mai l'unico - il che copre anche il caso in cui la voce `it-IT` non sia
installata sul dispositivo (5.5-bis).

### 5.7 Percorso manuale sempre presente

L'assistente e' uno strato **sopra** l'app. Ogni azione ha anche il suo percorso manuale,
perche' senza rete l'assistente non funziona e perche' correggere un valore a mano e' piu'
veloce che ridettarlo.

### 5.8 Stima calorica da foto

Foto da camera o galleria, ridimensionata e compressa, inviata al modello vision con un
campo **note** facoltativo ("erano circa 300 g di pasta, condita con olio"). Il risultato
e' una o piu' righe stimate, sempre in anteprima modificabile, sempre marcate
`is_estimated`. La foto resta allegata alla riga.

## 6. Schermate

Quattro tab piu' il mic flottante globale.

**Oggi** - anello calorie e barre macro rispetto all'obiettivo, elenco dei pasti del
giorno raggruppati per tipo, passi del giorno, swipe orizzontale per cambiare giorno.
FAB di aggiunta con: manuale, voce, foto, barcode.

**Progressi** - grafici peso, calorie, macro, passi; medie settimanali; PR e 1RM stimati;
storico allenamenti.

**Palestra** - schede, esecuzione della sessione, catalogo esercizi, generazione scheda.

**Profilo** - dati personali, obiettivi, i miei prodotti, i miei pasti, attrezzatura,
esercizi vietati, impostazioni AI (voce, auto-conferma), backup ed export.

## 7. Palestra: comportamenti chiave

**Esecuzione sessione** - serie da spuntare, precompilate con carico e ripetizioni
dell'ultima volta sullo stesso esercizio, timer di recupero, note.

**Proponi alternativa** - **prima filtro locale**: stesso gruppo muscolare, attrezzatura
posseduta, esclusi i `is_banned`, `dislike_level` alto in fondo. **Poi** l'AI ordina i
candidati e spiega il perche'. In palestra senza campo la funzione resta usabile, solo
senza la spiegazione.

**Genera scheda** - wizard (obiettivo, giorni a settimana, durata seduta, attrezzatura,
esercizi vietati e sgraditi, livello) → l'AI produce la struttura → **validazione locale**
che scarta esercizi inesistenti o vietati prima di mostrare il risultato → anteprima →
salvataggio.

**Progressi** - PR per esercizio e 1RM stimato con formula di Epley, calcolati in
`src/domain/` e coperti da test.

## 8. Fasi di sviluppo

Ogni punto si chiude con: `typecheck` + `lint` + `test` verdi, app che si avvia,
screenshot di verifica, commit.

**Fase 1 - Nutrizione manuale (app usabile ogni giorno)**
1. Setup progetto: copia template, pulizia, dipendenze, struttura cartelle, primo commit
2. Layer DB: adapter, migrazioni, query tipizzate, test
3. Design system: componenti da Omnia, tema, navigazione a 4 tab
4. Alimenti: seed, CRUD prodotti, ricerca, preferiti
5. Ricette: CRUD, ingredienti annidati, calcolo nutrizionale derivato, foto
6. Diario: pasti, tipi di pasto custom, righe, snapshot macro
7. Obiettivi: profilo, TDEE suggerito, target storicizzati, anello e barre macro
8. Passi e peso: inserimento manuale, calendario
9. Backup: export e import JSON, condivisione file

**Fase 2 - AI sulla nutrizione**
10. Infrastruttura AI: client Groq, config modelli, log chiamate, gestione errori e offline
11. Overlay assistente: registrazione, Whisper, trascrizione, TTS, impostazioni voce
12. Registro tool e loop di function calling, anteprima e auto-conferma per capability
13. Risoluzione alimenti in cascata, integrazione OpenFoodFacts, scan barcode
14. Stima da foto con note

**Fase 3 - Palestra**
15. Catalogo esercizi con seed, attrezzatura, vietati e sgraditi
16. Schede: schede, giorni, blocchi (superset, circuiti, dropset)
17. Esecuzione sessione: serie, timer recupero, precompilazione
18. Proponi alternativa (filtro locale + riordino AI)
19. Genera scheda (wizard + AI + validazione)
20. Tool palestra dell'assistente, PR e 1RM

**Fase 4 - Progressi e rifinitura**
21. Grafici e statistiche
22. Achievement e streak
23. Rifinitura UI, stati vuoti, accessibilita'

**Fase 5 - Il server** (non prevista alla stesura, vedi 9.2)
24. Backend Laravel: account, amici, profilo pubblico con le due regole di privacy
25. Schermate di amici e profilo
26. Sincronizzazione bidirezionale del database, deploy con HTTPS, backup notturno

## 9. Fuori scope iniziale

Questa sezione elencava cio' che non sarebbe stato sviluppato subito. Quasi tutto e'
stato poi costruito; quel che resta fuori e' rimasto fuori per una ragione, scritta qui
accanto. Un elenco di intenzioni che non distingue tra "non ancora" e "non si puo'" non
serve a nessuno.

### 9.1 Costruito dopo la stesura della spec
Health Connect per i passi automatici; promemoria con notifiche; timer di recupero;
tracking acqua; digiuno intermittente; misure corporee e foto progressi; progressione
carichi; piano pasti settimanale con lista della spesa; coach AI settimanale; traguardi;
export CSV; OCR dell'etichetta nutrizionale; widget della home con calorie e passi;
scorciatoia sull'icona che apre l'assistente in ascolto.

### 9.2 Costruito in Fase 5, con il backend
Ricerca amici, profilo pubblico, e la copia dei dati sul server. Erano fuori scope perche'
richiedevano un server che tenesse i dati di piu' persone e ne autenticasse l'accesso, e
costruirne una versione finta - un elenco di amici salvato solo su questo telefono, un
"backup cloud" che scrive in locale - avrebbe dato la sensazione di avere qualcosa che non
c'era, con la scoperta nel momento peggiore. Il server ora c'e' (`backend/`, Laravel +
Sanctum) e le tre cose sono vere.

Lo schema sync-ready ha fatto il suo lavoro: il modello dati non e' stato toccato.

Resta fuori il **confronto con altre persone** (classifiche, "chi ha fatto piu' passi
questa settimana"). Il presupposto tecnico c'e', ma e' una scelta di prodotto e non di
infrastruttura: trasformare il diario di qualcuno in una gara e' un modo noto per rendere
il tracking alimentare un problema invece che uno strumento. Se si fara', si fara' apposta
e non perche' ora e' possibile.

### 9.3 Non costruibile senza codice nativo dedicato
Assistente predefinito di Android (`ACTION_ASSIST`): quell'intent non porta dati, quindi
senza un modulo nativo che legga l'intent di partenza l'app non saprebbe di essere stata
invocata cosi' e si aprirebbe sul diario invece che in ascolto - peggio del non esserci.
Al suo posto c'e' la scorciatoia sull'icona dell'app, che copre lo stesso gesto partendo
dal launcher.

HealthKit su iOS: e' un'altra libreria e un altro provider. L'interfaccia `HealthProvider`
in `src/services/healthConnect.ts` e' il punto in cui si innesterebbe, ma il file non
finge di coprirlo.

### 9.4 Infrastruttura
Il backend Laravel per la sincronizzazione multi-dispositivo **e' stato costruito** in
Fase 5.

Il proxy per le chiamate AI **no**, ed e' l'unica voce di questa spec ancora aperta. Non
e' lavoro dimenticato ma una decisione da prendere: oggi l'assistente funziona senza
account, e farlo passare dal server significherebbe richiederne uno. Si guadagna la chiave
fuori dal bundle, si perde la gratuita' dell'accesso a una delle funzioni principali.
Finche' l'APK resta personale la chiave in chiaro e' un rischio accettato e scritto; il
giorno in cui l'app viene condivisa, la decisione va presa in quel momento e in quel
verso.

## 9-bis. Nota sulle migrazioni

Le tabelle della palestra (4.3) e `ai_calls` (4.4) non entrano nella migrazione
iniziale: ogni fase aggiunge le proprie tabelle con una migrazione numerata propria,
cosi' lo schema non porta tabelle vuote per mesi.

## 10. Rischi noti

| Rischio | Mitigazione |
|---|---|
| Chiave Groq nel bundle | Uso personale, APK non distribuito. Proxy se cambia (9.3) |
| Perdita del telefono | Export/import JSON in Fase 1 |
| Disponibilita' dei model id Groq | Configurazione centralizzata in `src/ai/config.ts`; i model id si fissano in implementazione verificando cosa e' attivo |
| Voce TTS italiana assente su Android | Verifica a runtime delle voci disponibili, fallback a solo testo (5.5-bis) |
| Quantita' in etti interpretate come grammi | Istruzione esplicita di normalizzazione nel prompt di parsing (5.5-bis) |
| L'AI inventa valori nutrizionali | L'LLM non produce mai i macro: risoluzione locale in cascata (5.4) |
| Copertura OpenFoodFacts sui prodotti italiani | Seed locale come base, creazione prodotto manuale sempre disponibile |
| Latenza percepita dell'assistente | Trascrizione mostrata appena pronta, esecuzione in background, feedback aptico |
