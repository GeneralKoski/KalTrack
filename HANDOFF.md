# Handoff - 31 agosto 2026 (sera)

Punto della situazione per riprendere lo sviluppo da una sessione nuova. Non
sostituisce `CLAUDE.md`, che resta il documento delle convenzioni: qui c'e' lo
**stato**, non le regole.

## In una riga

L'app e' completa e in uso (Fasi 1-5), con un backend Laravel in produzione
gia' aggiornato all'ultimo lavoro. Non resta niente di aperto sul codice: quel
che manca e' **provarla davvero**, e per una parte serve un secondo account.

Il 31 agosto sono venuti fuori due modelli Groq ritirati che tenevano ferme
tre funzioni AI, e sono nate tre funzioni nuove. **Nessuna delle tre e' mai
stata vista girare**: sul telefono c'e' la 1.0.1, che non le contiene.

## Stato

| | |
|---|---|
| Test app | 935 su 58 suite |
| Test backend | 123 |
| Typecheck / lint | puliti, 0 errori |
| Ramo | `main`. Si committa sempre qui, mai su un ramo a parte |
| Server | `kaltrack.martin-trajkovski.it`, healthy, 16 migrazioni applicate, allineato al codice |
| APK | firmato, `./scripts/build-apk.sh`. Quello sul telefono e' anteriore all'icona **e all'assistente riparato** |

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
(`mtrajkovski1@outlook.com`), amministratore. La password non e' scritta qui: se
serve, si reimposta da Impostazioni > Reimposta password, oppure con
`php artisan tinker` sul server assegnando `$u->password = '...'` (il cast
`hashed` fa l'hash da solo - **non** scrivere un hash a mano nella colonna).

## Il lavoro aperto

Nessuno sul codice. Restano tre cose da fare con le mani, in ordine di peso.

**1. Provare il confronto con dati veri.** Non e' mai stato visto rispondere:
sul server c'e' **un solo utente**, quindi non c'e' nessuno da mettere accanto.
Serve un secondo account per vedere quelle schermate con dei numeri dentro.
Passa i test, ma la lezione di questo progetto e' che i difetti seri escono
aprendo l'app, non dalla suite.

**2. Rifare l'APK e provare le tre funzioni nuove.** E' la cosa piu' urgente,
perche' il gate verde non dice niente su di esse: i test coprono la logica pura
e le query, non la fotocamera, non i fogli a schermo, non il salvataggio vero.

- **La foto in "Voce libera"**: fotografa un piatto e guarda se i piatti
  riconosciuti sono sensati e se correggendo i grammi i valori seguono.
- **Le scorciatoie delle porzioni**: aggiungi uno yogurt e prova 1/2, 1, 2, 3.
  Digitando 180 a mano nessuna deve accendersi.
- **La composizione di una voce da ricetta**: aggiungi una ricetta, apri la
  freccia, cambia una grammatura, togli un ingrediente, aggiungine uno che non
  esiste creandolo da li', e salva la variante come ricetta nuova. Controlla
  che la **ricetta originale non sia cambiata**: e' la promessa piu' facile da
  rompere di tutta la funzione.

```bash
./scripts/build-apk.sh 1.0.1     # 1.0.0 e' quello gia' installato
./scripts/serve-apk.sh
```

**I due modelli nuovi non sono ancora stati provati contro Groq**: sono presi
dalla tabella dei ritiri e dalle schede dei modelli, e le capability che
servono - tool use per l'assistente, immagini piu' JSON object mode per le
foto - risultano dichiarate. La chiave pero' vive sul telefono, quindi la
prima chiamata vera sara' quella dell'APK. Se sbaglia, adesso il motivo si
legge in Impostazioni > Diagnostica invece di sparire.

**3. Ripulire l'emulatore.** Ci sono dati di prova lasciati apposta durante le
verifiche: obiettivo 2000 kcal, 100 g di anacardi, 10.000 passi, un esercizio
`Pancainc test` gia' cancellato. Vivono solo li' e non sono mai arrivati al
server, perche' quella sessione era scaduta.

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
- `share_window_days`: quanto passato esce lo sceglie l'utente, sette di
  default. Restringerla cancella dal server quel che ne resta fuori.
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
- **il numero della migrazione va dichiarato**: se entrambe ne aggiungono una e
  prendono lo stesso numero, `PRAGMA user_version` ne applica una sola e l'altra
  sparisce **in silenzio**.

`src/i18n/locales/it.json` e' il punto di collisione peggiore, perche' ogni
funzione aggiunge chiavi. Quando conteneva le aggiunte di una sessione e le
rimozioni dell'altra, la via d'uscita e' stata costruire per l'indice il
contenuto desiderato (HEAD piu' le proprie chiavi) e metterlo in stage con
`git update-index --cacheinfo`, lasciando fuori le modifiche dell'altra
sessione. Verificato in entrambe le direzioni prima di committare.

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

Screenshot con `adb exec-out screencap -p > /tmp/x.png`, log con
`adb logcat -d -s ReactNativeJS:V`.

Per guardare il database dell'app sull'emulatore senza indovinare:

```bash
adb shell "run-as com.koski.kaltrack cat files/SQLite/kaltrack.db" > /tmp/k.db
adb shell "run-as com.koski.kaltrack cat files/SQLite/kaltrack.db-wal" > /tmp/k.db-wal
sqlite3 /tmp/k.db "SELECT ..."
```

Il file `-wal` va copiato insieme all'altro: senza, si legge un database
vecchio di qualche transazione e si crede a un difetto che non c'e'.
