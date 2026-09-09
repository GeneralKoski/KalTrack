# CLAUDE.md

Guida per Claude Code (claude.ai/code) su questo repository.

## Cos'è KalTrack

App mobile personale (iOS e Android, focus Android) per il tracking di
alimentazione, peso, passi e allenamento, con un assistente vocale AI come modo
principale di inserimento dati.

**Oggi: utente singolo, nessun account.** L'account esiste (accesso,
sincronizzazione, amici) ma non serve per usare l'app, e questa parte non
cambia mai: il telefono resta la fonte di verita' e senza rete si mangia
comunque.

**In programma: un rilascio pubblico con le funzioni AI a pagamento.** Non e'
un'ipotesi, e ha una conseguenza che riguarda chi lavora sul codice **da subito**
e non il giorno del rilascio: la chiave Gemini sta nel bundle, ed e' una scelta
valida **solo** perche' l'APK non si distribuisce (vedi § AI). Il piano sta in
`TODO.md` § 3.

- Design: `docs/superpowers/specs/2026-08-28-kaltrack-design.md`
- Piano Fase 1: `docs/superpowers/plans/2026-08-28-kaltrack-fase-1-nutrizione.md`
- Cose da fare: `TODO.md`

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
  SQL.** `queries/taxonomies.ts` ha la stessa distinzione a due letture dei
  tipi di pasto: `listTaxonomy` esclude i gruppi muscolari/attrezzatura
  cancellati dal pannello (chi offre una scelta), `listAllTaxonomy` li
  comprende (chi disegna l'etichetta di quel che c'e' gia').

**`sqliteAdapter.ts` serializza le query su expo-sqlite.** Piu' chiamate non
transazionali partite in parallelo (es. un `Promise.all` di query indipendenti
in una schermata) mandavano in crash Android con "Cannot use shared object
that was already released": una coda seriale le accoda tutte su un'unica
connessione. Le transazioni usano
`db.withExclusiveTransactionAsync` e non `withTransactionAsync` - era proprio
la non-esclusivita' la causa vera del crash, non l'assenza della coda - e una
transazione annidata fallisce esplicitamente invece di restare appesa.
**Solo per expo-sqlite**: `betterSqliteAdapter.ts`, usato dai test, e'
sincrono su connessione unica e non ha questo problema.

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

### La ricerca di un alimento

Due sezioni, e non un elenco solo: **In libreria** legge SQLite, **Dall'archivio**
interroga OpenFoodFacts (`useOffSearch`). La prima arriva subito e senza rete,
la seconda arriva dopo e puo' non arrivare: per questo e' un hook a parte e non
entra in `searchFoods`, che e' local-first e deve restarlo. Se l'archivio non
risponde la schermata non dice niente - la libreria c'e' comunque.

Fino al 2 settembre 2026 `searchByName` aveva **un solo chiamante**,
`src/ai/resolveFood.ts`: tre milioni di prodotti stavano dietro l'assistente
vocale, e chi cercava a dita vedeva solo i seed e quel che si era aggiunto a
mano.

Un prodotto dell'archivio **si salva e si apre subito nel modulo**, non si
aggiunge in silenzio: i valori vengono da un archivio pubblico compilato da
chiunque e la porzione spesso manca del tutto, quindi vanno messi sotto gli
occhi nel momento in cui correggerli costa niente. E' la stessa regola dei
grammi stimati da una foto.

Il doppione si toglie con **due** criteri (`escludiGiaPresenti`): il codice a
barre, che e' esatto, e il nome normalizzato, che copre quel che e' stato
aggiunto a mano senza codice. Il nome vince anche a codici diversi - due righe
con lo stesso nome in elenco sono indistinguibili. Sotto i tre caratteri non si
interroga niente: "ri" restituisce mille prodotti e nessuno e' quello cercato.

**La voce remota si ritrova dal `catalog_uid`**, dall'8 settembre 2026. Prima
era il nome normalizzato, e il § L'unica cosa che esce verso i non amici
spiega cosa costava.

L'avvertenza contro il tenere in colonna un id del server **resta valida e non
riguarda questa colonna**, ed e' una distinzione da tenere: un autoincrement
su un secondo dispositivo punta alla riga di un altro catalogo, mentre `uid`
e' una stringa stabile assegnata alla voce, il server e' uno solo, e la stessa
voce ha lo stesso `uid` per chiunque. Un `uid` che dall'altra parte non esiste
non risolve e basta, e la ricaduta sul nome lo ripesca al primo pull.

### Il codice a barre

`FoodScanScreen`, aperta dall'icona nella barra di Alimenti. Fino al 2
settembre 2026 c'era **tutto tranne la fotocamera**: la colonna
`foods.barcode` con il suo indice, `getFoodByBarcode`, `searchByBarcode`, e
`expo-camera` installato con **zero import** in tutto il progetto.

La schermata e' sottile di proposito: le decisioni stanno in
`src/containers/foods/resolveBarcode.ts`, perche' una fotocamera non si
esercita in jest e un emulatore non legge codici. Alla schermata restano il
permesso, il fermo e la navigazione.

- **La libreria vince sull'archivio**, come in `resolveFood`: i valori di
  OpenFoodFacts sono compilati da chiunque, e un prodotto gia' corretto a mano
  non va riscritto da quelli. Con una risposta locale l'archivio non viene
  nemmeno interrogato.
- **Una lettura sola.** `onBarcodeScanned` scatta in continuo finche' il codice
  e' inquadrato: senza un fermo lo stesso prodotto si risolve dieci volte, e
  nel ramo dell'archivio sono dieci righe identiche. E' un `useRef` e non uno
  stato, perche' deve chiudersi nello stesso giro dell'evento.
- **Si esce con `replace`, non `navigate`.** L'indietro dal modulo deve tornare
  ad Alimenti: tornando alla fotocamera si rileggerebbe lo stesso codice - il
  prodotto e' ancora in mano - e si riaprirebbe il modulo appena chiuso.
- **Solo i formati da supermercato** (EAN-13/8, UPC-A/E). Con tutti i tipi
  attivi la fotocamera legge il QR del volantino accanto e prova a risolverlo
  come prodotto.
- Codice ignoto a entrambi: modulo vuoto **con il codice dentro**, cosi' la
  scansione successiva lo trova in libreria.

**`barcode` e `off_id` sono identita', non contenuto: `updateFood` non li
tocca.** Nessuna schermata ha un campo per modificarli e solo `createFood` li
assegna. Riscriverli da `input` voleva dire che `FoodFormScreen` - che non li
passa - li azzerava a ogni salvataggio: aprire un prodotto arrivato
dall'archivio, correggere una virgola e salvare gli portava via il codice, e da
li' in poi `getFoodByBarcode` non lo trovava piu'. Nessun errore, nessun segno
a schermo.

**La stessa regola ha un gemello sull'inserimento, e i due non si confondono.**
Il pull del catalogo comune (§ Il catalogo comune, dal telefono) scrive
`barcode` e `off_id` quando **crea** una riga nuova da una voce di catalogo, e
non li scrive mai quando **aggiorna** una riga esistente. Sull'aggiornamento
c'e' un codice da proteggere, corretto a mano o gia' presente; sull'inserimento
la riga non esiste ancora e non c'e' niente da proteggere - ometterli
lascerebbe arrivare un alimento di catalogo senza codice a barre, cioe' non
scansionabile: la scansione successiva non lo troverebbe in libreria e
creerebbe un doppione da OpenFoodFacts, esattamente la classe di difetto che
questa sezione esiste per chiudere.

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

### I pasti che si possono usare

Profilo > Alimentazione > Pasti (`MealTypesScreen`) spegne i pasti che non si
usano - chi non fa mai il brunch lo spegne - e aggiunge, rinomina, elimina i
propri.

**Spegnere non e' cancellare, ed e' per questo che `hidden` (migrazione 16) non
riusa `deleted_at`.** `getDayDiary` salta i pasti il cui tipo non e' piu' in
elenco: cancellando "brunch" sparirebbero dallo storico i brunch gia'
registrati, e dai totali di quei giorni. Da qui due letture invece di una:

- `listMealTypes()` esclude i nascosti, ed e' la lettura di chi **offre una
  scelta**: foglio Aggiungi, piano pasti, `generateMealPlan`, catalogo e tool
  dell'assistente, `defaultMealTypeId`;
- `listAllMealTypes()` li comprende, ed e' la lettura di chi **disegna righe
  gia' scritte**: le colonne del piano - `MealPlanScreen` mostra un pasto spento
  se quel giorno ha gia' delle righe, ma non lo offre nel foglio Aggiungi.

`getDayDiary` va oltre e legge `meal_types` **senza filtri**, cancellati
compresi: quel che si e' mangiato resta scritto col suo nome, e nessuna
operazione fatta nelle impostazioni deve toglierlo dal diario.

Chiunque aggiunga una lettura dei tipi di pasto deve scegliere, e la domanda e'
sempre la stessa: sto offrendo una scelta o sto disegnando quel che c'e' gia'?

**Almeno un pasto attivo resta** (`setMealTypeHidden` e `deleteMealType`
lanciano): senza, il foglio Aggiungi non ha una destinazione e il salvataggio
non avviene senza dire niente.

**Anche i predefiniti si rinominano e si cancellano.** Non lo erano fino al 3
settembre 2026 perche' i loro id stanno nel seed, nei test e nei tool
dell'assistente: nessuno dei tre pero' si rompe se la riga non c'e' piu' - il
seed gira su un database nuovo, i test se lo ricreano, e i tool cercano fra i
pasti che esistono. Restava un divieto che obbligava a tenersi "Brunch" per
sempre.

### La lista della spesa

`ShoppingListScreen`. Due difetti chiusi l'8 settembre 2026, e nessuno dei due
era grafico.

**I quattro periodi erano chip in una riga che scorre**, quindi "Prossima
settimana" si tagliava a "Pross..." e il quarto stava mezzo fuori schermo: in un
selettore, dove il punto e' vedere le alternative. Ora sono un `Segmented`, e le
etichette sono corte apposta ("Da oggi", "Settimana", "Prossima", "Date") -
quattro segmenti su un telefono non reggono quattro frasi.

**Preso e da comprare erano mescolati.** In mezzo al reparto si rileggeva tutta
la lista per capire cosa mancava. Ora sono due sezioni, e quando non resta
niente da comprare la prima non sparisce in silenzio: dice "Preso tutto", o
sembrerebbe che la lista si sia svuotata da sola.

Le spunte restano quel che erano - **in memoria e basta**: sono una sessione di
spesa, non un dato. Chiusa la schermata la lista si rifa' dal piano, e un
"preso" di tre settimane fa non significherebbe piu' niente.

### Il modulo di un alimento

`FoodFormScreen`. Il lavoro qui e' **digitare numeri**, e fino all'8 settembre
2026 la foto del prodotto si prendeva un'etichetta di sezione e due riquadri
tratteggiati alti 140 - mezza pagina per un dettaglio.

**"Dalla galleria" compariva due volte e voleva dire due cose.** Una sceglieva
la foto del PRODOTTO, l'altra - duecento pixel piu' sotto - la foto
dell'ETICHETTA da leggere con l'OCR, e le due non hanno niente in comune: la
prima si archivia, la seconda si legge e si butta. Due comandi omonimi nella
stessa schermata.

Ora la foto del prodotto e' una **tessera da 64** accanto al campo del nome
(`PhotoTile`, `src/components/kal/PhotoField.tsx`): non scrive nessun nome, e le
due vie stanno dentro il foglio che apre. `PhotoField` resta com'e' dov'e' -
ricette, esercizi, foto progressi - perche' li' la foto e' il contenuto e non un
dettaglio; le due condividono `usePhotoPicker`, quindi la copia in archivio
permanente avviene comunque in un posto solo (§ Le foto).

Lo scanner dell'etichetta e' **una** azione a tutta larghezza con la galleria
sotto come collegamento. Erano due bottoni affiancati e di peso uguale, e il
primo si troncava a "Scansiona etich...": inquadrare la scatola e' l'azione,
pescare da galleria e' la via di riserva.

### Le porzioni nel campo quantita'

`foods.default_serving_g` e' **il numero gia' scritto** quando aggiungi un
alimento, e `foods.serving_label` la frase che lo spiega ("1 vasetto = 125 g").
La seconda esisteva dalla migrazione 1, con una cinquantina di frasi nei seed, e
non era mostrata da nessuna parte: rispondeva alla domanda che ti fai mentre
digiti i grammi, e mancava nell'unico momento utile.

**La quantita' si digita, e basta.** Sotto il campo c'erano quattro scorciatoie
(1/2, 1, 2, 3) che moltiplicavano la porzione scrivendo nel campo; sono state
tolte il 5 settembre 2026, e con loro `SERVING_MULTIPLIERS`, `servingGrams` e
`activeMultiplier` in `src/domain/serving.ts` e la prop `serving` di
`QuantityPrompt`. Restano `formatGrams` e `toGrams`, che li' non c'entravano.

Quel che la porzione fa e' rimasto: riempie il campo all'apertura
(`initialValue`) e sta scritta sopra come promemoria. Non decide piu' niente
altro.

Il calcolo dai valori per 100 g avviene **sempre**, porzione o no: la porzione
decide solo da quale numero parti.

**I valori della quantita' scritta non spariscono a campo vuoto**, vanno a
zero. Il blocco che si smontava faceva accorciare la finestra mentre si
cancellava per riscrivere, e i bottoni Annulla/Conferma salivano sotto il dito.

Il pannello per cento grammi (`FoodFacts`) **non** sta in questa finestra: due
basi di lettura vicine - per 100 g e per la quantita' scritta - e non si sapeva
piu' quale si stesse guardando. Resta nel dialogo Info dell'elenco alimenti, che
e' il posto dove quella domanda te la fai davvero. Dentro `FoodFacts.tsx`
`FoodThumb` e `MacroTriple` sono esportati apposta perche' la finestra dei
grammi li riusi senza ridisegnarli.

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

   `muscle_groups` ed `equipment_types` (migrazione 020) sono in
   `LOCAL_ONLY_TABLES`, e il motivo e' diverso dagli altri: non sono un dato
   personale che non ha senso condividere, sono la copia locale di un elenco
   che il server gia' pubblica per tutti (§ Il catalogo comune, dal telefono).
   Sincronizzarle vorrebbe dire rispedire al server quel che lui stesso ha
   appena mandato.
6. **Un giro alla volta, e la guardia sta dentro `runSync`.** Stava in
   `syncScheduler`, che pero' e' uno dei tre chiamanti: `App.tsx` all'avvio e
   `AccountForm` all'accesso chiamano `runSync` per conto loro. All'avvio ne
   partivano davvero due - lo scheduler e il `.then()` di `restore()` - e il
   server riceveva due `POST /sync` nello stesso secondo. Due giri
   contemporanei leggono lo stesso segnaposto e si rimandano le stesse righe;
   di la' la collisione diventava un 500. Vedi `backend/config/database.php`
   per l'altra meta' della storia.

### Il confronto delle foto progressi

**Si sceglie, non si subisce.** Fino al 6 settembre 2026 una card in cima
all'elenco affiancava d'ufficio la foto piu' vecchia e la piu' recente, quali
che fossero le pose: un fronte accanto a un retro non dice niente di come sei
cambiato. Ora il tasto accanto al "+" apre `ComparePickerSheet`, si scelgono
due giornate e si arriva a `PhotoCompareScreen`.

Tre cose da non rompere:

- **Si confronta posa con posa.** Le linguette in cima sono le pose presenti in
  **entrambe** le giornate; quelle che stanno in una sola restano in elenco ma
  spente - toglierle nasconderebbe che quella posa esiste, e chi la cerca
  penserebbe di non averla mai scattata.
- **Le foto senza posa fanno gruppo a se'** (`NO_POSE`), non restano fuori. Chi
  non etichetta gli scatti troverebbe un confronto vuoto, che e' il modo
  peggiore di dirgli che avrebbe dovuto etichettarli.
- **Le giornate si scelgono fra quelle che hanno foto**, non da un calendario:
  un confronto con un giorno vuoto e' una schermata aperta per dire che li' non
  c'e' niente. E `first` e' sempre la piu' vecchia, in qualunque ordine siano
  state toccate.

**Due modi di guardare, e si sceglie.** L'interruttore in fondo alla schermata
passa fra cursore e affiancate, e la scelta resta (`compareViewStore`, AsyncStorage
come il tema - e' una frase su come si guarda l'app, non un dato da mandare al
server). Nessuna delle due e' migliore: il cursore rende evidente la differenza
quando le inquadrature combaciano, l'affiancata regge anche quando no ed e'
l'unica che le mostra insieme invece che una alla volta.

Il cursore e' un `Gesture.Pan` di gesture-handler su un valore reanimated: la
foto sotto e' quella recente per intero, quella sopra e' la vecchia dentro una
cornice che si stringe. **L'immagine nella cornice tiene la larghezza piena del
riquadro**, o si schiaccerebbe invece di scoprirsi. Il taglio si **ricentra
quando cambia la larghezza del riquadro** - cambio modalita', rotazione - o
resterebbe misurato su un riquadro che non c'e' piu'.

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
copia. Si guardano invece le righe (`orphanPhotoUris` in
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

**Le foto del CATALOGO si raccolgono con un criterio diverso, e la differenza
non e' un dettaglio di implementazione.** Vivono in una cartella loro
(§ Il catalogo comune, dal telefono) e appartengono a tutti gli iscritti,
quindi una riga cancellata su questo telefono non le rende orfane - restano la
foto di quella voce per chiunque altro, e un ripristino la rivorrebbe. Sono
inutili solo quando **nessuna riga le nomina piu'**, cancellata o viva: e'
quel che succede quando il pannello sostituisce o toglie la foto e il pull
scrive il percorso nuovo su una riga viva. Da qui le due letture di
`queries/photos.ts` - `orphanPhotoUris` per le foto dell'utente,
`referencedPhotoUris` per queste - e le due raccolte dentro
`collectOrphanPhotos`, che incassano i propri errori separatamente.

Due cose che seguono da "sono di tutti": **non si cancellano dal server** (di
la' la porterebbe via a ogni iscritto, e la rotta per farlo non c'e'), e le
query tornano **percorsi e non nomi**. Un nome nudo non dice a quale delle due
cartelle appartiene: prima le tornava, e la raccolta cancellava
`PHOTOS_DIR/<nome di catalogo>` - un no-op - contandolo comunque fra le
rimosse. `[foto] rimosse N orfane` contava foto che non aveva rimosso, e le
foto di catalogo non si cancellavano mai. Chi conosce le cartelle e'
`photoSync`; `queries/photos.ts` dice solo cosa le righe nominano.

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
gli iscritti**. E' l'unica eccezione alla regola "solo fra amici accettati", e
questo non e' cambiato con la Fase 1 del gestionale (settembre 2026).

**Quel che e' cambiato e' come una voce ci arriva.** Fino ad allora, un
esercizio o un alimento creato a mano entrava nell'elenco di chiunque avesse un
account nello stesso momento in cui veniva salvato. Ora nasce **proposto**, e
raggiunge tutti solo quando un amministratore lo approva dalla coda di
revisione: il catalogo di tutti non puo' essere la somma di quel che ciascuno
scrive di fretta. La dichiarazione completa - inclusa la moderazione - sta in
`backend/README.md` § L'eccezione dichiarata.

**Ogni voce ha un autore e ciascuno corregge o toglie solo le proprie**, ma
`created_by` non esce da nessuna risposta verso un utente qualunque: al suo
posto viaggia `mine`. Il catalogo dice a te che quella voce e' tua, non dice a
nessun altro di chi e'. C'e' ora **un'unica eccezione**, in un posto che un
utente normale non raggiunge: la coda di revisione sotto `/api/admin/*`, dove
chi guarda l'autore e' chi decide se la voce entra nel catalogo di tutti. Il
dettaglio sta in `backend/README.md`, che non va ripetuto qui.

Il testo che spiega la proposta sta **sopra** il campo del nome
(`ExerciseFormSheet`, `FoodFormScreen`): va letto prima di scrivere, non dopo
aver salvato. Senza account non compare, perche' senza account non esce
niente.

**Lato app l'identita' e' `catalog_uid`** (migrazione 019), e il pull e'
incrementale: `src/services/catalogSync.ts` legge `/api/catalog/*` dal proprio
cursore e riallinea le righe che ha gia' invece di inserire solo quel che
manca. Il nome normalizzato e' la ricaduta di un giro solo, per le righe
installate prima della 019: agganciata per nome, la riga riceve l'`uid` e dal
giro dopo si aggancia per quello.

Il catalogo scrive **solo i campi di catalogo** e **solo sulle righe che sono
sue** - `is_custom = 0` per un esercizio, `source = 'seed'` per un alimento.
`notes`, `dislike_level`, `is_banned`, `usage_count`, `is_favorite`, `barcode`
e `off_id` non li scrive mai: sono giudizi personali, stato d'uso e identita',
non la descrizione di una voce. Una voce tolta dal catalogo non si cancella,
diventa dell'utente.

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

**Italiano e inglese, dal 4 settembre 2026.** Non e' piu' un'app a lingua
singola: `SUPPORTED_LANGUAGES` (`src/stores/translationStore.ts`) e'
`["it", "en"]`, `src/i18n/locales/en.json` esiste, e `app.json` >
`expo-localization` > `supportedLocales` elenca entrambe. Ogni testo visibile
resta comunque `t("chiave")`, mai una stringa letterale nel JSX.

**L'inglese e' il default**, non l'italiano: `i18n.defaultLocale` e la lingua
di fallback dello store sono `"en"`. Un dispositivo la cui lingua non e' fra
quelle supportate ottiene l'inglese, non l'italiano - il contrario di come
funzionava prima. La lingua si sceglie nel **primo passo** dell'onboarding
(§ Il primo avvio) apposta per questo: il resto del wizard deve uscire nella
lingua giusta, e non si puo' dedurla in tempo dal dispositivo per ogni caso.
Era una schermata a se' fino all'8 settembre 2026 ed e' finita insieme al
benvenuto, che sceglierla riscrive all'istante.

Impostazioni > Lingua (`LanguageScreen`) e il primo passo dell'onboarding
condividono lo stesso selettore (`LanguagePicker`,
`src/containers/settings/`).

**Cambiare lingua RIMONTA il navigatore**, ed e' una riga voluta:
`<StaticNavigation key={language}>` in `src/navigation/index.tsx`. Numeri e
date si formattano leggendo `i18n.locale`, che e' una globale che React non
vede: col React Compiler attivo ogni chiamata viene memoizzata sui suoi
argomenti, quindi `formatLongDate(date)` con la stessa data non si rifa' - e
cambiando lingua la schermata si traduceva lasciando "7 settembre 2026" sotto
"Today". Provato sull'emulatore con un log dentro la funzione: al cambio lingua
non veniva chiamata affatto.

L'alternativa era passare la lingua a ogni chiamata - quarantasei file, e la
disciplina da ricordare per sempre. La chiave azzera ogni memo di ogni
componente in un colpo solo e vale anche per il codice che verra'. **Il prezzo
e' che dopo il cambio si riparte dalla schermata iniziale**: e' un gesto che si
fa una volta, non un'operazione quotidiana. Chi trova questa riga e la toglie
perche' "sembra inutile" rimette esattamente quel difetto.

**Anche le righe seminate nel database seguono la lingua**
(`src/services/seedLabels.ts`), e sono un caso a parte perche' non sono testo
dell'interfaccia: i cinque tipi di pasto nascono da una migrazione SQL e il
promemoria dell'acqua da un insert, quindi nessuna `t("chiave")` li raggiunge -
in inglese il diario diceva "CENA". `relabelSeededRows()` li riscrive
all'avvio e a ogni cambio lingua.

**Si riscrive la riga invece di tradurre a schermo** perche' quei nomi non li
legge solo il diario: li manda il catalogo all'assistente, li scrive il CSV, li
mostrano il piano e il foglio Aggiungi. Tradurre al momento del disegno
vorrebbe dire ricordarsene in ognuno di quei posti, per sempre.

E si riscrive **solo una riga che porta ancora un nome del seed**, in una
qualunque delle lingue supportate: un pasto rinominato a mano non si tocca, e
nemmeno uno creato dall'utente (§ I pasti che si possono usare). Cambiare
lingua non e' un'occasione per riscrivere quel che uno ha scritto, e c'e' un
test per ciascuno dei due versi.

**Anche i numeri hanno una lingua**, e dall'8 settembre 2026 seguono quella
dell'app: `formatInteger` e `formatDecimal` (`src/utils/number.ts`) leggono il
locale da `i18n`, come gia' faceva `formatShortDate`. C'era
`toLocaleString("it-IT")` scritto a mano in una ventina di posti, e in inglese
lo storico passi diceva "9.400 steps" - che in inglese si legge nove virgola
quattro. **Un numero formattato con le convenzioni di un'altra lingua non e'
brutto, e' un altro numero**, e `number.test.ts` vieta di scrivere di nuovo un
locale a mano.

Le due lingue non si distinguono solo per il segno ma per **quando** lo mettono:
in italiano il raggruppamento parte da cinque cifre, in inglese da quattro.
Nessuno lo indovina, ed e' la ragione per cui la scelta non si scrive a mano.

Il separatore che si **digita** e' un'altra cosa dal separatore che si **vede**.
`sanitizeDecimalInput` e i vari `Number(text.replace(",", "."))` accettano
virgola e punto in tutte e due le lingue - la tastiera numerica di Android
offre entrambi - e non vanno toccati; quel che si vede lo decide
`decimalSeparator()`, che `DfNumberInput` passa a `numberFormat.ts`. Quel
modulo resta senza `i18n` dentro: e' separato dal componente proprio per
poterlo caricare in un test.

**Anche l'assistente e il CSV seguono la lingua**, e non fanno eccezione.

L'assistente: `aiLanguage()` e `promptLanguage()` (`src/ai/config.ts`) hanno
preso il posto di `TRANSCRIPTION_LANGUAGE = "it"`, e ogni prompt che diceva
"reply in Italian" ora dice il nome della lingua corrente. Tre forme perche' tre
destinatari: il codice ISO per la trascrizione e per la voce, il nome inglese
per i prompt - un modello segue "reply in Italian" meglio di "reply in it".

- **I prompt sono funzioni, non costanti.** Una costante congela la lingua al
  caricamento del modulo, che e' lo stesso difetto dei `title` della tab bar.
- **La lingua dentro `buildSystemPrompt` non rompe la cache di Gemini**
  (§ Il prezzo del prompt dell'assistente): cambia solo quando l'utente cambia
  lingua, e fra due frasi dette di seguito il prefisso resta identico. E' l'unica
  cosa variabile ammessa li' dentro.
- **Anteprime e messaggi dei tool passano da `i18n`** (`assistant_tools.*`):
  li legge l'utente. Le `description` dei tool restano in inglese, perche'
  quelle le legge il modello - la distinzione ha un test.
- **La voce parla la lingua dell'app** e il controllo "c'e' una voce
  installata?" e' per lingua: cercando sempre quella italiana, chi usava l'app
  in inglese o si sentiva leggere l'inglese con fonetica italiana, o non si
  sentiva leggere niente.
- **Quel che resta italiano e' il DOMINIO, non l'interfaccia**: i valori
  nutrizionali di riferimento sono quelli dei prodotti italiani, e la
  conversione di "un etto" resta nel preprocessing. Chi usa KalTrack in inglese
  compra lo stesso al supermercato di sotto.

Il CSV: `csvSeparators()` sceglie **i due separatori insieme**, e la funzione
esiste per non poterli scegliere separati. In italiano decimale virgola e campi
separati da punto e virgola - con la virgola su entrambi ogni numero decimale
spaccherebbe la riga in due colonne - in inglese punto decimale e campi separati
da virgola, cioe' il CSV di tutti. Le intestazioni sono tradotte
(`backup.csv_header.*`) perche' le legge una persona; i nomi di alimenti e pasti
no, perche' sono i suoi dati.

**`en.json` e' completo dall'8 settembre 2026, e un test lo tiene tale.** Ne
mancavano ventinove - attrezzatura, storico peso/passi, storico misure, storico
sessioni - e non si vedeva finche' non si apriva quella schermata in inglese:
il titolo della pagina diceva `[missing "en.tracking.steps_history"]`. Ora
`keys.test.ts` confronta le due lingue **in tutti e due i versi**: una chiave
solo in italiano non si traduce mai piu', una rimasta solo in inglese e' testo
morto.

**Il server segue la lingua dell'app, non una sua**. `src/api/client.ts` manda
`Accept-Language` con la lingua di `translationStore`
(`setLanguageProvider`/`languageProvider`); il middleware
`SetLocaleFromHeader` (`backend/`) lo legge e chiama `App::setLocale` **per
quella sola richiesta** - non persiste, perche' un worker PHP-FPM serve utenti
diversi in sequenza e lasciarla scritta farebbe leggere a uno la lingua di
chi era passato prima. Serve ai messaggi che il server genera da solo (errori
di validazione, credenziali non corrette): `backend/lang/it/` e
`backend/lang/en/` hanno le traduzioni, e le risposte 422 aggiungono un campo
`message` gia' riassunto in una frase sola (`App\Support\ValidationMessage`),
pensato per un toast che non puo' mostrare tutti gli errori insieme.

### Path alias

`@/` per gli import assoluti dalla root (es. `@/src/components/...`). Mai
percorsi relativi `../`.

### Navigazione

React Navigation 7.x con API statica (`createStaticNavigation`). I tipi sono
generati da `StaticParamList` in `src/navigation/index.tsx`. `useAppNav`
centralizza l'unico cast necessario.

### Il primo avvio

**Quattro passi dall'8 settembre 2026, ed erano sette**
(`src/navigation/onboardingStack.tsx`, `OnboardingStep` in
`src/domain/onboarding.ts`): benvenuto e lingua, tutti i dati fisici insieme,
aspetto, account. Annidati in `RootStack` come "Onboarding" - stesso schema di
`Tab`. `App.tsx` idrata `onboardingStore` **prima** di montare
`<Navigation />`: la scelta fra atterrare su Oggi o sul wizard si legge una
volta sola all'avvio, passata a `StaticNavigation` come `initialState`, che
React Navigation rispetta solo al primo montaggio.

Sette passi per **nove campi**: i passi 3, 4, 5 e 6 ne portavano da uno a tre
ciascuno con il 70-80% di schermo vuoto, e si toccava "Avanti" sei volte per
scrivere quel che sta in una pagina. Le tre cose che sono cambiate, e il perche':

- **La lingua sta insieme al benvenuto.** Resta la prima cosa - il resto del
  wizard deve uscire nella lingua giusta (§ Lingua) - ma non e' piu' una
  schermata che contiene un elenco di due voci e nient'altro. Sceglierla
  riscrive il testo sopra all'istante, che e' anche il modo piu' diretto di far
  vedere che la scelta e' arrivata.
- **I dati fisici stanno tutti in una schermata, e sotto c'e' il fabbisogno che
  si calcola mentre li scrivi.** Nessuno dei quattro passi precedenti diceva a
  cosa servissero quei numeri; il pannello e' quella risposta, e riempie lo
  spazio con la conseguenza di quel che si sta scrivendo invece che col vuoto.
  Compare **solo a dati completi**: un numero che appare a meta' strada e poi
  salta del quaranta per cento perche' mancava il peso non e' un'anteprima.
  Quel pannello mostra lo **stesso** numero che viene salvato come obiettivo, e
  per questo il passo degli obiettivi giornalieri non c'e' piu': si regolano da
  Profilo > Obiettivi, dopo aver usato l'app, che e' quando si ha un'idea di
  cosa cambiare.
- **L'account e' l'ultimo passo e prima era il secondo**, cioe' un modulo di
  registrazione prima ancora di aver visto l'app, con "Salta per ora" - la via
  che quasi tutti prendono - come bottone piu' lontano dello schermo. Ora si
  arriva li' a wizard finito e il bottone in fondo dice "Inizia senza account".

**I cinque nomi tolti possono essere ancora scritti in `settings`** su un
telefono che aveva abbandonato il wizard a meta'. `isOnboardingStep` li scarta e
si riparte dal primo passo: quattro schermate, e i dati gia' salvati si
ritrovano nei campi perche' ogni passo li rilegge. C'e' un test.

Riprendendo un abbandono a meta', `initialState` non punta solo al passo
salvato: ricostruisce **tutta** la cronologia fino a li', altrimenti
"Indietro" al primo passo dopo la ripresa non avrebbe dove tornare.
`onboarding_step` e' locale (`LOCAL_ONLY_SETTINGS`, come `plan_applied` non lo
e' per il motivo opposto - vedi § Sincronizzazione): dice a che punto e'
arrivato QUESTO telefono, non un fatto sui dati. `onboarding_completed` invece
sincronizza, cosi' un secondo dispositivo sullo stesso account non lo rifa'.

**`saveProfile` e' un upsert su riga unica**, non un aggiornamento parziale:
chi tocca `profile` rilegge prima l'intera riga e la riscrive per intero, o
sovrascrive con i default i campi scritti da qualcun altro. Era la regola piu'
delicata del wizard a sette passi, dove tre schermate diverse scrivevano la
stessa riga; con i dati fisici raccolti in un passo solo il problema non si
pone piu' li' dentro, ma la regola vale ancora per `TargetsScreen` e per
chiunque scriva quella riga.

L'uscita dall'ultimo passo non naviga: `resetToTabs()` (in `useAppNav.ts`)
azzera tutta la cronologia su `Tabs` con l'imperativo `navigationRef`, perche'
un `navigate` da dentro lo stack annidato lascerebbe "Onboarding" sotto -
l'indietro da Oggi ci rientrerebbe.

### Dove vive il microfono

`AssistantButton` e' montato **dentro `TodayScreen`**, non sopra la navigazione.

Era una scelta di prodotto prima che di layout: l'assistente scriveva pasti,
passi, peso e obiettivi - esattamente quel che sta su Oggi - e in palestra non
toccava niente. Globale, seguiva l'utente in dodici schermate dove non poteva
fare nulla, e in due si sedeva sopra un interruttore.

**La domanda e' stata riaperta e richiusa il 3 settembre 2026** (`TODO.md`
§ 7). `src/ai/tools/registry.ts` ha **tredici** strumenti, e tre riguardano la
palestra: `create_exercise`, `create_routine`, `log_workout`. Con le mani sul
bilanciere il microfono sarebbe piu' veloce di qualunque campo, ma la scelta
di prodotto resta: l'AI in palestra fa solo `create_routine` - generazione
scheda su richiesta, com'e' oggi da `GenerateRoutineScreen` - e il microfono
resta su Oggi. `create_exercise` e `log_workout` restano nel registro ma non
diventano un percorso da costruire. Chi la riapre ancora tenga presente
l'aritmetica del paragrafo seguente: e' il motivo per cui montarlo sopra il
navigatore non sarebbe stato gratis.

Il guadagno tecnico e' che sparisce l'aritmetica: montato fuori dal navigatore
il microfono si misurava dal fondo della **finestra**, mentre il "+" di una
schermata si misura dal fondo della **schermata**, che finisce dove inizia la
tab bar. Lo stesso `bottom` cadeva a due quote diverse, ed e' cosi' che i due
bottoni si sovrapponevano sulla home e non su Alimenti. Ora sono due elementi
della stessa schermata: `SCREEN_FAB_BOTTOM` impila il "+" sopra il microfono e
`ASSISTANT_FAB_CLEARANCE` e' lo spazio che **solo la lista di Oggi** si lascia
in fondo. Nessun'altra schermata deve piu' riservare niente.

**Le due preferenze dell'assistente stanno dentro l'assistente**, non nelle
impostazioni. La voce si zittisce dall'altoparlante in cima all'overlay, dove
la si cerca nel momento in cui serve - in ufficio, di notte - e non tre
schermate piu' in la'. L'auto-conferma per tool ("non chiedermelo piu'") non
c'e' piu' dal 3 settembre 2026: un'azione che scrive nel diario si conferma
sempre, e una preferenza che si accendeva con una spunta dentro la scheda di
conferma valeva meno del tocco che risparmiava.

Resta montato anche mentre si guarda un'altra scheda - i tab non si smontano
dopo la prima visita - quindi la scorciatoia `kaltrack://assistente` sull'icona
dell'app continua a far partire l'ascolto da qualunque punto.

### Il catalogo degli esercizi

Duecento esercizi nel seed (`src/db/seed/exercises.ts`), con id parlanti
(`ex-panca-piana-bilanciere`) che li rendono riconoscibili fra un
aggiornamento e l'altro.

**`instructions` e' obbligatoria nel tipo `SeedExercise`.** Non lo era, e per
128 dei 200 la schermata di dettaglio rispondeva "Nessuna descrizione" a chi
chiedeva come si esegue. Sono state scritte tutte il 7 settembre 2026, e il
tipo piu' un test (`seed.test.ts`, la stringa deve dire qualcosa e non solo
esistere) fanno si' che il prossimo esercizio aggiunto non possa entrare muto.

**Il modulo ha il campo per scriverla**, e prima non ce l'aveva:
`ExerciseFormSheet` si limitava a riportare avanti quel che il seed aveva
messo, quindi una descrizione mancante non era colmabile da nessuna parte.

**Le foto invece non sono nel seed, e non e' una dimenticanza da colmare in
codice.** `photo_uri` e' arrivata con la migrazione 18, l'ultima, e il seed e'
della Fase 1: duecento immagini vorrebbero dire duecento file con una licenza
che li permetta, che e' un problema di contenuti. Per un utente singolo la
foto si mette dal modulo, una alla volta; per il catalogo comune la Fase 1 del
gestionale ha aperto una seconda via, di un tipo diverso: si carica **una
volta sola, dal pannello**, ed e' quella che raggiunge tutti gli iscritti -
non e' piu' vero che nessuna foto arrivi da li'.

**Il catalogo comune sul server ora porta anche istruzioni e foto**, e non
piu' solo nome, gruppo muscolare, muscoli secondari e attrezzatura: la Fase 1
del gestionale ha aggiunto `instructions` e `photo` a `exercises` (`barcode`,
`off_id` e `image` a `foods`), e il pannello di amministrazione e' il posto
dove si scrivono per una voce che serve a tutti - non piu' un limite del
catalogo, ma un campo che oggi solo un amministratore riempie.

**Aggiornare il seed non raggiunge chi ce l'ha gia'.** `applyExerciseSeeds`
inserisce solo gli id mancanti e non tocca le righe esistenti, ed e' voluto:
la scelta dell'utente vince, un esercizio vietato o cancellato non torna
indietro. Correggere il testo di un esercizio gia' installato **non vuole piu'
dire una migrazione**: l'app consuma `/api/catalog/exercises`, e lo fa il pull
incrementale del catalogo comune, su una riga `is_custom = 0` - una migrazione
resta necessaria solo per la riga che il pull non tocca mai, quella che
l'utente ha reso propria (§ Il catalogo comune, dal telefono).

### Il catalogo comune, dal telefono

`src/services/catalogSync.ts`, dall'8 settembre 2026. Sostituisce
`exerciseCatalog.ts`/`foodCatalog.ts` (ritirati insieme a lui): quelli
leggevano tutto il catalogo a ogni giro e inserivano solo quel che mancava, e
non potevano ne' aggiornare una riga gia' presente ne' seguire una rinomina -
vedi § L'unica cosa che esce verso i non amici per il costo. Il commento in
testa al file enuncia le tre regole per esteso; qui restano i **perche'** che
non stanno nel codice.

**Un'ora, non un giro a ogni avvio.** `CATALOG_WINDOW_MS` sotto quest'ora
dall'ultimo giro riuscito non ne fa un altro. Il catalogo e' anagrafica
comune che cambia quando un amministratore decide, non quando si registra una
serie: un'ora basta a far arrivare una correzione in giornata e non pesa sul
passaggio piu' frequente, il ritorno in primo piano - senza quella finestra,
alternare due app avanti e indietro chiederebbe il catalogo a ogni passaggio.
Il segnaposto si scrive **solo** se il giro e' arrivato davvero al server, e
solo se **entrambi** i pull (esercizi e alimenti) ci sono arrivati: scriverlo a
un giro parzialmente fallito chiuderebbe la meta' fallita per un'ora, cioe' il
difetto che la finestra esiste per evitare.

**Si salva `cursor` e non `next`.** Il primo dice dove siamo arrivati, il
secondo se c'e' altro. Salvando `next`, l'ultima pagina - che non e' mai piena
- non avrebbe avanzato il segnaposto, e la coda del catalogo si sarebbe
riletta a ogni giro in silenzio. Si salva a ogni pagina e non alla fine del
giro: un giro interrotto a meta' riprende da dove era, invece di rifare tutto.

**Un giro alla volta, e la guardia sta dentro `syncCatalog`** - la stessa
regola 6 della sincronizzazione dati, per lo stesso motivo: il catalogo ha tre
inneschi (avvio, ritorno in primo piano, bottone su due schermate), e mettere
la guardia in uno solo li lascerebbe liberi di scavalcarla. Un secondo
chiamante **aggancia** il giro gia' in corso invece di ricevere uno zero
finto, cosi' il bottone racconta l'esito del giro che sta davvero girando.

**Le foto del catalogo hanno una cartella loro**, `CATALOG_PHOTOS_DIR` e non
`PHOTOS_DIR` (`src/services/photoSync.ts`). Sono comuni a tutti gli iscritti e
vivono sul server sotto un percorso diverso da quello per utente
(`/catalog/images/*`, non `/images/{utente}/*`): chiederle al percorso
sbagliato sarebbe un 404 garantito. Nessun `persistPhoto` scrive mai in questa
cartella - le foto di catalogo arrivano solo dal pannello - quindi
`uploadPendingPhotos` non la tocca: non c'e' niente da caricare da li'.
`collectOrphanPhotos` invece **la raccoglie**, con un criterio suo che non e'
quello delle foto dell'utente: il dettaglio sta in § Le foto, e questo
passaggio ha dichiarato il contrario finche' non lo si e' andato a guardare.
Come per le foto normali, il
percorso arriva subito col pull e i byte solo quando si guarda
(`ensureLocalPhoto`): un catalogo di duecento esercizi non scarica duecento
immagini per un giro che serve solo ad aggiornare due nomi.

**Un ripristino da backup risemina la tassonomia.** Ogni backup precedente
alla migrazione 020 non porta ne' `muscle_groups` ne' `equipment_types`
(`BACKUP_TABLES` le svuota e reinserisce `payload.tables[table] ?? []`, cioe'
niente), e `runMigrations` e' gated su `PRAGMA user_version`: quella
migrazione non riparte una seconda volta. Senza rimedio le due tabelle
resterebbero vuote per sempre - cinque selettori vuoti e l'assistente che
rifiuta anche "petto" - e senza account non c'e' nemmeno un pull che le
ripari. `applyTaxonomySeeds` (`src/db/seed/index.ts`) e' lo stesso contratto
di `applyExerciseSeeds`: inserisce solo gli slug mancanti e non tocca le righe
gia' presenti, nemmeno se il pannello le ha rinominate. Gira **sia** dopo un
ripristino **sia** a ogni avvio, prima che qualunque schermata legga la
tabella - e **non** resuscita uno slug che un amministratore ha cancellato: un
cancellato conta come presente e non torna.

**`src/db/seed/taxonomies.ts` e' una copia a mano dei valori della migrazione
020**, per lo stesso motivo di `src/db/seed/exercises.ts`: la migrazione gira
una volta sola e non puo' riseminare, `applyTaxonomySeeds` deve poter girare
quante volte serve. Un test confronta tutte e 23 le righe in entrambe le
lingue contro le costanti: senza, una divergenza fra le due copie - proprio
nelle etichette che l'utente legge dopo un ripristino - sarebbe invisibile
finche' qualcuno non apre quella schermata su un telefono che ha appena perso
la tassonomia.

### L'attrezzatura

`EquipmentScreen` (Profilo > Palestra > Attrezzatura) non e' piu' un widget
incorporato in cima a Esercizi - lo era fino al 4 settembre 2026
(`EquipmentPicker`, tolto): e' una schermata a se', perche' non e' una scelta
che si fa mentre si cerca un esercizio, e' una scelta che si fa una volta e
resta.

**"Le mie schede" ci passa in mezzo quando non esiste ancora una scheda**:
il "+" apre `Equipment` con `{ setupForRoutine: true }` invece di
`RoutineForm` direttamente, e in quel caso la schermata aggiunge in fondo un
bottone "Continua" che sostituisce (`replace`, non `navigate`) verso
`RoutineForm` - senza lasciare `Equipment` in pila, altrimenti "Indietro" da
li' ci tornerebbe.

**Quella dichiarazione e' l'unica, e chi genera una scheda la legge invece di
richiederla.** `GenerateRoutineScreen` aveva tre preset propri ("Palestra
completa", "Manubri e panca", "Corpo libero") indipendenti da `user_equipment`:
chi aveva segnato di non avere i cavi si ritrovava una scheda coi cavi
lasciando il preset predefinito, e nessuna delle due schermate aveva torto -
erano due domande sulla stessa cosa. Dal 5 settembre 2026 la schermata chiama
`listAvailableEquipment()` e mostra il risultato in sola lettura, con un link a
`Equipment`; rilegge a ogni ritorno (`useFocusEffect`), o tornando dal link il
numero sarebbe ancora quello vecchio.

Vale la pena ricordare **perche' l'elenco e' per eccezione** (§
`listAvailableEquipment`): tutto conta come disponibile tranne quel che si e'
tolto a mano. Su un telefono appena installato il risultato e' quindi
l'attrezzatura completa - cioe' esattamente il vecchio preset predefinito, e
nessuno vede un comportamento diverso da prima finche' non dichiara qualcosa.

**Dall'8 settembre 2026 ci sono due letture, ed e' la stessa distinzione dei
tipi di pasto** (§ I pasti che si possono usare): gruppi muscolari e
attrezzatura sono ora tabelle di tassonomia, e un amministratore ci puo'
cancellare uno slug. `listAvailableEquipment()` esclude i cancellati ed e' la
lettura di chi **offre una scelta** - i picker, `create_exercise`;
`listUsableEquipment()` li comprende ed e' la lettura di chi **disegna
esercizi che esistono gia'** - `suggestAlternatives`, che ci era cascato
usando la prima: un amministratore che cancella "panca" dalla tassonomia non
deve togliere in silenzio, dalle alternative, gli esercizi con la panca che
l'utente non ha mai smesso di avere. Entrambe restano per eccezione, e
continuano a escludere quel che l'utente ha tolto a mano. Chiunque aggiunga
una lettura della tassonomia deve farsi la stessa domanda dei tipi di pasto:
sto offrendo una scelta o sto disegnando quel che c'e' gia'?

### I carichi di una scheda

`block_exercises.target_weight` esisteva dalla migrazione 5 ed era scritto solo
dal tool `create_routine` dell'assistente: il modulo della scheda non aveva il
campo e `generateRoutine` non lo chiedeva. `SessionScreen` lo leggeva gia'
(`last?.weight ?? targetWeight`), quindi era un ripiego che quasi nessuno
riempiva.

Ora il campo kg sta accanto a serie e ripetizioni in `BlockEditor`, e la
generazione con l'IA propone un carico. **Vuoto non e' zero**: `toNumber`
torna `null` su un campo in bianco, e un esercizio senza carico e' un esercizio
il cui carico si decide in palestra.

Tre regole su quel carico, e nessuna e' un dettaglio:

- **Lo storico vince sul modello** (`applyKnownWeights`). Il modello ricava un
  numero da livello e peso corporeo, cioe' da una persona media con quelle due
  caratteristiche; `lastWorkingWeights` sa con quanto **questa** persona ha
  chiuso l'ultima volta. Scrivere 60 kg a chi ne spinge 100 e' il modo piu'
  rapido per far cancellare la scheda appena generata.
- **`lastWorkingWeights` non e' `personalBest`.** E' la serie di lavoro piu'
  pesante dell'**ultima** volta, non il record di sempre: un massimale di un
  anno fa proposto come carico di oggi e' un consiglio sbagliato.
- **Il peso corporeo e' l'altra meta' del livello.** "Intermedio" da solo non
  distingue un carico per 60 kg da uno per 95, quindi `latestWeight()` entra
  nel prompt; quando non c'e' il prompt lo **dichiara assente** e il modello
  omette i carichi invece di inventarli su una persona di cui non sa niente.

Un carico fuori da `MIN_WEIGHT_KG`/`MAX_WEIGHT_KG` si **scarta e non si
corregge**, come in `sanitizeReading` per l'etichetta: il campo resta vuoto e
la scheda arriva lo stesso. E come i grammi stimati da una foto, la scheda
generata **non si salva da sola**: atterra in `RoutineForm` coi campi
modificabili, che e' la ragione per cui un numero immaginato dal modello e'
accettabile li' dentro.

### Lo svolgimento dell'allenamento

`SessionScreen`, ridisegnata il 7 settembre 2026. Tre cose che mancavano o
gridavano:

**In cima c'e' un hero, e prima non c'era niente.** Fra una serie e l'altra la
domanda e' "quanto manca", e la schermata non la rispondeva in nessun modo: si
scorreva contando i tondi spuntati. Ora `HeroPanel` porta serie fatte su totali
e una barra. Il totale esce dallo **stesso** `planBlock` che disegna le righe,
quindi non puo' divergere da quel che si vede.

**Le unita' si scrivono una volta.** "kg" e "rip" stavano dentro ogni `SetRow`,
quindi tre serie li stampavano tre volte, con in mezzo un "×" che sembrava
un'operazione fra i due campi. Ora sono l'intestazione della colonna
(`SetHeader`), e le righe restano numeri. **`SetHeader` e `SetRow` condividono
le misure**: badge 28, spaziatura sm, tondo 48. Cambiandone una di la' va
cambiata anche qui, o le etichette escono dalla loro colonna - e `SetHeader`
avvolge i campi nello stesso `body` con `flex: 1`, perche' senza si stringevano
sul proprio testo.

**Il tondo della spunta resta 48x48.** Si preme col pollice, di fretta e con le
mani sudate: e' l'unico elemento della schermata che non si rimpicciolisce.
Sono i campi ad essere scesi (altezza 44, padding orizzontale) e "Proponi
alternativa" a essere passata da pillola a contorno a collegamento - e'
un'azione per quando il bilanciere e' occupato, non l'azione della schermata.

### La composizione di un blocco

`BlockEditor`. **Il tipo del blocco si diceva due volte**: un titolo "A ·
Singolo" e sotto una riga di chip con "Singolo" selezionato. Il selettore da
solo lo dice, e la riga scorrevole tagliava "Dropset" a "Drops" - in un
selettore, dove il punto e' vedere le alternative. Ora e' un controllo a
segmenti in larghezza piena: quattro tipi, nessuno tagliato.

**Recupero e "Aggiungi esercizio" non sono piu' affiancati.** Erano un campo
numerico e un bottone alti uguale, che letti insieme sembravano due bottoni - e
per allinearli serviva un'etichetta invisibile come zeppa. Il recupero e' un
dato del blocco e sta su una riga sua; l'aggiunta e' un'azione e sta sotto,
come "Aggiungi qui" nel diario.

**Il gruppo muscolare sta sotto il nome dell'esercizio**, non in coda ai tre
campi: li' era sulla stessa riga del campo KG e sembrava il valore dei
chilogrammi.

Nel modulo della scheda, **i giorni vanno a capo invece di scorrere**:
scorrendo, "Aggiungi giorno" finiva mezzo fuori schermo gia' col terzo giorno,
e un'azione tagliata a "+ Aggiu" non si vede che c'e'.

### La serie spuntata

Il tondo verde di `SetRow` e' un **interruttore**, non un punto di non ritorno:
ritoccarlo disfa la serie e restituisce i campi. Il numero sbagliato ci si
accorge di averlo scritto un secondo dopo averlo confermato, e fino al 6
settembre 2026 non c'era modo di correggerlo - la riga si bloccava perche'
`logSet` aveva gia' scritto, e non esisteva una query per disfare.

Ora c'e' `deleteSet`, che e' un soft delete come tutto quel che si sincronizza
e riporta indietro `usage_count` (con pavimento a zero): spuntare e despuntare
tre volte gonfierebbe il contatore che ordina l'elenco esercizi. Rispuntando si
scrive una serie **nuova**, con un id nuovo: la vecchia e' cancellata e non c'e'
niente da riconciliare.

`SessionScreen` tiene un solo stato, `logged: Record<chiave riga, id serie>`, e
non un `done` booleano accanto: l'id serve per disfare, e due stati separati
potevano discordare - una riga spuntata di cui non si sapeva piu' cosa
cancellare.

**Riprendendo un allenamento a meta' le spunte tornano.** `startSession`
ritrovava gia' la sessione aperta, ma lo schermo ripartiva vuoto: le serie gia'
fatte sembravano da fare e rispuntarle ne scriveva di doppie. `loggedSetsOf` +
`matchLoggedSets` (`src/domain/session.ts`) le riagganciano alle righe, e
tornano anche i **valori** - una riga spuntata ha i campi bloccati, e mostrarci
dentro il carico dell'ultima volta invece di quello appena registrato sarebbe
una riga che mente.

`matchLoggedSets` consuma ogni serie **una volta sola**, e non e' pedanteria: un
blocco puo' contenere lo stesso esercizio due volte - e' cosi' che si scrive un
dropset - e li' blocco, esercizio e indice non bastano a distinguere due righe.

### L'allenamento lasciato aperto

Chi esce da `SessionScreen` senza premere "Termina" lascia una sessione aperta,
e fino al 7 settembre 2026 era un vicolo cieco: la card "Allenamento in corso"
era **solo un'etichetta**, non si toccava, e `endSession` si raggiunge unicamente
dal "Termina" dentro `SessionScreen`. Chi non riusciva a rientrare in quella
schermata non poteva piu' chiudere l'allenamento.

Ora la card **riprende**: mappa `routineDayId` all'indice fra i giorni della
scheda attiva e riapre `Session` dov'era. Quando quella mappatura non riesce -
un allenamento libero, o il giorno di una scheda che non e' piu' attiva - non
esiste una schermata dal vivo dove tornare, e la card porta al dettaglio, che
per una sessione aperta offre "Termina". E' l'unica via d'uscita per quei casi,
e la ragione per cui `SessionDetailScreen` ha un'azione pur essendo in sola
lettura.

**Non compare fra gli "Ultimi allenamenti".** Stava scritto due volte, in cima e
in elenco, e sembravano due allenamenti diversi.

`openSession()` e' una query a se' e non il primo elemento di `recentSessions`:
quella si ferma agli ultimi cinque, e una sessione dimenticata aperta la
settimana scorsa ne uscirebbe appena si fanno cinque allenamenti nuovi - la card
sparirebbe e si tornerebbe a non poterla chiudere. `recentSessions` invece resta
com'e', aperti compresi: la usano anche il confronto con gli amici e la
condivisione, che contano gli allenamenti di una giornata e non si fanno la
stessa domanda. E' la palestra a filtrare.

### La scheda cancellata

`deleteRoutine` fa tre cose e non una:

- `deleted_at`, ovviamente;
- **`is_active = 0`**. `getActiveRoutine` filtra gia' i cancellati, ma una riga
  cancellata e ancora marcata attiva e' uno stato che non esiste, e sull'altro
  telefono arriva cosi';
- **chiude l'allenamento rimasto aperto** su un giorno di quella scheda. La
  palestra mostrava "Allenamento in corso" per una sessione il cui giorno non
  c'era piu', e non restava un modo per chiuderla. Si chiude, non si cancella:
  quelle serie sono state fatte davvero.

I giorni invece **non** si cancellano, ed e' deliberato: `recentSessions` e
`sessionDetail` li leggono per il nome, e cosi' un allenamento passato continua
a dire quale giorno di scheda seguiva anche dopo che la scheda non c'e' piu'.

### Il quick-log di peso e passi

Non sta piu' su Oggi. Fino al 4 settembre 2026 due card (`DayStatCard`,
`QuickLogSheet`) permettevano di leggere e impostare **solo il valore di
oggi**, direttamente dalla schermata Oggi. Oggi quel bottone "+" sta su
**Progressi**, dentro la riga della metrica, e apre `MetricEntrySheet`
- che ha un selettore di data: **si registra anche per un giorno passato**,
non solo per oggi.

Dal 7 settembre 2026 peso, passi e calorie sono **tre righe di un blocco**
(§ I tre livelli di superficie) e non piu' tre card impilate, ognuna con la sua
etichetta di sezione sopra e un riquadro alto un terzo di schermo dentro. Con la
finestra vuota - il caso normale di chi ha appena installato - restavano tre
rettangoli grandi e vuoti, e la pagina sembrava piena e vuota insieme. In riga
la linea sta a destra e **compare da due punti in su**: uno solo non e' una
tendenza, e un pallino in mezzo al vuoto sembra un difetto. Il grafico esteso
vive nello storico, dove c'e' spazio per guardarlo.

**Quella frase e' stata falsa per una settimana**, ed e' il difetto piu' caro di
tutto il ridisegno: gli storici non avevano nessun grafico e non l'avevano mai
avuto, quindi togliere le tre sparkline a piena larghezza non ha spostato il
grafico grande - lo ha tolto dall'app. Chi scrive "vive altrove" in un commento
ha finito il lavoro solo dopo essere andato a vedere che li' ci sia davvero.

Toccare la riga (invece del "+") apre `WeightHistoryScreen` /
`StepsHistoryScreen`: lo storico completo da `earliestRecordedDate()`, con
selezione multipla a pressione lunga ed eliminazione in blocco - lo stesso
schema gia' usato dalle sessioni di `GymScreen` e dalle misure di
`MeasurementsScreen`. Nessuna nuova migrazione: la cancellazione riusa
`deleted_at`, gia' presente sulle tabelle coinvolte (regola 1 della
sincronizzazione).

Dall'8 settembre 2026 in cima c'e' `MetricHistoryHero`: il numero di adesso, il
secondo numero che lo mette in prospettiva, il grafico e la finestra. Quattro
cose da non rompere:

- **La finestra vale per tutta la schermata**, non solo per il grafico: numeri,
  linea ed elenco parlano dello stesso periodo, o il totale in cima non
  tornerebbe con le righe sotto. E cambiandola **la selezione si azzera**: una
  riga selezionata e poi uscita dalla finestra resterebbe nel gruppo da
  cancellare senza vedersi piu'.
- **I due numeri non sono gli stessi per le due grandezze.** Il peso e' una
  grandezza che scorre: ultima pesata e variazione sul periodo. I passi
  ripartono da zero ogni giorno, quindi l'ultimo valore non dice niente - li'
  sono media al giorno e totale. La media e' sui giorni **registrati**: un
  giorno senza registrazione non e' un giorno a zero passi (§ `average`).
- **Il peso disegna una linea, i passi delle barre**, e le barre partono da
  zero: una barra e' una quantita', e tagliarne la base farebbe sembrare 9.000
  passi il doppio di 8.000. Una linea invece puo' partire dal minimo della
  serie, perche' quel che dice e' la forma. Da questo segue anche **quanti
  punti servono**: la linea parte da due (uno solo non e' una tendenza, ed e'
  un pallino in mezzo a un riquadro alto 120 - il primo avvio con una sola
  pesata usciva cosi'), le barre da una.
- **Il delta non ha un colore.** Verde su un calo direbbe che calare e' bene, e
  non e' l'app a saperlo: e' la stessa ragione per cui il confronto con gli
  amici non da' un vincitore sulle calorie e sul peso non lo fa affatto
  (§ Il confronto con gli amici).

`TrendChart` non e' `Sparkline` con altri numeri: quella disegna un `Svg` a
`width="100%"` con un `viewBox` fisso, quindi stira il disegno in orizzontale -
accettabile per una linea alta 30 in fondo a una riga, non dove i pallini devono
essere tondi e le barre larghe uguali. `TrendChart` misura la larghezza e
disegna in pixel veri; `Sparkline` resta a Progressi e alle misure.

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

**Un secondo difetto, distinto da questo**: `GluestackUIProvider` va anche
avvertito ESPLICITAMENTE del tema con la prop `mode`, o resta fisso su
`"light"` a prescindere da dove sta `ThemeProvider` nell'albero - i suoi
componenti basati su classi NativeWind (l'Actionsheet di `DfSelect`, per
esempio) restavano bianchi in tema scuro. `ThemedGluestackProvider` in
`App.tsx` legge `useAppTheme()` e passa `mode={isDark ? "dark" : "light"}`.

### I tre livelli di superficie

**Dal 7 settembre 2026 i contenitori sono tre, e prima era uno solo.** Ogni
elenco era fatto di `Card`, una per riga: una voce di menu del Profilo, un
giorno di scheda, un allenamento passato e il riepilogo di una giornata avevano
lo stesso bordo, la stessa ombra e lo stesso padding. Con un contenitore solo
l'unica leva per dire "questo conta" e' fare l'elemento piu' alto - e allora
diventa alto tutto: cinque voci del Profilo riempivano uno schermo, e le sedici
voci erano quattro schermate di scorrimento.

1. **`HeroPanel`** (`src/components/kal/HeroPanel.tsx`) - **uno per schermata**,
   ed e' la risposta alla domanda che si viene a fare li': le calorie su Oggi,
   la scheda attiva in Palestra, chi sei sul Profilo. Non e' un'indicazione di
   stile: due superfici chiare sulla stessa pagina si contendono l'occhio e
   nessuna delle due indica piu' niente.

   E' anche **l'unico posto dove il metallo si vede**. `MetalSurface` e
   `MetalPanel` esistevano dalla Fase 1 e l'unica cosa che li usava era il FAB
   da 56 px: il carattere dichiarato in `src/styles.ts` - superficie
   metallizzata, gradiente verticale, linea di luce sul bordo alto - era
   implementato e poi non applicato a niente di visibile. E' da li' che veniva
   il "sembra generico", non dalla palette.

   Un separatore dentro l'hero e' `HeroDivider` e **non** `colors.border`:
   quello e' tarato sullo sfondo delle schermate, e sopra il metallo sparisce
   in chiaro e stacca troppo in scuro.

2. **`ListGroup` + `ListRow`** (`src/components/kal/ListGroup.tsx`) - N righe
   dentro **una** superficie, separate da una linea invece che da un vuoto. La
   riga e' alta 48 (sopra i 44 di area di tocco) contro i 54 + 8 di gap di
   prima, ma il guadagno vero non e' il 23% di altezza: e' che un blocco e' **un
   oggetto solo** e cinque card sono cinque oggetti.

   Il separatore rientra fino a dove finisce l'icona. **Chi fa righe senza icona
   passa `indent={0}` o `indent={theme.spacing.md}`**, o la linea comincia in
   mezzo alla parola.

3. **Nudo** - contenuto direttamente sullo sfondo, con l'etichetta di sezione
   sopra: i pasti di Oggi, gli allenamenti passati in Palestra. Quel che si
   scorre e basta non chiede una scatola; bordo e ombra ripetuti N volte sono
   rumore che dice ogni volta la stessa cosa.

**`Card` resta**, e non e' un residuo: e' per quel che e' davvero una scheda a
se' - il riquadro del coach settimanale, un pannello di spiegazione, la card
dell'allenamento rimasto aperto. Non per fare da cornice a una riga.

**Una lista LUNGA non e' un blocco.** `ListGroup` avvolge i suoi figli in una
`View`, e una `FlatList` non ci passa dentro: gli elenchi virtualizzati -
alimenti, ricette, esercizi, schede - restano `FlatList` con righe nude e
`ItemSeparatorComponent` a filo di capello. E' il livello 3, non il 2. Duecento
esercizi in card da 76 px ne facevano stare otto per schermata; a riga nuda,
con la miniatura a 40, sono tredici.

**L'etichetta di un campo non e' quella di una sezione.** `FieldLabel`
(`kal/Primitives.tsx`) e' 14/500 in tondo - gli stessi numeri che `DfInput` ha
gia' dentro; `SectionLabel` e' 12/700 maiuscolo spaziato. Erano indistinguibili
perche' chi disegnava un modulo a mano - Obiettivi, account, onboarding, il
proprio profilo - copiava il trattamento della sezione su ogni campo: Obiettivi
aveva undici titoli dello stesso peso, e "Obiettivi giornalieri", che una
sezione lo e' davvero, non si distingueva da "Sesso".

**Uno stato vuoto dentro qualcosa e' `compact`.** `EmptyState` a piena altezza
riserva 64 px sopra e sotto: giusto a tutto schermo, sbagliato dentro una card -
il vuoto teneva lo spazio del pieno, ed e' la stessa regola dei grafici.

Il coach settimanale e' l'esempio del perche' l'hero non e' obbligatorio:
contiene un bottone `MetalSurface`, e dentro un pannello di metallo quel bottone
sparirebbe. Una schermata senza hero e' legittima; due hero no.

`ThemePicker` e `LanguagePicker` avevano il blocco disegnato a mano, uguale in
tutti e due: erano la prova che il componente serviva, e ora lo usano.

Il canvas del ridisegno - il sistema piu' le quattro schede radice - sta in
`design/` (`*.dc.html` + `canvas.json`).

### Styling

Doppio sistema: `StyleSheet.create()` con token statici da `src/styles.ts`, più
`useAppTheme()` per i colori semantici light/dark (background, surface, border,
text). NativeWind disponibile ma non prevalente. I componenti `Text` e
`TextInput` in `src/components/ui/` risolvono automaticamente Poppins da
fontWeight: **usare sempre quelli**, mai le primitive RN nude.

**Un testo affiancato a qualcos'altro sta allineato in altezza, e non e'
compito della schermata.** Su Android il testo si porta dietro un padding sopra
e sotto la riga, dentro la sua cassa: la cassa e' piu' alta del glifo, quindi un
`alignItems: "center"` centra la cassa e non la parola, e l'etichetta esce
qualche pixel piu' in basso dell'icona che le sta accanto. `includeFontPadding:
false` e' quindi il **default** dei due componenti di `ui/`, applicato prima di
`style`: chi ha un motivo per rivolere il padding passa
`includeFontPadding: true`, e nessuno deve piu' rimediarlo per conto proprio.
Lo era in sei file, cioe' solo dove qualcuno se ne era accorto: i titoli delle
pagine di Impostazioni, quello di `DfBottomSheet`, il campo di `SearchBar`. Le
etichette dei bottoni no, e si vedeva.

**L'intestazione di una pagina ha due misure, e la misura dice che pagina e'.**
`fontSize: 24` e' la radice di un tab (Oggi, Progressi, Palestra, Profilo), che
non ha il chevron; `fontSize: 18` e' una pagina interna, che ce l'ha. Il resto e'
identico ovunque - `paddingHorizontal: md`, `paddingVertical: sm`, `gap: sm`,
chevron 26, `hitSlop 10` - ed e' scritto una volta in `SettingsPage`
(`src/containers/settings/`), che pero' usano solo le sei pagine di
Impostazioni: le altre tredici se lo ridisegnano, e si somigliano per copia e
non per costruzione.

Alimenti, Ricette e Amici avevano preso il 24 da una radice di tab, e Alimenti e
Ricette compensavano con un `paddingTop` sul titolo al posto del
`paddingVertical` sull'intestazione - che e' poi il motivo per cui il testo non
era in asse col chevron. Allineate il 7 settembre 2026. Chi ne aggiunge una
copi da una delle tredici, non da una radice di tab.

`theme.colors.macro` (proteine, carboidrati, grassi) sono token: grafici, barre
e legende devono usarli per non divergere. L'anello delle calorie e' diviso per
macro con quegli stessi token (`macroSlices` in `src/domain/nutrition.ts`,
disegnato da `MacroArc`), e lo usano sia la home sia i cerchietti del
calendario: il grigio in coda e' la parte di calorie che i macro non spiegano,
non un quarto macro.

### Quel che si digita

**Un campo il cui stato non vive accanto all'input usa `DraftTextInput`**
(`src/components/ui/`), non `TextInput`. Dal 7 settembre 2026, ed e' il rimedio
a una digitazione che in tutta l'app perdeva caratteri, riportava il cursore a
inizio riga e a tratti rimetteva testo che nessuno stava scrivendo.

Il meccanismo, che vale la pena capire una volta perche' si ripresenta a ogni
campo nuovo: lo stato stava in cima alla schermata, quindi ogni tasto
ridisegnava tutto - la sessione con tutte le sue righe, il modulo di una scheda
con tutti i suoi blocchi, i sei campi degli obiettivi coi loro suggerimenti -
**prima** di restituire il carattere al campo. Se quel giro non chiude entro il
fotogramma, RN si ritrova il `value` indietro rispetto al testo nativo e
riscrive il campo con quello vecchio; Android, riscrivendolo, riporta il cursore
all'inizio. `DraftTextInput` tiene il testo digitato accanto a se' e al
chiamante ne manda una copia: il `value` del nativo combacia sempre, e non c'e'
niente da riscrivere per quanto lenta sia la schermata sopra.

Si riallinea comunque a un valore che **non** viene da lui - una scheda generata
dall'IA che arriva a modulo aperto, un foglio che si svuota alla chiusura - e a
distinguerlo da un'eco in ritardo serve la coda di quel che ha consegnato: il
confronto col solo ultimo valore non regge, e i test in
`DraftTextInput.test.tsx` enunciano i quattro casi. **Un chiamante che
trasforma il valore prima di rimandarlo indietro non puo' usarlo**, perche'
ogni sua eco sembrerebbe un valore esterno: quello e' il mestiere di
`DfNumberInput`, che resta controllato.

Restano `TextInput` nudo i campi il cui stato e' gia' accanto a loro e serve a
disegnare la finestra stessa (`QuantityPrompt`, `MetricEntrySheet`) e la
`SearchBar`, che ridisegna solo se stessa - non a caso era l'unico campo
dell'app che si scriveva bene.

**`DfNumberInput` non scrive il separatore di migliaia.** Lo faceva, e al tasto
dopo rileggeva quel punto come separatore decimale, perche' la virgola non
c'era: la quinta cifra di 10005 mandava il campo a "1,00", e cancellare una
cifra da 2000 lo mandava a 2. Un numero corrotto, salvato senza un segno a
schermo. Un separatore che non scriviamo noi non c'e' da interpretare, e i
numeri di quest'app arrivano a quattro cifre.

**Correttore e compilazione automatica sono spenti di serie** in
`ui/TextInput`, e il rapporto e' rovesciato rispetto a quel che RN presume: qui
quasi tutto quel che si scrive e' un nome o un numero, e su un nome il
correttore di Android fa danni ("lat machine" diventa "la machine") mentre
l'autofill di Google propone quel che ha salvato altrove. Le eccezioni passano
props esplicite: `autoCorrect` sui campi di prosa (note della ricetta, bio,
istruzioni di un esercizio, note per il piano, assistente) e `autoComplete` in
`AccountForm`, dove i gestori di password devono funzionare.

**`useWatch` ridisegna chi lo chiama a ogni tasto**, quindi non sta in un
componente che contiene dei campi: in `NutrientFields` stava accanto agli otto
valori nutrizionali e li ridisegnava tutti mentre se ne scriveva uno. Ora
l'avviso sulle kcal ricalcolate e' un componente a se' (`KcalFromMacros`).

### L'icona

Una goccia bianca con una foglia verde su `#18181b`, dall'8 settembre 2026.
Non e' un file da ritoccare a mano: si rigenera con
`python3 scripts/genera-icone.py`, che disegna il segno **una volta**, lo
ritaglia al contenuto e lo scala in tutte le misure. Modificarne uno solo a
mano fa divergere le sei immagini alla prima occasione.

**Prima era una K bianca con un punto verde**, e i due difetti che l'hanno
mandata via si vedevano solo alla misura giusta: a 48 px il punto diventava un
quadratino di tre pixel, e una lettera sola non distingue l'icona da qualunque
altra app con un'iniziale sopra. Le forme si scelgono guardandole rimpicciolite
davvero, non a schermo intero.

Due vincoli, ed e' il motivo per cui il provino ha quattro colonne:

- **Su Android l'icona e' a due strati** e il sistema ci ritaglia sopra la forma
  che vuole (cerchio, squircle, goccia): nel primo piano il segno sta al 46% e
  non al 62%, perche' quel che esce dal 66% centrale la maschera se lo mangia.
- **Lo stacco fra goccia e foglia e' un buco nell'alfa, non una riga scura.**
  Primo piano e monocromatica sono trasparenti: li' un vuoto dipinto di nero
  sarebbe una macchia nera. Ed e' quel vuoto - e nient'altro - a tenere separate
  le due forme nella **monocromatica** dei temi Material You, dove il colore lo
  decide Android e ne resta uno solo. Con lo stacco troppo stretto le due forme
  si fondono in una macchia, e a schermo intero e a colori non si nota.

Chi cambia la composizione riguarda tutte e quattro le prove, non solo il
quadrato: le due che bocciano sono la terza e la quarta.

### Convenzioni non negoziabili

Valgono le guide Dieffetech `docs/react-native/`:

- `TouchableOpacity` con `activeOpacity={0.6}`, mai `Pressable` con
  style-as-function (con NativeWind v4 non viene applicato: nessun feedback al
  tap). `hitSlop={8}` sui target piccoli.
- Token da `@/src/styles`, mai hex o numeri magici inline.
- **Un elenco di righe e' un `ListGroup`, non N `Card`** (vedi § I tre livelli
  di superficie), e in una schermata c'e' **al massimo un `HeroPanel`**. La
  `Card` e' per quel che e' davvero una scheda a se', non per incorniciare una
  riga. Una lista lunga e virtualizzata resta `FlatList` con righe nude e
  separatore a filo di capello.
- **L'etichetta di un campo e' `FieldLabel` (14/500 in tondo), non
  `SectionLabel`** (12/700 maiuscolo): sono due cose diverse e per un anno si
  sono somigliate.
- **Poche opzioni fisse sono un `Segmented`, non dei chip che scorrono.** In un
  selettore il punto e' vedere le alternative, e una riga che scorre le taglia a
  meta' parola ("Dropset" -> "Drops"). I chip restano per i filtri, dove le voci
  sono tante e non si conoscono in anticipo.
- Elementi assoluti, overlay e bottoni flottanti ancorati con
  `useSafeAreaInsets()`.
- Ogni testo visibile via `t("chiave")`, chiavi in `src/i18n/locales/it.json`
  e `en.json` (vedi § Lingua).
- **Un'etichetta di gruppo muscolare o di attrezzatura viene dallo store, non
  da `t()`.** Sono tassonomie dinamiche (§ Il catalogo comune, dal telefono):
  un amministratore ne aggiunge una dal pannello senza un rilascio dell'app, e
  una chiave i18n fissa non la vedrebbe mai. Chiunque aggiunga un punto che
  disegna una di queste etichette si faccia la stessa domanda di
  `listAvailableEquipment`/`listUsableEquipment`: sto offrendo una scelta o sto
  disegnando quel che c'e' gia'?
- **Un campo con errore di validazione prende il bordo rosso, mai un testo
  sotto il campo.** Il messaggio va nel toast unico che `DfForm` mostra al
  fallimento della validazione (`handleInvalid`); i componenti `form/` non
  renderizzano piu' `error.message`. Gli errori del server seguono la stessa
  regola - vanno nel toast, mai sotto un campo - ed e' per questo che il
  server riassume gia' i suoi in una frase sola (vedi `backend/README.md`
  § Localizzazione dei messaggi).
- Icona e testo sulla stessa riga stanno allineati in altezza: il padding del
  font lo togliono gia' `Text` e `TextInput` di `ui/` (vedi § Styling), quindi
  non si aggiunge `includeFontPadding` nelle schermate.
- **Un campo di testo il cui stato non vive accanto all'input e'
  `DraftTextInput`, non `TextInput`** (vedi § Quel che si digita): col `value`
  che torna dall'alto la digitazione perde caratteri e il cursore salta a
  inizio riga.
- Animazioni con `react-native-reanimated`; il suo plugin babel resta l'ultimo.
- TypeScript strict, mai `any`.
- Logging solo via `logger`, mai `console.*`.
- **Un foglio o una finestra che si chiude si svuota.** Riaprire non deve
  mostrare la ricerca di prima, la linguetta di prima o il testo che si stava
  scrivendo: lo stato locale va riportato ai valori di partenza. Il posto e'
  `onDismiss` per i fogli gorhom (scatta a animazione finita, quindi lo
  svuotamento non si vede) e un effetto su `!isOpen` per quelli su `DfAlert`
  (dalla finestra si esce anche toccando fuori o confermando, non solo dal
  bottone). Un foglio che si **riempie** da una prop - `editing`, `initialValue`
  - alla chiusura torna a quella prop e non al vuoto: `editing` immutato non
  fa ripartire l'effetto di riempimento, e riaprendo la stessa voce da
  correggere il modulo si presenterebbe vuoto.
- **Un overlay aperto consuma il back di Android.** `DfBottomSheet` intercetta
  `hardwareBackPress` finche' e' aperto e ritorna `true`: senza, l'evento gli
  passa attraverso e arriva a react-navigation, che fa il pop della schermata
  **dietro** - lo sfondo si muove e il foglio resta li'. La prop
  `onAndroidBack` serve ai fogli con sotto-viste, per tornare indietro dentro
  prima di chiudere.
- **Il riparo dalla tastiera lo fa `KeyboardAvoidingView`, non `adjustResize`.**
  Il manifest ha `windowSoftInputMode="adjustResize"`, ma da Expo 55
  l'edge-to-edge e' obbligatorio (`edgeToEdgeEnabled=true`, targetSdk 36) e
  Android non restringe piu' la finestra: dichiara la tastiera come inset e
  basta. Quindi `behavior` va passato **su entrambe le piattaforme** - un
  `behavior` assente rende un `View` nudo, cioe' nessun riparo. Era
  `Platform.OS === "ios" ? "padding" : undefined` in `FormScreen` (la shell di
  ogni form e di ogni pagina di Impostazioni) e in `AssistantOverlay`, ed e' il
  motivo per cui la tastiera copriva i campi dell'onboarding.
  Due corollari, entrambi provati sull'emulatore:
  - **il riparo deve abbracciare anche l'azione primaria.** In
    `OnboardingShell` il footer e' fratello del corpo scrollabile, quindi il
    `FormScreen` da solo alzava i campi e lasciava "Avanti" sotto la tastiera.
    Il `KeyboardAvoidingView` esterno li tiene insieme, e quello interno di
    `FormScreen` non raddoppia: il fondo del suo riquadro e' gia' sopra la
    tastiera, quindi il suo scarto viene zero da solo.
  - **una finestra centrata non si ripara con `behavior`, si ripara con
    `avoidKeyboard`** (`DfAlert`): la tastiera le tagliava il fondo, cioe'
    Annulla/Conferma - grammi, voce libera, composizione, stima da foto, note
    del piano. Lo spazio che `avoidKeyboard` mette sotto al contenuto la fa
    salire di meta' tastiera in un contenitore centrato; il `maxHeight` va
    calcolato sullo spazio che resta, o una finestra `size="lg"` salendo
    finisce sotto la status bar.
- **Una `ScrollView` annidata in un foglio gorhom dev'essere quella di
  `react-native-gesture-handler`.** Quella di react-native non riceve i gesti
  dentro un `BottomSheetScrollView`: resta ferma e sembra un contenuto che non
  scorre.

## AI

Tutte le capability passano da **Google Gemini** (Google AI Studio), con un
modello unico: **`gemini-3.5-flash-lite`** per la trascrizione audio
multimodale, la comprensione e il function calling dell'assistente (vocale e
testuale) e la stima nutrizionale da foto ed etichette (vision + JSON object
mode). `expo-speech` per le risposte parlate, on-device.

I model id stanno in **un punto solo** (`src/ai/config.ts`), e non e' una
comodita': un modello e' stato ritirato e l'app ha continuato a chiamarlo per
sei settimane senza che nessuno lo notasse. **Un model id non
provato e' un'ipotesi**, e si prova da **Impostazioni > Diagnostica**, che
chiede al servizio l'elenco di quel che sta ancora servendo a questa chiave.

Il perche' di *quel* modello - quota, latenza e lo scarto di qualita' che si
accetta in cambio - sta nel commento sopra `MODELS`, misurato invece che
supposto.

La chiave sta in `.env` come `EXPO_PUBLIC_GEMINI_API_KEY`, quindi **nel bundle**:
e' una scelta, non una dimenticanza. Cosi' l'AI e' attiva al primo avvio senza
configurazione e a costo zero, e l'APK non si distribuisce.

**Ce n'e' una sola** (`aiKey()`). C'e' stata anche una chiave personale, messa
dall'utente da Impostazioni e con la precedenza su quella dell'app: e' stata
tolta il 3 settembre 2026 perche' al rilascio pubblico si paga a consumo e non
c'e' piu' una quota da scavalcare. Con lei sono spariti `aiKeyStore`, il campo
in Impostazioni e la pagina che lo conteneva.

**Dal 9 settembre 2026 l'app legge `users.ai_enabled`, ed e' un cartello e non
una serratura** - la stessa distinzione di sopra, letta al contrario. Il
pannello puo' spegnere l'AI per un utente (`GET /api/me` la manda gia' dalla
Fase 1 del gestionale), e ogni punto d'ingresso resta **visibile e toccabile
come sempre**: senza il diritto il tocco naviga alla pagina dei piani
(`useAiGate`/`useAiScreenGate`, `src/hooks/useAiGate.ts`) invece di eseguire
l'azione. Senza account l'AI e' spenta - stesso cartello, stesso motivo.
Questo NON e' un controllo di accesso: la chiave Gemini sta nel bundle e l'app
la chiama diretta, quindi si aggira ripacchettizzando l'APK. E' UX e
preparazione al giorno in cui le chiamate passeranno dal backend (§ La quota
qui sotto e `TODO.md` § 3.1): quel giorno il controllo vero sara' una riga nel
proxy, non qui.

L'ultimo valore noto di `aiEnabled` si persiste in `LOCAL_ONLY_SETTINGS`
(`accountStore.ts`), perche' `profile` non e' persistito e offline sarebbe
`null`: senza quel valore un utente con diritto, in palestra senza campo,
vedrebbe negata un'AI per cui paga - il difetto esatto che la regola
local-first di questo repo esiste per impedire.

### La quota, che e' il vincolo vero

**Non sono 1.500 richieste al giorno.** Questo documento lo ha scritto fino al
2 settembre 2026 ed era falso: quel numero e' il tetto globale di un'altra
epoca. Il limite reale e'
`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, un tetto giornaliero **per
modello**, e su `gemini-3.6-flash` vale **venti**. Non e' pubblicato da nessuna
parte - la pagina dei rate limit rimanda ad AI Studio - e si legge solo nel
corpo di un 429, sotto `details[].violations[].quotaValue`.

Venti non sono venti frasi. **Una frase detta all'assistente costa da due a sei
richieste**: una di trascrizione, da uno a `MAX_TOOL_ROUNDS` giri di tool loop,
e una stima per ogni alimento che `resolveFood` non riconosce. Chi conta le
richieste come se fossero interazioni sbaglia di un fattore sei.

Due conseguenze pratiche:

- **La quota e' per modello, quindi le tre voci di `MODELS` sono una leva.**
  Puntate a modelli diversi i budget si sommano invece di dividersi. Oggi
  puntano tutte allo stesso perche' il suo tetto basta; se un giorno non
  bastasse, si separano prima di pensare a pagare.
- **Un 429 non e' un guasto dell'app** e va letto come tale in
  **Impostazioni > Diagnostica**. Il tetto si azzera a mezzanotte del Pacifico,
  non a mezzanotte qui.

**La cache non aiuta su questo.** Una richiesta cachata costa meno ma **conta
come una richiesta**: il § Il prezzo del prompt dell'assistente parla di
un'altra grandezza, e serve da quando si paga. L'unica leva sul tetto e'
togliere richieste - `TODO.md` § 4.2 e § 4.3 - oppure separare le tre voci di
`MODELS` su modelli diversi, che somma i budget invece di dividerli.

**Quella scelta ha una data di scadenza, ed e' l'unica condizione che la
regge.** Il rilascio pubblico con le funzioni AI a pagamento e' in programma
(§ Cos'e' KalTrack), e una chiave dentro un APK distribuito si estrae in pochi
minuti: a consumo, verrebbe usata sul conto di chi pubblica. Quindi **prima del
rilascio le chiamate AI passano dal backend**, che tiene la chiave, verifica il
diritto dell'utente e chiama Gemini. Due conseguenze per chi lavora sul codice
oggi:

- **niente logica di prezzo o di diritto lato client.** Disattivare il
  microfono nell'app e' un cartello, non una serratura: si aggira
  ripacchettizzando l'APK. Il controllo vive dove vive la chiave, cioe' sul
  server.
- **una chiave sola, quella del proxy.** Non c'e' una via d'uscita lato utente
  da mantenere: chi usa l'app usa la chiave del server.

Il piano completo, con quel che manca lato server, sta in `TODO.md` § 3.

Non va salvata in `settings`: quella tabella si sincronizza, e la chiave
finirebbe sul server in chiaro dentro `sync_records`. E non va nella URL: vedi
§ La diagnostica.

### I due endpoint

1. **OpenAI-compatible** (`.../v1beta/openai`) per chat, tool calling e vision
   con JSON strutturato. La chiave viaggia in `Authorization: Bearer`.
2. **Nativo multimodale** (`.../v1beta`) per la trascrizione audio via base64,
   con `mimeType: "audio/m4a"`. La chiave viaggia in `x-goog-api-key`.

### Il prezzo del prompt dell'assistente

**Questa sezione e' tarata su `gemini-3.6-flash`, che non e' il modello che
l'app usa.** Non e' un residuo da cancellare: e' il lavoro da riprendere
quando l'AI passera' dietro il backend e si comincera' a pagare (`TODO.md`
§ 3.1), perche' e' allora che il costo per token conta. Oggi, sul Free Tier,
conta il numero di richieste e non il loro prezzo - vedi § La quota.

Cosa cambia su `gemini-3.5-flash-lite`: **il provider non dichiara i token
cachati.** `prompt_tokens_details` e' assente sull'endpoint OpenAI e
`cachedContentTokenCount` su quello nativo, misurato il 2 settembre 2026 con
8.095 token di prefisso ripetuto a un secondo di distanza. Quindi la
percentuale in Diagnostica dira' **"non dichiarata"**, che e' il caso previsto
dalla colonna nullable e non un difetto. Se la cache scatti comunque non si sa
e dall'API non si puo' sapere; la documentazione di Google elenca la soglia dei
4.096 token per 3.5-flash, 3.6-flash e 3.7-flash e **flash-lite non lo elenca
affatto**.

**La struttura del prefisso resta come e'**, e non per inerzia: non costa
niente tenerla, il modello legge gli stessi id in qualunque ordine, e il giorno
che si torna su un modello `-flash` funziona di nuovo senza rifare il lavoro.
Chi la smonta la deve rifare.

Quel che segue vale quindi per un modello `-flash`.

Gemini sconta di **dieci volte** i token del prefisso comune fra due richieste
($0,075 contro $0,75 per milione su `gemini-3.6-flash`), ma solo **oltre i
4.096 token**: sotto quella soglia la cache non scatta affatto, e non lo dice.

Il prefisso dell'assistente e' costruito di proposito per starci sopra, in
questo ordine:

1. `buildSystemPrompt()` - regole, nessun dato (~500 token);
2. le dichiarazioni dei tredici tool (~3.400 token);
3. `buildCatalogMessage()` - tipi di pasto, ricette, alimenti, esercizi,
   schede: quel che non cambia da una frase all'altra (qualche centinaio).

Solo dopo vengono `buildStateMessage()` (ora, obiettivi, voci del diario) e la
frase dell'utente. **Un dato volatile spostato piu' in su butta via tutto quel
che segue**, e i primi due punti da soli fanno ~3.900 token, cioe' appena sotto
la soglia: e' il catalogo a portarla sopra. Per la stessa ragione
`namedList` ordina **per id** e non per utilizzi - gli alimenti piu' usati si
riordinano appena si registra un pasto, e un riordino e' un prefisso diverso.

Due conseguenze controintuitive:

- **accorciare le description dei tool e' un cattivo affare.** Sono nel
  prefisso, dove costano un decimo, e tagliarle rischia di riportare il totale
  sotto i 4.096 - cioe' di far pagare prezzo pieno a quel che resta.
- **la stima da foto non e' cacheabile** e non c'e' niente da fare: il suo
  prefisso e' un prompt di 1.700 caratteri, mille token abbondanti sotto la
  soglia.

Una cache che nessuno misura e' un'ipotesi, esattamente come un model id non
provato: `ai_calls.cached_tokens` (migrazione 15) registra quanto ha dichiarato
il provider, e **Impostazioni > Diagnostica** ne mostra la percentuale sugli
ultimi sette giorni. `null` in quella colonna vuol dire "non dichiarato" - la
trascrizione passa dall'endpoint nativo, che non riporta i token - e non "zero
colpi": i due casi non vanno confusi, o una percentuale a zero significherebbe
due cose diverse.

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
  registro si condivide come file ed e' dentro il backup. Copriva le forme di un
  provider precedente (`gsk_`/`sk_` e `Bearer`) e dal passaggio a Gemini non
  nascondeva piu' niente - una chiave `AIza...` o `AQ....` passava intera. Ora
  ci sono anche quelle due forme e `?key=` in una URL; i prefissi vecchi restano
  per i registri scritti allora, che sono ancora nel database. Chi cambia
  provider aggiunge la forma nuova qui, prima di committare.

Per lo stesso motivo la chiave dell'endpoint nativo va nell'header
`x-goog-api-key` e non in `?key=`: un errore di rete si porta dietro la URL, e
quel testo finisce in `app_logs`.

Il collegamento passa da `setLogSink`, installato da `initDatabase()`, e non da
un import: `src/db` importa gia' `logger`, il verso opposto sarebbe un ciclo.

`clearLogs` usa un `DELETE` vero, ed e' l'eccezione consentita alla regola "mai
`DELETE FROM`": quella protegge le tabelle che si sincronizzano, dove una riga
tolta risorge al giro dopo. `app_logs` non viaggia, e nemmeno `ai_calls`.

Svuota **anche le chiamate AI non riuscite**, perche' in Diagnostica i due
elenchi stanno sotto lo stesso pulsante e uno svuotamento che ne lasciasse uno
sembrerebbe non aver fatto niente. **Le riuscite restano**: sono il conteggio
dei consumi degli ultimi sette giorni, non un guasto.

### Come si legge, dal 7 settembre 2026

Tre difetti resi evidenti dal blocco della sincronizzazione del 6 settembre,
che aveva scritto ventinove righe identiche e una schermata inservibile.

**I guasti uguali si contano, non si elencano** (`groupLogs` in
`src/domain/logs.ts`). Un gruppo porta `×N` e da quando si ripete. Si raggruppa
su tutto l'elenco e non solo sulle righe adiacenti: un guasto che torna ogni
quarto d'ora ha in mezzo tutto il resto, e i vicini non basterebbero a unirne
due. Il dettaglio tenuto e' quello dell'**ultima** volta, perche' descrive lo
stato in cui l'app si trova adesso; il file di `shareLogReport` continua a
portarli tutti.

**Un guasto di rete si scrive una volta sola.** `apiRequest` registra gia'
metodo, percorso e messaggio del server; il `catch` di chi l'aveva chiamata
aggiungeva "e' fallito", e ogni errore compariva in coppia - `[api] post
/sync: ...` seguito da `[sync] giro non riuscito`. Chi non ha niente da
aggiungere oltre al percorso passa da `alreadyLogged(error)` e sta zitto.
**Chi cattura anche errori che `apiRequest` non ha visto continua a
scriverli**, ed e' il motivo per cui la guardia e' una domanda e non una
rimozione: `photoSync` per esempio nomina il file, che nel percorso non c'e'.

`ApiError` e `alreadyLogged` stanno in `src/api/errors.ts` e non in
`client.ts`: quel modulo i test lo sostituiscono con `jest.mock` per non
parlare davvero con la rete, e quel che sta dentro sparisce con lui.
`client.ts` li ri-esporta, cosi' chi li importava non cambia.

**L'errore di una chiamata AI e' il dettaglio, non il titolo.** Era il titolo,
troncato a due righe, con `dettaglio` a `null` - quindi la riga non si apriva
nemmeno, e il corpo della risposta del provider restava illeggibile. Ora il
titolo e' la capacita' e il dettaglio e' l'errore intero. Le sette capacita'
di `AiCapability` hanno tutte la loro etichetta: ne mancavano quattro, e per
quelle si leggeva la chiave grezza.
