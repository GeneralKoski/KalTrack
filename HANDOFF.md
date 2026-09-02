# Handoff - 2 settembre 2026

Punto della situazione per riprendere lo sviluppo da una sessione nuova. Non
sostituisce `CLAUDE.md`, che resta il documento delle convenzioni: qui c'e' lo
**stato**, non le regole. Le sezioni datate piu' in basso sono il registro di
quel che e' stato chiuso, in ordine inverso.

## In una riga

L'app e' completa e in uso (Fasi 1-5). Sul telefono c'e' la **1.0.3**. Il 2
settembre e' stato fatto un check completo del progetto, e ne sono usciti sei
difetti che i test non vedevano perche' vivono tutti sul bordo: le notifiche di
sistema, i file fra due dispositivi, e la distanza fra quel che i documenti
raccontavano e quel che il codice faceva.

**Tutti chiusi, ma nessuno provato sul telefono.** Serve una build nuova.

## Stato

| | |
|---|---|
| Test app | 973 su 60 suite |
| Test backend | 125 |
| Typecheck | pulito |
| Lint | 0 errori, 11 warning - **10 sono in `components/ui/`, generati dal CLI di gluestack**, e uno e' un falso positivo su axios. Nel codice nostro non ce n'e' piu' nessuno |
| expo-doctor | 18 su 20. Uno e' `react-native-web` mancante, rosso di proposito (§ Architettura in `CLAUDE.md`); l'altro sono 17 pacchetti fuori versione |
| Ramo | `main`. Si committa sempre qui, mai su un ramo a parte |
| Server | `kaltrack.martin-trajkovski.it`, 17 migrazioni applicate. **Il codice backend e' avanti di un commit**: vedi § Il lavoro aperto |
| Schema locale | 14 migrazioni (la 014 aggiunge gli indici su `updated_at`) |
| APK | `kaltrack-1.0.3.apk` sul telefono, **anteriore alle correzioni del 2 settembre**. `./scripts/build-apk.sh 1.0.4` per il prossimo |

## Cosa gira dove

- **App**: React Native + Expo, development build. `npm start` per metro,
  `npx expo run:android` per ricostruire il nativo. L'emulatore usato e'
  `Medium_Phone_API_36.1`.
- **Backend**: Docker su `188.245.201.81`, cartella `/srv/apps/KalTrack`,
  container `kaltrack-api`, dietro l'nginx del server con certificato.
  Procedura di deploy in `backend/README.md` § In produzione.
- **Database**: SQLite in WAL su un volume Docker montato in `/data`. Backup
  ogni notte alle 3:30 in `/srv/backups/kaltrack`, ne tiene quattordici.
- **AI**: Google Gemini, `gemini-3.6-flash` per tutte e tre le capability.
  Verificato contro il servizio il 2 settembre su entrambi gli endpoint.

## Account

Sul server c'e' **un solo utente**: `GeneralKoski`
(`mtrajkovski1@outlook.com`), amministratore.

**La password e' stata cambiata in `KalTrack2026` il 31 agosto**, per poter
provare il modulo di accesso: serviva uscire, e senza una password nota non si
rientrava. **Va cambiata.** Si fa da Impostazioni > Reimposta password, oppure
con `php artisan tinker` sul server assegnando `$u->password = '...'` (il cast
`hashed` fa l'hash da solo - **non** scrivere un hash a mano nella colonna).

Reimpostare la password **disconnette da tutti i dispositivi**, telefono
compreso: dopo, l'app chiede di rientrare.

## Il lavoro aperto

**1. Il backend va deployato.** Il 2 settembre sono cambiati
`ImageController` (nome dei file e controllo del tipo) e `routes/api.php`
(throttle sul reset password). Nessuna migrazione, quindi e' un deploy del
codice e niente piu'. Finche' non si fa, l'app nuova e il server parlano
comunque: le correzioni sono restrizioni lato server, non contratti nuovi.

**2. Serve un APK nuovo, e va provato.** Le sei correzioni del 2 settembre
sono tutte verificate dai test ma nessuna e' stata vista funzionare:

- i promemoria personalizzati (crearne due, cambiare l'orario del primo,
  verificare che il secondo suoni ancora);
- le foto dei progressi su un secondo dispositivo, che ora viaggiano;
- il ridimensionamento, che si vede dal peso dei file in
  `documentDirectory/photos`;
- la trascrizione vocale sul modello nuovo.

**3. Provare il confronto con dati veri.** Non e' mai stato visto rispondere:
sul server c'e' **un solo utente**, quindi non c'e' nessuno da mettere accanto.
Serve un secondo account. Passa i test, ma la lezione di questo progetto e' che
i difetti seri escono aprendo l'app, non dalla suite.

**4. La palla dell'assistente che si muove con la voce.** Il microfono virtuale
dell'emulatore riporta `0.000` fisso, anche riavviandolo con
`-allow-host-audio`. Il collegamento e' verificato - il livello arriva a
schermo - ma la reazione al volume no.

**5. Diciassette pacchetti fuori versione.** Undici `expo-*` e
`react-native` 0.83.4 contro 0.83.10 sono aggiornamenti di patch, da fare
insieme alla prossima build nativa e non prima: costringono a ricostruire. La
coppia da guardare con piu' attenzione e' `jest` 30 con `jest-expo` 57 contro i
~29 e ~55 che l'SDK 55 si aspetta: la suite gira, ma e' esattamente la forma
del guasto dell'`expo-blur` (un pacchetto per SDK 57 su un runtime 55).

### Rimandato per scelta, non dimenticato

- **Un secondo ambiente (test).** Oggi il backend e' **uno solo**: la scelta
  test/prod che `deploy.sh` propone viene dal template Dieffetech e qui non e'
  mai stata configurata (`.env.test` e `.env.prod` non esistono). Le migrazioni
  del 31 agosto sono andate dritte in produzione, con un backup prima ma senza
  una prova a vuoto. Se i dati sul server iniziano a contare, questo e' il
  primo debito da pagare.
- **Il catalogo non ha moderazione.** Chiunque puo' aggiungere voci
  all'elenco di tutti, e ciascuno corregge solo le proprie: non esiste un modo
  per un amministratore di togliere una voce altrui scritta male. Con un utente
  solo non e' un problema; con dieci lo diventa.
- **Il microfono in palestra.** `registry.ts` ha tredici strumenti e tre
  riguardano gli allenamenti, ma `AssistantButton` sta solo su Oggi. La
  premessa con cui era stato messo li' non vale piu': vedi `CLAUDE.md` § Dove
  vive il microfono, che dice anche perche' spostarlo non e' gratis.
- **Nove file usano `expo-file-system/legacy`**, che e' l'API deprecata: foto,
  backup, esportazioni CSV, log e trascrizione. Il giorno che sparisce si
  fermano tutti insieme.
- **`accessibilityLabel` sta in 10 file su 120.** Con 142 tocchi quasi tutti a
  sola icona, TalkBack legge una schermata di pulsanti senza nome. Ultima
  priorita' per un'app personale, ma e' l'unica area senza copertura.

## Il 2 settembre: il check del progetto

Un giro completo su tutto: suite, typecheck, lint, `expo-doctor`, poi lettura a
fondo di sincronizzazione, foto, promemoria, AI e backend. **La suite era verde
prima e dopo**, ed e' il punto: i sei difetti trovati non erano coperti da
nessun test perche' nessuno di essi vive dentro una funzione pura.

1. **Un promemoria personalizzato spegneva tutti gli altri.**
   `scheduledIdsForReminder` recuperava le notifiche orfane anche per `kind`, e
   tutti i promemoria creati a mano hanno `kind = "custom"`. Riprogrammarne uno
   cancellava dal sistema le notifiche degli altri, che a database restavano
   accesi con i loro id: la schermata li mostrava attivi e non arrivava piu'
   niente. Il ripiego sul `kind` ora vale solo per i quattro preset, che sono
   unici per definizione.

2. **Le foto dei progressi non arrivavano sul secondo telefono.**
   `progress_photos` era fuori da `SYNCED_TABLES` con la motivazione che le sue
   righe puntano a file inesistenti sull'altro dispositivo - una motivazione
   caduta da quando `photoSync.ts` porta i byte e `SyncedPhoto` disegna il
   segnaposto. `ProgressPhotosScreen` usava gia' `SyncedPhoto` in tutti e tre i
   punti: il lato ricevente era pronto da settimane. Ora c'e' anche
   `LOCAL_ONLY_TABLES` con il motivo per ciascuna esclusione, e un test che
   confronta i due elenchi con lo schema: e' la quinta regola della
   sincronizzazione.

3. **La chiave Gemini finiva nei log in chiaro.** L'endpoint nativo la
   accettava in `?key=`, e `redactSecrets` copriva `Bearer`, `gsk_` e `sk_` -
   cioe' Groq e OpenAI. Dal passaggio a Gemini **il registro non nascondeva
   piu' niente**: una chiave `AIza...` o `AQ....` passava intera in `app_logs`,
   che si condivide come file ed e' dentro il backup. Due correzioni: la chiave
   e' passata all'header `x-goog-api-key`, e la redazione copre le due forme
   Google piu' `?key=` in una URL.

4. **Le foto grandi si perdevano in silenzio.** I picker scattavano a
   `quality` 0.8 ma nessuno ridimensionava, e il server rifiuta oltre i 5 MB:
   `uploadOne` annotava il rifiuto e andava avanti, lasciando una riga
   sincronizzata la cui immagine non sarebbe arrivata mai. `persistPhoto` ora
   riduce a 1600 px di lato lungo, e se il formato non si sa leggere archivia
   l'originale.

5. **Nessun indice su `updated_at`.** Ventotto indici nello schema e nessuno
   sulla colonna con cui `collectChanges` interroga ventisei tabelle, fino a
   venti giri per sincronizzazione. Migrazione 014, e un test che legge
   l'`EXPLAIN QUERY PLAN` invece di fidarsi.

6. **`expo-asset` non era dichiarato**, pur essendo peer dependency di
   `expo-audio`. C'era per transitivita', quindi non si vedeva niente - ma e'
   la stessa classe di guasto dell'`expo-blur` del 1 settembre.

Sul server, tre spigoli minori: il regex dei nomi foto ammetteva `.` e `..`
(nessuna traversata vera, ma un nome deve nominare un file), l'upload non
controllava il tipo del file, e `admin/users/{user}/password` non aveva
throttle mentre `login` e `register` ce l'avevano.

**La deriva dei documenti era la voce piu' grande.** `CLAUDE.md` dichiarava
`gemini-3.6-flash` mentre il codice usava `gemini-3.5-flash-lite`; diceva
"sette strumenti e nessuno riguarda gli allenamenti" quando sono tredici e tre
sono di palestra - e quella frase era l'argomento con cui il microfono sta solo
su Oggi; dava `minSdkVersion` 24 invece di 26; prometteva che
`progress_photos.uri` viaggiasse. La sezione § La diagnostica era **troncata a
meta' frase**, con un elenco che aveva perso il proprio primo punto. Il
commento di `aiKeyStore` spiegava che la chiave nel bundle era il problema e
che "sparisce", mentre e' tornata nel bundle per scelta dichiarata. Tutto
allineato, e gli alias `hasGroqKey`/`groqKey`/`GROQ_BASE_URL` sono stati tolti
invece di essere lasciati a tenere in vita il nome vecchio.

**I due model id sono stati provati contro il servizio**, per la prima volta:
`gemini-3.6-flash` e `gemini-3.5-flash-lite` esistono entrambi, e il primo
regge la trascrizione di un m4a sull'endpoint nativo e la lettura di
un'etichetta in `json_object` su quello OpenAI-compatible. Il codice e' stato
portato su `gemini-3.6-flash`, come il documento diceva da sempre. Esiste anche
`gemini-3.7-flash`, non provato.

## Chiuso il 30-31 agosto 2026

**Confronto con piu' persone e confronto in palestra**, secondo
`docs/superpowers/plans/2026-08-30-confronto-multiplo-e-palestra.md`, con le
decisioni di privacy prese esplicitamente prima di scrivere codice (sezione
"Decisioni prese" nel piano).

Cosa e' cambiato nella promessa dell'app, in tre righe:

- `share_gym`, quinto interruttore, spento di serie e **indipendente** da
  `share_workouts`. Acceso, pubblica quali esercizi si fanno e con che carico.
- `share_window_days`: quanto passato esce lo sceglieva l'utente, sette di
  default. **Tolta il 31 agosto**: si pubblica tutto lo storico. Vedi
  § Il 31 agosto, notte.
- il catalogo degli esercizi (`exercises` sul server) e' comune a **tutti gli
  iscritti**, ed e' la prima eccezione a "solo fra amici accettati". Non
  registra chi ha aggiunto cosa. Si alimenta dalla schermata Esercizi: il "+"
  crea un esercizio e lo propone, l'icona della nuvola importa quelli che qui
  non ci sono. Dal 30 agosto i cataloghi sono **due** - esercizi e alimenti -
  e ogni voce ha un autore: ciascuno corregge o toglie solo le proprie, ma
  `created_by` non esce da nessuna risposta (viaggia `mine`).

Fuori dal piano, negli stessi due giorni:

- **L'anello delle calorie e' diviso per macronutriente** (`macroSlices`,
  `MacroArc`), sia nella home sia nei cerchietti del calendario. Il grigio in
  coda e' la parte che i macro non spiegano, non un quarto macro.
- **La barra della data del diario ha altezza fissa**, va da inizio 2026 a un
  mese avanti e si apre in un calendario mensile con gli anelli dei giorni.
  La griglia e' sempre di sei settimane apposta: un mese ne occupa da quattro a
  sei, e senza un numero fisso il foglio cambiava altezza scorrendo i mesi.
- **L'APK si costruisce e si installa senza Android Studio**
  (`scripts/build-apk.sh` + `scripts/serve-apk.sh`), modellati su
  ZCC-omnia-marine. Solo Android: per iOS servirebbero le API key di App Store
  Connect, che qui non ci sono.
- **L'icona non e' piu' quella di Expo**: una K bianca con un punto verde su
  fondo quasi nero, rigenerabile con `scripts/genera-icone.py`.

## Il 31 agosto, pomeriggio e sera

**La composizione per voce del diario.** Spec e piano in
`docs/superpowers/specs/2026-08-31-composizione-per-voce-design.md` e
`docs/superpowers/plans/2026-08-31-composizione-per-voce.md`, entrambi eseguiti
per intero. Una voce da ricetta porta la propria copia degli ingredienti in una
colonna JSON: si modificano le grammature, si toglie il cotto e si mette il
salame, e la ricetta non si tocca. Le regole sono in `CLAUDE.md`.

Ha chiuso un difetto che nessuno aveva notato: cambiare le porzioni di una voce
da ricetta **rileggeva la ricetta viva**, quindi modificare una ricetta e poi
toccare le porzioni di una voce di due settimane prima la aggiornava ai valori
nuovi. Contro la promessa che una riga di diario e' una fotografia.

**La stima del pasto da una foto**, che era implementata dalla Fase 1 e
raggiungibile da nessuna parte - ed e' il motivo per cui il ritiro del suo
modello e' passato inosservato per sei settimane.

**Le porzioni nel campo quantita'**, che hanno tirato fuori dal cassetto
`serving_label`: cinquanta frasi scritte a mano nei seed, mai mostrate.

**La prova dei modelli AI** in Diagnostica, perche' i due ritiri sono stati
scoperti sbattendoci contro.

### Due sessioni sullo stesso repo

Il lavoro di questa sera e' stato fatto in parallelo a una seconda sessione di
Claude. Quel che ha funzionato, se serve rifarlo:

- **mettere in stage solo percorsi espliciti**, mai `git add -A`: e' l'unica
  cosa che impedisce a un commit di portarsi dentro il lavoro dell'altro;
- **rileggere ogni file prima di modificarlo**, e prendere per buona la versione
  trovata invece di sovrascriverla;
- **committare ogni pezzo subito**, cosi' il proprio lavoro non resta a mollo
  accanto a quello dell'altro;
- **mai `git stash`**: stasha *tutto* il working tree, quindi anche il lavoro in
  corso dell'altra sessione, e fra lo stash e il pop c'e' una finestra in cui
  l'altro puo' scrivere e perdersi il proprio. Usato una volta per una verifica
  di due secondi, e per fortuna l'altro aveva appena committato;
- **il numero della migrazione va dichiarato**: se entrambe ne aggiungono una e
  prendono lo stesso numero, `PRAGMA user_version` ne applica una sola e l'altra
  sparisce **in silenzio**.

`src/i18n/locales/it.json` e' il punto di collisione peggiore, perche' ogni
funzione aggiunge chiavi. Quando conteneva le aggiunte di una sessione e le
rimozioni dell'altra, la via d'uscita e' stata costruire per l'indice il
contenuto desiderato (HEAD piu' le proprie chiavi) e metterlo in stage con
`git update-index --cacheinfo`, lasciando fuori le modifiche dell'altra
sessione. Verificato in entrambe le direzioni prima di committare.

## Il 31 agosto, notte: il primo giro di prove sul telefono

Sedici punti annotati usando l'app, tutti chiusi, **tutti verificati a schermo**
sull'emulatore tranne dove detto. In ordine di quel che raccontano.

**Cose che erano rotte e non si vedevano dal codice**

- **L'"Annulla" grigio su nero in tema scuro.** Non era quel pulsante: era il
  tema **chiaro** che filtrava dentro tutte le modali, perche' gluestack le
  porta dentro `OverlayProvider` e `ThemeProvider` gli stava sotto. Regola e
  spiegazione in `CLAUDE.md` § L'ordine dei provider in `App.tsx`.
- **Il back di Android attraversava i fogli** e faceva il pop della schermata
  dietro: lo sfondo si muoveva e il drawer restava aperto.
- **La striscia dei tipi di pasto non scorreva**: era una `ScrollView` di
  react-native annidata in un foglio gorhom, che gira su gesture-handler.
- **`ExitConfirm` esisteva dal lavoro sulla navigazione e non era mai stato
  montato**: il back sulla schermata iniziale chiudeva l'app di colpo.
- **"Il mio account" restava a girare per sempre** a sessione scaduta. Trovato
  reimpostando la password, che revoca ogni token. Bastava una password
  cambiata da un altro dispositivo.

**Cose che c'erano e dicevano la cosa sbagliata**

- Senza chiave AI le tre funzioni mostravano una riga spenta che diceva cosa
  mancava e non dove metterlo. Ora `AiKeyPrompt` porta dritti al campo, con il
  cursore dentro. La stima da foto lo chiede **prima** di aprire la fotocamera.
- Il nome dei macro stava nel placeholder e veniva tagliato a meta' parola
  ("Carboid"): un placeholder non si puo' accorciare con i tre puntini, e
  infatti ora e' un'etichetta sopra il campo.
- La parola "Chiudi" accanto alla X dei fogli.

**Cose nuove**

- **Il profilo e' un profilo**: avatar, nome, bio e quattro numeri (peso,
  giorni di fila, allenamenti della settimana, media kcal), poi le voci
  raggruppate in Alimentazione / Palestra / Progressi / App, con le
  impostazioni dietro l'ingranaggio. Erano tredici righe identiche.
- **`FoodFacts`**: foto e valori per 100 g di un alimento, compatti nella
  finestra dei grammi e per esteso dietro l'icona info nell'elenco. Il tocco
  sulla riga continua a scegliere.
- **`VoiceOrb`**: la palla che si muove sul volume vero del microfono
  (`metering`, che `useVoiceRecording` esponeva gia' come `level` e nessuno
  leggeva). E' anche il bottone per fermarsi.
- **Il modulo di accesso si comporta da modulo**: invio al campo successivo,
  occhiolino sulla password, password azzerata passando fra accesso e
  registrazione, e la tastiera non copre piu' il campo.

**Due decisioni di prodotto**

- **Si condivide tutto lo storico.** `share_window_days` e' sparita da app e
  server: era un'impostazione in piu' su una domanda che nessuno si pone, e
  intanto tagliava il confronto a una settimana. Il telefono pubblica dal primo
  giorno scritto (`earliestRecordedDate`) a oggi. Deployato in serata, vedi
  § I due deploy del 31 agosto.
- **Il microfono vive solo su Oggi.** L'assistente scrive pasti, passi, peso e
  obiettivi - quel che sta su Oggi - e in palestra non tocca niente. Globale
  seguiva l'utente in dodici schermate dove non poteva far nulla, e in due si
  sedeva sopra un interruttore. Dettagli in `CLAUDE.md` § Dove vive il
  microfono.

**Cosa fa l'assistente, per non doverlo ricostruire**

Sette strumenti in `src/ai/tools/registry.ts`: `add_meal_entries`, `log_steps`,
`log_weight`, `set_target`, `delete_entry` (sempre a conferma manuale),
`query_summary` e `navigate`. Cioe': **cibo, passi, peso, obiettivi**. Non
esiste niente per la palestra, e un alimento dettato che non esiste **non entra
in catalogo** - diventa una voce libera di quel giorno, risolta contro i propri
alimenti, il database locale, OpenFoodFacts e infine una stima AI.

## I due modelli morti (31 agosto)

L'inserimento vocale rispondeva "qualcosa e' andato storto" a ogni tentativo.
La ragione era gia' scritta in `ai_calls`, e non la leggeva nessuno:

```
Groq ha risposto 404: The model `llama-3.3-70b-versatile` does not exist
or you do not have access to it. (model_not_found)
```

Groq l'ha spento il **16 agosto 2026** per i piani free e developer. La
trascrizione era riuscita 75 ms prima, quindi chiave, rete e audio stavano
bene: era morto solo l'assistente.

Controllando la lista dei ritiri e' saltato fuori un **secondo guasto che
nessuno aveva segnalato**: il modello vision, spento il **17 luglio**, cioe'
sei settimane di stima da foto e lettura etichette rotte in silenzio.

Sostituti: `openai/gpt-oss-120b` per l'assistente, `qwen/qwen3.6-27b` per le
foto. Quest'ultimo e' in preview e non e' una scelta: su Groq nient'altro
accetta immagini e JSON object mode insieme.

Da qui vengono `app_logs` e **Impostazioni > Diagnostica**. Il messaggio
generico dell'assistente ora dice dove guardare: "qualcosa e' andato storto,
riprova" e' esattamente cio' che ha lasciato un modello morto in giro per sei
settimane.

## I due deploy del 31 agosto

**Il primo, in mattinata.** Le sei migrazioni nuove sono in produzione (batch
5, sedici applicate in tutto), il container e' healthy e le rotte nuove
rispondono 401 invece di 404.

**Il secondo, in serata**, subito dopo aver installato la 1.0.2:
`2026_08_31_120000_drop_share_window_from_users` (batch 6, diciassette in
tutto). Verificato dopo:

- la colonna `share_window_days` non c'e' piu' in `users`;
- `GET /api/me` non serve piu' `shares.windowDays`, cioe' esattamente la forma
  che l'app si aspetta;
- **niente e' andato perso**: un utente, otto stat condivise, 429 righe in
  `sync_records`;
- `finestraInGiorni` e `forgetOutsideWindow` non esistono piu' nel codice
  servito - restano solo nella vecchia migrazione che creo' la colonna, e li'
  devono restare.

Il backup pre-deploy e' `kaltrack-pre-deploy-2026-08-31-093012.sqlite.gz`.
**Attenzione al passaggio che il primo giro aveva gia' insegnato**:
`php artisan backup:db` scrive DENTRO il volume, e un backup che vive nel
volume che dovrebbe salvare non e' un backup. Va portato fuori con
`docker cp` in `/srv/backups/kaltrack`, come fa
`/usr/local/bin/kaltrack-backup` ogni notte.

Prima di migrare e' stato preso un backup a parte,
`kaltrack-pre-deploy-2026-08-30-223739.sqlite.gz`, con `VACUUM INTO` e non con
una copia del file: il database e' in WAL, e un `cp` avrebbe perso le
transazioni non ancora riversate.

Il deploy passa da `rsync` della cartella `backend/` e **non** da un `git
pull`: quel che gira sul server e' il codice locale al momento del comando, non
quello dell'ultimo push.

## Rimandato di proposito

- **Passi su iOS (HealthKit).** L'innesto e' l'interfaccia `HealthProvider` in
  `src/services/healthConnect.ts`.
- **Verifica email e recupero password automatico.** Al loro posto c'e' il
  reimposta password dell'amministratore.
- **Classifiche fra piu' persone**, e il confronto sulle calorie con un
  vincitore. Fuori scope per scelta, non per mancanza di tempo: vedi la sezione
  9.2 della spec. Il confronto affiancato da due a cinque persone invece **c'e'**,
  dal 30 agosto.

## Quel che serve sapere e non si deduce dal codice

1. **Il telefono e' la fonte di verita'.** Il server tiene una copia. L'app
   funziona senza rete e senza account, e va tenuta cosi'.
2. **La chiave AI e' nel bundle**, e non e' una dimenticanza:
   `EXPO_PUBLIC_GEMINI_API_KEY` in `.env`, cosi' l'AI e' attiva al primo avvio
   a costo zero e l'APK non si distribuisce. Chi vuole la propria la mette da
   Impostazioni (`aiKeyStore`, SecureStore) e ha la precedenza. Vedi
   `CLAUDE.md` § AI.
3. **Non salvare mai niente di segreto in `settings`**: e' una tabella
   sincronizzata, finirebbe sul server in chiaro.
4. **Mai `DELETE FROM` su una tabella sincronizzata.** Le cinque regole della
   sincronizzazione sono in `CLAUDE.md`, ognuna e' costata un difetto. La
   quinta - dichiarare ogni tabella nuova in un elenco o nell'altro - e' del 2
   settembre, ed e' costata le foto dei progressi.
5. Le regole del confronto (`src/domain/comparison.ts`) sono decisioni di
   prodotto con test propri, non logica da rifattorizzare. Da oggi valgono da
   due a cinque persone, e in palestra - a differenza delle calorie - un
   vincitore c'e'.
6. **I cataloghi sono l'unica cosa che esce verso i non amici.** Prima di
   questo lavoro la frase "non esce niente verso chi non e' amico" era vera
   senza eccezioni: ora ce ne sono due - esercizi e alimenti - ed e' scritto in
   `backend/README.md` come eccezione dichiarata.
7. **Una voce del diario e' una fotografia, composizione compresa.** I valori
   sono congelati nella riga, e da oggi anche gli ingredienti: `label` e i
   valori per 100 g sono copiati dentro, non letti dall'alimento. Correggere un
   alimento domani non deve riscrivere il pranzo di ieri, e una voce deve
   sopravvivere alla cancellazione di un suo ingrediente.
8. **Il keystore di firma non e' nel repository e non e' recuperabile.** Sta in
   `credentials/android/kaltrack.keystore` con le password in
   `credentials.json`, entrambi gitignorati. Perderlo vuol dire non poter piu'
   aggiornare un'app gia' installata: Android rifiuta un aggiornamento firmato
   con una chiave diversa, e l'unica via sarebbe disinstallare - portandosi via
   il database, visto che il telefono e' la fonte di verita'. **Va copiato
   fuori da questo computer.**

## Come si verifica una modifica

Il gate e' `npm run typecheck && npm run lint && npm test`, piu'
`php artisan test` nel backend. Ma la lezione di questi due giorni e' un'altra:
**quasi tutti i difetti seri sono usciti aprendo l'app o interrogando il server
vero, non dai test.** Le calorie a zero invece del trattino, la ricerca che non
era stata deployata, le foto rotte sul secondo dispositivo: nessuno di questi
sarebbe emerso da una suite verde.

Il 31 agosto lo ha confermato di nuovo: sedici punti erano stati annotati
usando l'app, e cinque difetti in piu' sono usciti mentre li si verificava a
schermo - fra cui il tema chiaro dentro le modali, che nessun test avrebbe mai
mostrato. **Aprire l'app e guardarla e' un passaggio del lavoro, non un extra.**

Screenshot con `adb exec-out screencap -p > /tmp/x.png`, log con
`adb logcat -d -s ReactNativeJS:V`.

Un colore sospetto si misura invece di indovinarlo: ritagliare la zona dallo
screenshot e contare i pixel dominanti dice *quale* colore e' stato usato, ed e'
cosi' che si e' scoperto che l'"Annulla" era disegnato con l'accent del tema
chiaro.

**Quel che l'emulatore non puo' dire.** Il suo microfono virtuale riporta
silenzio fisso (`level` a `0.000`), anche avviandolo con `-allow-host-audio`:
tutto cio' che reagisce al volume va provato sul telefono. Il fast refresh, poi,
rilascia gli oggetti nativi di `expo-audio` e fa comparire "Cannot use shared
object that was already released": non e' un difetto dell'app, si riavvia
l'applicazione e passa.

Per guardare il database dell'app sull'emulatore senza indovinare:

```bash
adb shell "run-as com.koski.kaltrack cat files/SQLite/kaltrack.db" > /tmp/k.db
adb shell "run-as com.koski.kaltrack cat files/SQLite/kaltrack.db-wal" > /tmp/k.db-wal
sqlite3 /tmp/k.db "SELECT ..."
```

Il file `-wal` va copiato insieme all'altro: senza, si legge un database
vecchio di qualche transazione e si crede a un difetto che non c'e'.
