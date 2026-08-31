# Handoff - 31 agosto 2026 (fine giornata)

Punto della situazione per riprendere lo sviluppo da una sessione nuova. Non
sostituisce `CLAUDE.md`, che resta il documento delle convenzioni: qui c'e' lo
**stato**, non le regole.

## In una riga

L'app e' completa e in uso (Fasi 1-5). Sul telefono c'e' la **1.0.2**,
costruita e installata il 31 agosto: contiene tutto quel che segue.

Il codice non ha niente di aperto. Il **backend si', ed e' l'unica cosa che
resta**: una migrazione che toglie `share_window_days` e' scritta, testata e
non deployata, quindi finche' non parte il server continua a tagliare la
condivisione a sette giorni mentre l'app pubblica tutto lo storico.

## Stato

| | |
|---|---|
| Test app | 935 su 58 suite |
| Test backend | 123 |
| Typecheck / lint | puliti, 0 errori (8 warning, tutti anteriori) |
| Ramo | `main`. Si committa sempre qui, mai su un ramo a parte |
| Server | `kaltrack.martin-trajkovski.it`, healthy, 16 migrazioni applicate. **NON allineato al codice**: manca `2026_08_31_120000_drop_share_window_from_users` |
| APK | `kaltrack-1.0.2.apk`, firmato, **installato sul telefono**. `./scripts/build-apk.sh 1.0.3` per il prossimo |

## Cosa gira dove

- **App**: React Native + Expo, development build. `npm start` per metro,
  `npx expo run:android` per ricostruire il nativo. L'emulatore usato e'
  `Medium_Phone_API_36.1`.
- **Backend**: Docker su `188.245.201.81`, cartella `/srv/apps/KalTrack`,
  container `kaltrack-api`, dietro l'nginx del server con certificato.
  Procedura di deploy in `backend/README.md` § In produzione.
- **Database**: SQLite in WAL su un volume Docker montato in `/data`. Backup
  ogni notte alle 3:30 in `/srv/backups/kaltrack`, ne tiene quattordici.

## Account

Sul server c'e' **un solo utente**: `GeneralKoski`
(`mtrajkovski1@outlook.com`), amministratore.

**La password e' stata cambiata in `KalTrack2026` il 31 agosto**, per poter
provare il modulo di accesso: serviva uscire, e senza una password nota non si
rientrava. Va cambiata. Si fa da Impostazioni > Reimposta password, oppure con
`php artisan tinker` sul server assegnando `$u->password = '...'` (il cast
`hashed` fa l'hash da solo - **non** scrivere un hash a mano nella colonna).

Reimpostare la password **disconnette da tutti i dispositivi**, telefono
compreso: dopo, l'app chiede di rientrare.

## Il lavoro aperto

**1. Deployare il backend.** E' l'unica cosa che tiene il server disallineato
dal codice. La migrazione `2026_08_31_120000_drop_share_window_from_users`
toglie una colonna in **produzione**: si prende il backup con `VACUUM INTO`
prima (vedi § Il deploy del 31 agosto), poi `rsync` + `php artisan migrate`
come da `backend/README.md`.

Finche' non parte, l'app manda tutto lo storico e il server lo taglia lo
stesso a sette giorni: `forgetOutsideWindow` cancella i giorni fuori finestra a
ogni salvataggio del profilo, e profilo e confronto continuano a servirne
sette. Non si rompe niente, semplicemente quella modifica non si vede.

**2. Provare sul telefono quel che l'emulatore non puo' dire.** Due cose:

- **La palla dell'assistente che si muove con la voce.** Il microfono virtuale
  dell'emulatore riporta `0.000` fisso, anche riavviandolo con
  `-allow-host-audio` (macOS deve autorizzare il microfono al processo
  dell'emulatore da una finestra di sistema). Il collegamento e' verificato -
  il livello arriva a schermo - ma la reazione al volume no.
- **Le tre funzioni AI contro Groq**: assistente, lettura etichette, stima da
  foto. I due model id nuovi sono presi dalla tabella dei ritiri e mai provati
  davvero. Se sbagliano, il motivo si legge in **Impostazioni > Diagnostica**
  invece di sparire.

**3. Provare il confronto con dati veri.** Non e' mai stato visto rispondere:
sul server c'e' **un solo utente**, quindi non c'e' nessuno da mettere accanto.
Serve un secondo account. Passa i test, ma la lezione di questo progetto e' che
i difetti seri escono aprendo l'app, non dalla suite.

**4. Ripulire l'emulatore.** Ci sono dati di prova: obiettivo 2000 kcal,
10.000 passi, un esercizio `Pancainc test` gia' cancellato, e il tema forzato
su "Scuro". **La chiave Groq sull'emulatore e' stata tolta** durante le prove e
va rimessa se ci si vuole riprovare l'AI; quella del telefono non e' stata
toccata (vive in SecureStore e l'aggiornamento non la sfiora).

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
  giorno scritto (`earliestRecordedDate`) a oggi. **La migrazione non e'
  deployata**, vedi § Il lavoro aperto.
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

## Il deploy del 31 agosto

Le sei migrazioni nuove sono in produzione (batch 5, sedici applicate in
tutto), il container e' healthy e le rotte nuove rispondono 401 invece di 404.

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
  9.2 della spec.

## Quel che serve sapere e non si deduce dal codice

1. **Il telefono e' la fonte di verita'.** Il server tiene una copia. L'app
   funziona senza rete e senza account, e va tenuta cosi'.
2. **La chiave Groq la porta l'utente**, sta in SecureStore e non e' nel bundle.
   Senza, le funzioni AI sono spente e non e' un difetto.
3. **Non salvare mai niente di segreto in `settings`**: e' una tabella
   sincronizzata, finirebbe sul server in chiaro.
4. **Mai `DELETE FROM` su una tabella sincronizzata.** Le quattro regole della
   sincronizzazione sono in `CLAUDE.md`, ognuna e' costata un difetto.
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
