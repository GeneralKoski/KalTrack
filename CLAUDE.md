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

### L'APK sul telefono

```bash
./scripts/build-apk.sh          # APK release firmato, versione da app.json
./scripts/build-apk.sh 1.1.0    # e imposta anche la versione
./scripts/serve-apk.sh          # lo serve sulla Wi-Fi: apri l'URL dal telefono
```

**Solo Android**, e non è una dimenticanza: per iOS servirebbero le API key di
App Store Connect, che questo progetto non ha. Per iPhone resta `deploy.sh`,
che fa il prebuild e apre Xcode.

La firma sta in `credentials.json` e `credentials/android/kaltrack.keystore`,
**gitignorati**. Perdere quel keystore vuol dire non poter più aggiornare
un'app già installata: Android rifiuta un aggiornamento firmato con una chiave
diversa, e l'unica via è disinstallare (portandosi via il database, visto che
qui il telefono è la fonte di verità). Va copiato fuori dal computer.

`android/` è rigenerato da `expo prebuild --clean` a ogni build, quindi la
configurazione di firma viene re-iniettata in `build.gradle` ogni volta: il
marcatore `KALTRACK_SIGNING` la rende idempotente. Il `versionCode` è l'epoch
in secondi - cresce da solo e non c'è un contatore da ricordare.

L'indirizzo del server finisce **dentro** l'APK al momento del bundle: lo
script stampa quale ha usato e avvisa se è un indirizzo locale, che dal
telefono non sarebbe raggiungibile.

### Il backend

Un ambiente solo: `kaltrack.martin-trajkovski.it`. La scelta test/prod che
`deploy.sh` propone viene dal template Dieffetech e qui non è configurata.
Procedura in `backend/README.md` § In produzione.

```bash
./deploy.sh          # prebuild interattivo (Android Studio / Xcode)
```

## Architettura

React Native 0.83 + Expo 55 + React 19, New Architecture attiva. iOS 15.1+,
Android SDK 26+ (`minSdkVersion` in `app.json`). **Nessun target web**: niente
`react-native-web`, niente branch `Platform.OS === "web"`.

`react-native-web` risulta come peer dependency mancante a `expo-doctor`, ed e'
l'unico dei suoi controlli che si lascia rosso di proposito: lo chiede
gluestack per il web, e il web qui non c'e'.

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

### La composizione di una voce del diario

`meal_entries.components` (migrazione 10), JSON. Una voce nata da una ricetta
porta la **propria** copia degli ingredienti: cambiare le zucchine di oggi non
tocca la ricetta ne' le crepes mangiate il mese scorso.

E' una colonna e non una tabella figlia, ed e' deliberato:

- una composizione si riscrive **intera** a ogni modifica, cioe' e' esattamente
  la riscrittura in blocco che la regola 1 della sincronizzazione segna come
  minata. Con un valore solo quella trappola non esiste, perche' non ci sono
  righe da riconciliare;
- una voce del diario e' **gia' una fotografia** - i valori sono congelati nella
  riga, cosi' correggere un alimento domani non riscrive il pranzo di ieri.
  Congelare anche la composizione e' coerente; chiavi esterne verso alimenti
  vivi direbbero il contrario. Per questo `label` e `per100` sono **copiati**
  dentro ogni ingrediente e non letti dall'alimento.

L'elenco e' **piatto**: nessuna sotto-ricetta. Con l'annidamento non si potrebbe
togliere il prosciutto che sta dentro la besciamella senza scendere di livello,
e togliere il prosciutto e' il caso d'uso.

Tre cose da non rompere:

- **`parseComposition` non lancia mai.** `null` non e' un errore: e' una voce
  che non ha una composizione, cioe' tutte quelle scritte prima della migrazione 10. JSON rotto finisce li' allo stesso modo e la voce si disegna come prima,
  invece di sbiancare una schermata per una colonna accessoria.
- **Riscalare NON marca `edited`.** Due porzioni sono le stesse crepes in
  quantita' diversa, e scrivere "modificata" su voci che nessuno ha modificato
  renderebbe quel marcatore rumore.
- **Le porzioni non rileggono la ricetta.** `updateEntryQuantity` riscala la
  composizione della voce. Prima interrogava `buildRecipeTree`: chi modificava
  una ricetta e poi toccava le porzioni di una voce vecchia se la ritrovava
  aggiornata ai valori nuovi, contro la promessa della fotografia.

Non si interroga per ingrediente ("quanto salame a settembre"): e' il costo
dichiarato del JSON, e nessuna schermata lo chiede.

### Le vie per aggiungere al diario

La linguetta "Voce libera" della scheda Aggiungi ne offre tre: scrivere a mano,
**scattare una foto**, scegliere una foto dalla galleria.

La foto passa da `estimateFromPhoto`, che era scritta e testata dalla Fase 1 e
**chiamata da nessuno** - ed e' la ragione per cui il ritiro del suo modello e'
passato inosservato per sei settimane. Torna un piatto per voce, e cosi' si
salva: una foto di un pranzo diventa "pasta al pomodoro", "cotoletta", "pane",
non un totale chiamato "Pranzo". Grammi e nomi si correggono prima di
confermare, perche' sono numeri che un modello ha immaginato guardando
un'immagine.

Due cose sulla foto stessa. Si copia in archivio permanente **prima** della
stima: l'URI del picker sta in cache e il sistema la svuota, e copiare dopo
vorrebbe dire un secondo passaggio che puo' cadere quando le voci sono gia'
scritte. Abbandonare il foglio cancella quella copia, altrimenti ogni stima
scartata lascia un file che nessuno referenzia. Le N voci **condividono un file
solo**, e va bene perche' cancellare una voce del diario non cancella la sua
foto: togliere "il pane" non porta via l'immagine agli altri due.

I grammi di una voce libera **non si salvano**: congela il totale e memorizza
quantita' 1. E' come funziona la voce scritta dall'assistente, e seguire quella
convenzione e' meglio che averne due per lo stesso tipo di voce.

### Le porzioni nel campo quantita'

`foods.default_serving_g` e' **il numero gia' scritto** quando aggiungi un
alimento, e `foods.serving_label` la frase che lo spiega ("1 vasetto = 125 g").
La seconda esisteva dalla migrazione 1, con una cinquantina di frasi nei seed, e
non era mostrata da nessuna parte: rispondeva alla domanda che ti fai mentre
digiti i grammi, e mancava nell'unico momento utile.

Sotto il campo ci sono quattro scorciatoie (1/2, 1, 2, 3) che **scrivono nel
campo**, non sono una modalita': non esiste uno stato "porzioni" che possa
discordare da quel che c'e' scritto, e digitando 180 a mano nessuna si accende -
180 non e' un numero di vasetti (`activeMultiplier` torna `null`, ed e' la
risposta giusta il piu' delle volte).

Il calcolo dai valori per 100 g avviene **sempre**, porzione o no: la porzione
decide solo da quale numero parti.

Non compaiono per le ricette - li' il valore e' gia' in porzioni - ne'
modificando una voce gia' nel diario, che porta la quantita' e non la porzione
dell'alimento da cui e' nata.

### Sincronizzazione

`src/services/sync.ts`, `backend/README.md` per il lato server. Cinque regole
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
5. **Una tabella nuova va dichiarata, in un elenco o nell'altro.** `SYNCED_TABLES`
   se viaggia, `LOCAL_ONLY_TABLES` con il motivo se resta qui, e `sync.test.ts`
   confronta i due elenchi con lo schema reale. Senza quel test
   `progress_photos` e' rimasta fuori dalla sincronizzazione per settimane dopo
   che la sua unica ragione di esclusione era caduta: le foto dei progressi
   semplicemente non arrivavano sul secondo telefono, e niente lo diceva.
   `BACKUP_TABLES` aveva il controllo dalla Fase 3; qui mancava.

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

**L'archivio contiene sempre un JPEG a 1600 px di lato lungo**, e per questo il
nome finisce sempre in `.jpg`. `persistPhoto` ridimensiona invece di copiare:
il server rifiuta oltre i 5 MB, e uno scatto a piena risoluzione li supera
senza sforzo. Quando succedeva, `uploadPendingPhotos` annotava il rifiuto e
andava avanti - di proposito, per non riprovare all'infinito - e il risultato
era una riga sincronizzata la cui immagine non sarebbe arrivata mai. Se il
formato non si sa leggere si archivia l'originale: una foto grande e' un difetto
di peso, una foto che non si salva e' un pasto che non si registra.

**Le foto orfane si raccolgono a ogni sincronizzazione**
(`collectOrphanPhotos`), e il criterio e' "a cosa serviva questa", non "chi ce
l'ha". La differenza fra quel che il server tiene e quel che c'e' sul telefono
non e' un elenco di orfani: una foto scattata su un altro dispositivo sta sul
server e qui non e' ancora arrivata, e cancellarla distruggerebbe l'unica
copia. Si guardano invece le righe (`orphanPhotoNames` in
`src/db/queries/photos.ts`): orfana e' la foto che una riga cancellata nominava
e che **nessuna riga viva nomina piu'**. La seconda meta' non e' una cautela in
piu' - una foto libera del diario e' condivisa fra le N voci di quella stima, e
togliere "il pane" non deve portare via l'immagine alle altre due.

Due ordini che non si invertono: **prima il file locale, poi quello remoto**
(al contrario, un'interruzione fra i due lascerebbe qui un file che nessuna
riga nomina, e `uploadPendingPhotos` lo ricaricherebbe al giro dopo - una foto
cancellata e rimessa all'infinito); e **prima la raccolta, poi il caricamento**,
perche' `uploadPendingPhotos` manda tutto quel che trova in cartella, orfani
compresi.

### Il confronto con gli amici

`src/domain/comparison.ts`. Le regole **non** sono uniformi, ed e' una scelta di
prodotto scritta nei test:

- passi e allenamenti hanno un vincitore;
- le calorie si affiancano **senza** vincitore - mangiare piu' o meno di
  un'altra persona non e' meglio ne' peggio, e una spunta sarebbe un consiglio
  sbagliato;
- il peso non si confronta affatto;
- un numero mancante non e' un pareggio ne' un ultimo posto;
- **in palestra il confronto e' legittimo**: volume e carico massimo hanno un
  vincitore. La differenza con le calorie non e' arbitraria - un carico si
  allena, un fabbisogno no.

Cambiarle deve essere deliberato: hanno test propri che le enunciano.

Il confronto va da due a cinque persone (`buildMultiComparison`,
`buildGymComparison`, `GET /api/comparison`). Una metrica compare se **almeno
uno** la condivide, e per gli altri e' un trattino: nascondere la riga perche'
uno solo non condivide punirebbe gli altri.

### La palestra che esce dal telefono

`share_gym` e' il quinto interruttore ed e' l'unico che pubblica **contenuto**
e non un totale: quali esercizi, con che carico. Spento di serie e
**indipendente** da `share_workouts`, che e' solo il conteggio. Chi lo accende
lo legge scritto accanto all'interruttore.

Quanto passato esce **non si sceglie**: esce tutto lo storico. La finestra di
giorni (`share_window_days`) c'e' stata fino al 31 agosto 2026 ed e' stata
tolta - era un'impostazione in piu' su una domanda che nessuno si e' mai posto,
e intanto tagliava il confronto a una settimana. Cosa esce lo dicono i cinque
interruttori, e basta quelli.

Lato telefono lo storico comincia dal **primo dato scritto**
(`earliestRecordedDate`), non da una data fissa: contare da una data fissa
vorrebbe dire interrogare e spedire giornate vuote che non sono mai esistite.

### L'unica cosa che esce verso i non amici

Le tabelle `exercises` e `foods` sul server sono cataloghi **comuni a tutti
gli iscritti**: un esercizio o un alimento creato a mano entra nell'elenco di
chiunque abbia un account. E' l'unica eccezione alla regola "solo fra amici
accettati", ed e' dichiarata in `backend/README.md`.

**Ogni voce ha un autore e ciascuno corregge o toglie solo le proprie**, ma
`created_by` non esce da nessuna risposta: al suo posto viaggia `mine`. Il
catalogo dice a te che quella voce e' tua, non dice a nessun altro di chi e'.

Il testo che lo spiega sta **sopra** il campo del nome (`ExerciseFormSheet`,
`FoodFormScreen`): va letto prima di scrivere, non dopo aver salvato. Senza
account non compare, perche' senza account non esce niente.

Lato app la voce remota si ritrova **dal nome normalizzato** e non da un id
salvato in colonna: un id del server, sincronizzato su un secondo dispositivo o
dopo un cambio di account, punterebbe alla riga di un altro catalogo.

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

### Dove vive il microfono

`AssistantButton` e' montato **dentro `TodayScreen`**, non sopra la navigazione.

Era una scelta di prodotto prima che di layout: l'assistente scriveva pasti,
passi, peso e obiettivi - esattamente quel che sta su Oggi - e in palestra non
toccava niente. Globale, seguiva l'utente in dodici schermate dove non poteva
fare nulla, e in due si sedeva sopra un interruttore.

**La premessa oggi non vale piu', e la scelta va rifatta.**
`src/ai/tools/registry.ts` ha **tredici** strumenti, e tre riguardano la
palestra: `create_exercise`, `create_routine`, `log_workout`. L'assistente sa
registrare una serie e il microfono non e' raggiungibile da dove lo si direbbe -
con le mani sul bilanciere, "tre per otto a sessanta" e' piu' veloce di
qualunque campo. Chi riapre la questione tenga presente l'aritmetica del
paragrafo seguente: e' il motivo per cui montarlo sopra il navigatore non e'
gratis.

Il guadagno tecnico e' che sparisce l'aritmetica: montato fuori dal navigatore
il microfono si misurava dal fondo della **finestra**, mentre il "+" di una
schermata si misura dal fondo della **schermata**, che finisce dove inizia la
tab bar. Lo stesso `bottom` cadeva a due quote diverse, ed e' cosi' che i due
bottoni si sovrapponevano sulla home e non su Alimenti. Ora sono due elementi
della stessa schermata: `SCREEN_FAB_BOTTOM` impila il "+" sopra il microfono e
`ASSISTANT_FAB_CLEARANCE` e' lo spazio che **solo la lista di Oggi** si lascia
in fondo. Nessun'altra schermata deve piu' riservare niente.

Resta montato anche mentre si guarda un'altra scheda - i tab non si smontano
dopo la prima visita - quindi la scorciatoia `kaltrack://assistente` sull'icona
dell'app continua a far partire l'ascolto da qualunque punto.

### Organizzazione dei componenti

- `src/components/` — generici, presentazionali, riusabili (`ui/`, `form/`,
  `kal/`, `icons/`).
- `src/containers/<feature>/` — componenti legati alla feature (es.
  `src/containers/diary/`). Raggruppati per feature, non per tipo.

Estraendo un componente da una schermata, default a `containers/<feature>/` a
meno che non sia davvero generico.

### L'ordine dei provider in `App.tsx`

**`ThemeProvider` sta SOPRA `GluestackUIProvider`, e non e' un dettaglio.**

Gluestack porta le sue modali dentro `OverlayProvider`: non le lascia dove sono
scritte, le rimonta nel punto dell'albero dove vive quel provider. Con il tema
sotto, qualunque cosa dentro una modale leggesse `useAppTheme()` finiva fuori
dal contesto e prendeva il valore di default - il tema **chiaro**.

Si e' visto per settimane come un solo pulsante sbagliato: l'"Annulla" di ogni
dialogo, grigio su nero in tema scuro, disegnato con `#18181b` (l'accent del
tema chiaro) sopra una superficie scura. Sembrava un difetto di quel bottone
perche' `DfButton` e' quasi l'unico componente che il colore se lo risolve da
solo; a tutti gli altri arriva gia' calcolato da chi li usa, e quelli erano
giusti.

Chi sposta i provider deve riaprire un `DfAlert` in tema scuro prima di
dichiarare fatto.

### Styling

Doppio sistema: `StyleSheet.create()` con token statici da `src/styles.ts`, più
`useAppTheme()` per i colori semantici light/dark (background, surface, border,
text). NativeWind disponibile ma non prevalente. I componenti `Text` e
`TextInput` in `src/components/ui/` risolvono automaticamente Poppins da
fontWeight: **usare sempre quelli**, mai le primitive RN nude.

`theme.colors.macro` (proteine, carboidrati, grassi) sono token: grafici, barre
e legende devono usarli per non divergere. L'anello delle calorie e' diviso per
macro con quegli stessi token (`macroSlices` in `src/domain/nutrition.ts`,
disegnato da `MacroArc`), e lo usano sia la home sia i cerchietti del
calendario: il grigio in coda e' la parte di calorie che i macro non spiegano,
non un quarto macro.

### L'icona

Una K bianca con un punto verde su `#18181b`. Non e' un file da ritoccare a
mano: si rigenera con `python3 scripts/genera-icone.py`, che disegna il segno
**una volta**, lo ritaglia al contenuto e lo scala in tutte le misure. Modificarne
uno solo a mano fa divergere le sei immagini alla prima occasione.

Su Android l'icona e' a due strati e il sistema ci ritaglia sopra la forma che
vuole: nel primo piano il segno sta al 46% e non al 60%, perche' il punto verde
e' in alto a destra, cioe' dove la maschera taglia. Cambiando la composizione
va riguardata quella prova, non solo il quadrato.

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
- **Un overlay aperto consuma il back di Android.** `DfBottomSheet` intercetta
  `hardwareBackPress` finche' e' aperto e ritorna `true`: senza, l'evento gli
  passa attraverso e arriva a react-navigation, che fa il pop della schermata
  **dietro** - lo sfondo si muove e il foglio resta li'. La prop
  `onAndroidBack` serve ai fogli con sotto-viste, per tornare indietro dentro
  prima di chiudere.
- **Una `ScrollView` annidata in un foglio gorhom dev'essere quella di
  `react-native-gesture-handler`.** Quella di react-native non riceve i gesti
  dentro un `BottomSheetScrollView`: resta ferma e sembra un contenuto che non
  scorre.

## AI

Tutte le capability passano da **Google Gemini** (Google AI Studio), con un
modello unico: **`gemini-3.6-flash`** per la trascrizione audio multimodale, la
comprensione e il function calling dell'assistente (vocale e testuale) e la
stima nutrizionale da foto ed etichette (vision + JSON object mode).
`expo-speech` per le risposte parlate, on-device.

I model id stanno in **un punto solo** (`src/ai/config.ts`), e non e' una
comodita': `llama-3.3-70b-versatile` e' stato ritirato e l'app ha continuato a
chiamarlo per sei settimane senza che nessuno lo notasse. **Un model id non
provato e' un'ipotesi**, e si prova da **Impostazioni > Diagnostica**, che
chiede al servizio l'elenco di quel che sta ancora servendo a questa chiave.

La chiave sta in `.env` come `EXPO_PUBLIC_GEMINI_API_KEY`, quindi **nel bundle**:
e' una scelta, non una dimenticanza. Cosi' l'AI e' attiva al primo avvio senza
configurazione e a costo zero (Free Tier, 1.500 richieste al giorno), e l'APK non
si distribuisce. Chi vuole la propria la mette da Impostazioni e ha la
precedenza (`aiKeyStore`, `aiKey()`).

Non va salvata in `settings`: quella tabella si sincronizza, e la chiave
finirebbe sul server in chiaro dentro `sync_records`. E non va nella URL: vedi
§ La diagnostica.

### I due endpoint

1. **OpenAI-compatible** (`.../v1beta/openai`) per chat, tool calling e vision
   con JSON strutturato. La chiave viaggia in `Authorization: Bearer`.
2. **Nativo multimodale** (`.../v1beta`) per la trascrizione audio via base64,
   con `mimeType: "audio/m4a"`. La chiave viaggia in `x-goog-api-key`.

## La diagnostica

`app_logs` (migrazione 9) tiene gli ultimi trecento guasti: `logger.warn` e
`logger.error` ci finiscono da soli, senza toccare le chiamate esistenti, e la
convenzione `[scope] messaggio` diventa una colonna.

Si legge da **Impostazioni > Diagnostica**, che mostra anche le chiamate AI non
riuscite (`ai_calls`). Tre cose da non rompere:

- **Scrive anche a console spenta.** `EXPO_PUBLIC_CONSOLE_LOGGING=false` vale
  nelle build di release, cioe' proprio quelle sul telefono.
- **`recordLog` non lancia e non registra i propri errori.** E' chiamata da
  `logger.error`: un guasto che ripassasse di li' si richiamerebbe all'infinito.
- **`redactSecrets` copre le forme di chiave che l'app usa DAVVERO.** Il
  registro si condivide come file ed e' dentro il backup: e' la stessa chiave
  che `aiKeyStore` tiene apposta fuori dal database. Copriva `gsk_`/`sk_` e
  `Bearer`, cioe' Groq e OpenAI, e dal passaggio a Gemini non nascondeva piu'
  niente - una chiave `AIza...` o `AQ....` passava intera. Ora ci sono anche
  quelle due forme e `?key=` in una URL. Chi cambia provider aggiunge la forma
  nuova qui, prima di committare.

Per lo stesso motivo la chiave dell'endpoint nativo va nell'header
`x-goog-api-key` e non in `?key=`: un errore di rete si porta dietro la URL, e
quel testo finisce in `app_logs`.

Il collegamento passa da `setLogSink`, installato da `initDatabase()`, e non da
un import: `src/db` importa gia' `logger`, il verso opposto sarebbe un ciclo.

`clearLogs` usa un `DELETE` vero, ed e' l'eccezione consentita alla regola "mai
`DELETE FROM`": quella protegge le tabelle che si sincronizzano, dove una riga
tolta risorge al giro dopo. `app_logs` non viaggia.
