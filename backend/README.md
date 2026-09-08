# KalTrack — il server

Il server fa due cose separate, e vale la pena tenerle separate anche in testa
perche' hanno regole di privacy diverse:

1. **La copia di sicurezza.** Il database del telefono, per intero, sincronizzato
   qui. Serve a non perdere tutto se il telefono si rompe e a ritrovare i propri
   dati su un secondo dispositivo. **Non la vede nessun altro utente, mai.**
2. **La parte social.** Amici, profilo pubblico, e i totali di giornata che si
   sceglie di condividere. Questa e' l'unica cosa che esce verso altre persone.

L'app funziona senza il server. Chi non fa l'accesso continua a usare tutto
come prima: i dati vivono sul telefono e non partono.

## Cosa esce verso gli altri utenti

Questa e' la domanda che conta, ed e' diversa da "cosa arriva al server".

Esce: handle, nome, avatar, bio, e **un riepilogo per giorno** con kcal, passi,
peso e numero di allenamenti — e solo quelli che si e' scelto di condividere.

Da agosto 2026 esce anche, **per chi accende `share_gym`**, il contenuto degli
allenamenti: per ogni giorno, quali esercizi si sono fatti, con quante serie,
quante ripetizioni, quanto volume e quale carico massimo (`shared_workouts`).
E' l'unica cosa che pubblica un contenuto e non un totale, e per questo ha un
interruttore suo, spento di serie e indipendente da quello del **conteggio**
degli allenamenti: chi condivideva "tre allenamenti questa settimana" non si e'
ritrovato a condividere "panca a 92,5". Le note, i commenti e le serie singole
non escono: il dettaglio resta sul telefono come il diario.

Esce **tutto lo storico pubblicato**: non c'e' una finestra di giorni da
scegliere. `share_window_days` e' esistita fino al 31 agosto 2026 e i suoi
tagli sono stati tolti - quel che esce lo dicono i cinque interruttori. Le
righe gia' pubblicate restano: la colonna serviva a cancellarne, e toglierla
non e' un motivo per buttare via dello storico.

Non esce **niente** del resto. Il diario, gli alimenti, le ricette, le schede,
le serie, le foto, le misure, i digiuni stanno in `sync_records`, che e' legato
all'utente e non ha nessun endpoint che lo esponga a terzi. Il dettaglio di
cosa si e' mangiato non e' visibile a nessuno.

## L'eccezione dichiarata: i cataloghi comuni

Tutto quel che c'e' scritto sopra vale **fra amici accettati**. C'e' una sola
eccezione, ed e' meglio trovarla scritta qui che scoprirla leggendo il codice:
le tabelle `exercises` e `foods` sono cataloghi **comuni a tutti gli
iscritti**, ma solo per quel che e' **pubblicato**: un esercizio o un
alimento creato a mano da qualcuno nasce come una proposta, visibile solo a
lui, e raggiunge l'elenco di chiunque abbia un account solo quando un
amministratore lo approva - il catalogo di tutti non puo' essere la somma di
quel che ciascuno scrive di fretta.

Dal 30 agosto 2026 i cataloghi sono **due**: `exercises` e `foods`, con le
stesse identiche regole. Gli alimenti servono anche alle ricette: una ricetta
che si voglia condividere e' fatta di alimenti, e senza un elenco comune i suoi
ingredienti sull'altro telefono sarebbero riferimenti a niente.

**Ogni voce ha un autore, e ciascuno corregge o toglie solo le proprie.**
E' un cambio rispetto a com'erano nati i cataloghi, che apposta non
registravano nulla dell'autore: senza proprietario non esiste "il mio", e una
voce scritta male restava nell'app di tutti per sempre perche' nessuno aveva il
diritto di correggerla.

**Quel che non e' cambiato e' cosa esce**: `created_by` non compare in nessuna
risposta verso un altro utente. Al suo posto c'e' `mine`, cioe' "questa la puoi
correggere tu". Sapere che un esercizio l'ha inventato Tizio resta un fatto su
Tizio che non serve a nessuno per allenarsi; sapere che l'hai inventato tu
serve a te per correggerlo. Una voce senza autore - vecchia, o di un account
cancellato - resta in elenco e non la modifica piu' nessuno: sparire dal
servizio non deve poter svuotare il catalogo di tutti.

**Un'unica eccezione**, in un posto che un utente normale non raggiunge: la
coda di revisione sotto `/api/admin/*` (`SubmissionController`) mostra
l'autore di ogni proposta. Chi guarda li' e' chi decide se quella voce entra
nel catalogo di tutti, e deve sapere chi la propone - se non altro per
riconoscere chi propone spazzatura. E' un fatto che serve a chi revisiona, non
un fatto che il catalogo pubblica.

**Correggere il NOME di una proposta mentre la si approva costa oggi un
doppione su ogni telefono**, e va saputo prima di farlo: e' il primo campo del
modulo di revisione ed e' esattamente la correzione che la spec chiede.

Il difetto non e' nel pannello, che manda gia' `uid` in ogni risposta e non
assume niente di sbagliato: e' che **lato app quell'`uid` non lo legge
nessuno**. `src/services/exerciseCatalog.ts` ritrova la propria voce di
catalogo dal **nome normalizzato** (`miaInCatalogo(previousName)`), e
`updatePublishedExercise` quando quella ricerca non trova niente **crea una
voce nuova** invece di aggiornare; `importCatalog` salta per nome allo stesso
modo. Quindi, dopo una rinomina fatta da qui:

- la prossima correzione locale di chi aveva proposto la voce deposita una
  **seconda proposta** per la stessa cosa, perche' col nome nuovo la sua non
  si riconosce piu';
- ogni telefono che importa si porta a casa un esercizio **nuovo**, e quello
  col nome vecchio gli resta.

Il pannello non ha introdotto il difetto - il confronto per nome c'era da
prima - ma e' il primo strumento che rende una rinomina facile e frequente,
e per questo l'adozione di `uid` lato app e' passata da ordinata a urgente
(`TODO.md` § 5.3). Finche' non c'e', una rinomina in revisione costa N
doppioni: se il nome e' solo brutto e non sbagliato, conviene approvare
com'e'.

La cancellazione e' morbida (`deleted_at`), non piu' vera: una voce tolta dal
catalogo deve poter dire ai telefoni che non c'e' piu', e una riga sparita
davvero non ha modo di raccontare nulla. Il telefono che l'aveva importata se
la tiene comunque: e' roba sua, ed e' quel che ci si aspetta da un catalogo
che si e' copiato in casa.

Quel che i cataloghi NON contengono e' altrettanto deliberato: niente "quanto
ti sta antipatico", niente preferiti, niente contatore d'uso. Sono giudizi
personali su un esercizio o su un alimento, non la loro descrizione, e restano
sul telefono. `exercises.instructions` invece **c'e'**: e' seminata per tutti
e duecento gli esercizi del seed, si corregge dal gestionale ed esce da
`GET /api/catalog/exercises` - descrive l'esercizio, non un giudizio su di
esso, ed e' per questo che non segue la stessa regola delle note.

I doppioni li impedisce `name_norm` (minuscolo, senza accenti, spazi
compressi), con la stessa normalizzazione del telefono - `App\Support\Text` di
qua, `src/domain/text.ts` di la', e i test di `ExerciseCatalogTest` ripetono
apposta i casi di `src/domain/text.test.ts`.

## Le due regole della privacy

Ogni numero di un profilo passa **due** controlli, entrambi in
`app/Http/Resources/PublicProfileResource.php`:

1. il proprietario ha acceso quella condivisione;
2. chi guarda e' un suo amico **accettato**.

Le condivisioni partono tutte spente. Un profilo appena creato non mostra
niente: si sceglie cosa mostrare, non si scopre cosa si stava gia' mostrando.

`tests/Feature/PrivacyTest.php` verifica entrambe le regole. Un campo aggiunto
al profilo senza passare da li' esce per tutti, e solo quel test lo direbbe.

Il confronto con piu' persone (`GET /api/comparison`) applica le stesse due
regole **per ciascuno** dei partecipanti, dentro
`ComparisonParticipantResource`, che e' un confine di privacy come l'altro. Chi
non e' amico esce senza numeri e senza esercizi, e non fa fallire la richiesta
degli altri: bastava togliere un'amicizia perche' il confronto smettesse di
funzionare per tutti.

`tests/Feature/GymSharingTest.php` e `tests/Feature/ComparisonTest.php`
verificano l'interruttore della palestra e il confronto a piu' persone.

## La sincronizzazione

Il telefono resta la fonte di verita'. Il server tiene una copia e la
restituisce, senza elaborare niente: **una** tabella (`sync_records`) con il
payload in JSON, non ventisette speculari a quelle dell'app. Rifare lo schema
di qua vorrebbe dire mantenere ogni migrazione due volte, e bastera' una
divergenza perche' un campo nuovo si perda in silenzio.

Push e pull viaggiano nella stessa richiesta, perche' sono la stessa
conversazione. Chi ha scritto per ultimo vince, e "ultimo" si misura sull'ora
del **dispositivo**: usare l'ora di arrivo farebbe vincere chi si sincronizza
per ultimo invece di chi ha scritto per ultimo, e un telefono rimasto offline
una settimana sovrascriverebbe modifiche piu' recenti.

Due dettagli che sembrano pedanteria e non lo sono, entrambi costati un difetto:

- **Il segnaposto della pull e' un contatore, non un'ora** (`sequence`). Con un
  orario, due dispositivi che sincronizzavano nello stesso secondo si perdevano
  le righe a vicenda, per sempre.
- **Le ore hanno i millesimi**, in colonna e nelle risposte. Arrotondate al
  secondo, due modifiche fatte nello stesso secondo diventano pari e passa
  quella arrivata per ultima invece di quella scritta per ultima.

`tests/Feature/SyncTest.php` copre entrambi.

### I file delle foto

La sincronizzazione copia le RIGHE, e una riga con foto contiene un percorso: sull'altro
telefono quel percorso non ha niente dietro. I byte passano da `/api/images`, e
l'identita' di una foto e' il suo **nome** - la cartella dell'app cambia da sistema a
sistema, il nome no.

Stanno in `storage/app/private/images/{utente}` e **mai** sotto `public/`: sono le foto
dei progressi di qualcuno, non devono essere raggiungibili con un URL indovinato. Il nome
passa da un controllo di caratteri prima di finire in un percorso su disco, altrimenti un
`../` leggerebbe fuori dalla cartella. `tests/Feature/ImageTest.php` verifica entrambe le
cose, con un secondo account vero che chiede il file di un altro per nome esatto e si
prende un 404.

Due strette del 2 settembre 2026, **in produzione dallo stesso giorno**:

- **il nome non puo' cominciare con un punto.** Il vecchio regex ammetteva `.`
  e `..`: nessuna traversata vera, visto che `/` resta fuori, ma
  `images/{utente}/..` e' un percorso che il controller costruisce volentieri,
  e un nome deve nominare un file e non una cartella.
- **l'upload controlla il tipo** (`mimes:jpg,jpeg,png,webp,heic,heif`). Prima
  `file` e `max` non dicevano niente sul contenuto e qualunque cosa sotto i
  cinque megabyte entrava nella cartella. Il controllo e' sul contenuto e non
  sull'estensione, quindi gli upload del telefono non se ne accorgono.

Manca ancora la **raccolta delle foto orfane lato server**: il telefono
cancella la propria copia e chiama `DELETE /api/images/{nome}`
(`collectOrphanPhotos`), ma se quella chiamata non parte il file resta qui per
sempre e nessuno lo va a cercare.

## I nomi utente

**"A" e "a" sono lo stesso nome.** Se uno e' preso, l'altro non e' disponibile.
Le maiuscole si conservano - uno si chiama come vuole - ma non distinguono.

La regola vale solo se vale **dappertutto**, quindi esiste un solo posto che sa
confrontare un handle: lo scope `User::whereHandle`. Ci passano l'accesso, il
controllo di unicita', l'apertura di un profilo e la ricerca. Un punto che
confronta in modo binario fa rispondere "non trovato" a chi ha scritto il nome
giusto con le maiuscole sbagliate, ed e' successo davvero.

`Rule::unique` da sola non basta: su SQLite confronta in modo binario, quindi
"GeneralKoski" e "generalkoski" si registrerebbero entrambi. Sarebbero due
persone che nessuna lista sa separare e due righe che l'accesso non saprebbe
scegliere - il primo dei due si prenderebbe il login dell'altro. Per questo
c'e' `App\Rules\UniqueHandle`.

## Amministratori

`users.is_admin`, spento per tutti. Chi ce l'ha puo' vedere l'elenco degli
utenti e **reimpostare la password di chiunque**, dall'app.

Serve perche' non c'e' il recupero via email: senza, chi la dimentica resta
fuori e l'unico rimedio era un comando sul server.

E' una colonna e non "l'utente numero 1". Gli id non sono un ruolo: in questo
database l'id 1 non esiste piu' - e' stato un account di prova, cancellato - e
SQLite non lo riassegna. Una regola scritta su quel numero sarebbe nata morta.

Reimpostare una password **cancella i token di quell'utente**: una password si
cambia anche perche' si teme che qualcuno la conosca, e lasciare aperte le
sessioni gia' avviate renderebbe il cambio una formalita'.

## Localizzazione dei messaggi

I messaggi che il server genera da solo (errori di validazione, credenziali
non corrette) seguono la lingua dell'app, non una lingua fissa del server:
l'app manda l'header `Accept-Language` con la lingua scelta in
`translationStore` (`src/api/client.ts`), e il middleware
`SetLocaleFromHeader` sceglie la piu' vicina fra `it` ed `en` con
`App::setLocale` - **solo per quella richiesta**, perche' un worker PHP-FPM
serve utenti diversi in sequenza e lasciarla scritta farebbe leggere a uno la
lingua di chi era passato prima. Le traduzioni stanno in `lang/it/` e
`lang/en/`.

Ogni risposta 422 (`ValidationException` su `api/*`) aggiunge un campo
`message`: gli errori per-campo restano in `errors` come sempre, ma
`App\Support\ValidationMessage::summarize()` li riduce a **una frase sola**,
pensata per un toast che non puo' mostrarli tutti. Se i campi vuoti hanno
tutti lo stesso messaggio generico lo mostra una volta; se c'e' un messaggio
piu' specifico (password non sicura, handle gia' preso) vince quello.

## Avvio in sviluppo

```bash
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite
php artisan migrate
php artisan serve            # http://127.0.0.1:8000
```

Poi nell'app mobile, in `.env`:

```
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api
```

`10.0.2.2` e' l'indirizzo con cui l'emulatore Android raggiunge il computer.
Da un telefono vero serve l'IP della macchina sulla rete locale.

## Test

```bash
php artisan test
```

## In produzione

Gira in Docker su `kaltrack.martin-trajkovski.it`, dietro l'nginx del server
che fa da reverse proxy e tiene il certificato.

```bash
rsync -az --delete --exclude vendor --exclude node_modules --exclude .env \
  --exclude 'database/*.sqlite' --exclude storage/logs \
  backend/ root@<server>:/srv/apps/KalTrack/
ssh root@<server> 'cd /srv/apps/KalTrack && docker compose build api && docker compose up -d api'
```

Le migrazioni le lancia l'entrypoint del container all'avvio.

Il database SQLite sta su un volume montato in `/data`, **non** in
`/var/www/html/database`: montarlo li' nasconderebbe `database/migrations/`
dell'immagine, e ogni migrazione nuova sparirebbe senza un errore. L'entrypoint
direbbe "Nothing to migrate" e il deploy sembrerebbe riuscito.

`SANCTUM_STATEFUL_DOMAINS` va valorizzato in `.env` di produzione con
`kaltrack.martin-trajkovski.it`: e' il dominio da cui la SPA del gestionale
chiama `/api/admin/*` col cookie di sessione invece che con un token, e senza
quella riga Sanctum non la riconosce come una richiesta "dal frontend" - le
sue chiamate autenticate rispondono 401. E' una riga che senza il gestionale
non serviva, e chi rifa' il server da zero non la indovinerebbe: verificala
con `php artisan tinker --execute="print_r(config('sanctum.stateful'));"`.

**Il sintomo, se questa riga manca, e' il piu' difficile da leggere di tutta
la fase: l'accesso riesce - 200, cookie ricevuto - e poi ogni richiesta
successiva risponde 401, senza che niente a schermo lo spieghi.** La causa
sta in `EnsureFrontendRequestsAreStateful`, che decide se allegare la
sessione confrontando l'host della richiesta con `sanctum.stateful`; se
`SANCTUM_STATEFUL_DOMAINS` non e' valorizzato, quell'elenco si costruisce da
solo a partire da `APP_URL` (`config/sanctum.php`,
`Sanctum::currentApplicationUrlWithPort()`). Un `APP_URL` che non combacia con
l'host - o la porta - da cui il pannello viene servito non finisce
nell'elenco, e il pannello sembra rotto per un motivo che nessun test coglie -
`php artisan test` verde non e' la prova che questa riga sia a posto
(`TODO.md` § 5.4). Il rimedio e' l'uno o l'altro: allineare `APP_URL` all'host
vero, o
valorizzare `SANCTUM_STATEFUL_DOMAINS` esplicitamente - la riga sopra fa gia'
questo per la produzione.

Gli asset di `/admin` (`resources/js/admin/`) si compilano **dentro
l'immagine**: il `Dockerfile` ha uno stadio Node a parte (`FROM node:22-alpine
AS assets`) che gira `npm ci && npm run build` e passa `public/build` allo
stadio PHP con un `COPY --from=assets`. Non c'e' niente da lanciare a mano
prima del deploy - `public/build` e' gitignored apposta, perche' e' un
artefatto che l'immagine si costruisce da sola, non un file da portare col
rsync.

## Backup

```bash
php artisan backup:db --keep=14
```

Usa `VACUUM INTO` e non una copia del file: copiare un SQLite mentre qualcuno
ci scrive puo' produrre un file che non si riapre.

Sul server gira ogni notte alle 3:30 (`/etc/cron.d/kaltrack-backup`), a
un'ora lontana dal rinnovo dei certificati per non far competere due lavori
sullo stesso disco. Lo script `/usr/local/bin/kaltrack-backup` porta il file
**fuori** dal volume Docker, in `/srv/backups/kaltrack`, lo comprime e ne
tiene quattordici: un backup che vive dentro il volume che dovrebbe salvare
non e' un backup.

## Endpoint

| Metodo | Percorso | Cosa fa |
|---|---|---|
| POST | `/api/register` | Crea l'account, torna il token |
| POST | `/api/login` | Torna il token. Campo `login`: email **o** nome utente |
| POST | `/api/logout` | Revoca **solo** il token in uso |
| GET | `/api/me` | Il proprio profilo, per intero |
| PATCH | `/api/me` | Handle, email, nome, bio, avatar, condivisioni |
| PUT | `/api/me/stats` | Il telefono pubblica i totali di giornata |
| POST | `/api/sync` | Manda le modifiche e riceve quelle degli altri dispositivi |
| GET | `/api/images` | Quali foto ha gia', così il telefono manda solo il resto |
| POST | `/api/images` | Carica il file di una foto (max 5 MB, solo immagini) |
| GET | `/api/images/{nome}` | Scarica una foto. **Solo le proprie** |
| DELETE | `/api/images/{nome}` | Cancella una foto |
| PUT | `/api/me/workouts` | Il telefono pubblica la palestra. **403 a interruttore spento** |
| GET | `/api/comparison?handles=&date=&days=` | Fino a 4 persone insieme, filtrate per ciascuna |
| GET | `/api/exercises?q=&after=` | Il catalogo esercizi pubblicato. Legge tutto a ogni chiamata - vedi `/api/catalog/exercises` sotto |
| POST | `/api/exercises` | Propone una voce (o torna quella pubblicata che c'era). Nasce `pending` |
| PATCH | `/api/exercises/{id}` | Corregge. **Proprie e ancora in attesa** - da pubblicata in poi non e' piu' sua |
| DELETE | `/api/exercises/{id}` | Toglie. **Proprie e ancora in attesa**, stessa regola |
| GET | `/api/foods?q=&after=` | Il catalogo alimenti pubblicato, stessa forma di `/api/exercises` |
| POST | `/api/foods` | Propone una voce (o torna quella pubblicata che c'era). Nasce `pending` |
| PATCH | `/api/foods/{id}` | Corregge. **Proprie e ancora in attesa** |
| DELETE | `/api/foods/{id}` | Toglie. **Proprie e ancora in attesa** |
| GET | `/api/catalog/exercises?since=&afterId=&limit=` | Il catalogo esercizi, **incrementale**: senza `since` torna tutto il pubblicato, con `since` solo cio' che e' cambiato dopo - cancellazioni comprese |
| GET | `/api/catalog/foods?since=&afterId=&limit=` | Come sopra, per gli alimenti |
| GET | `/api/catalog/taxonomies` | Gruppi muscolari e attrezzi, interi a ogni chiamata (sono poche righe) |
| GET | `/api/catalog/images/{name}` | La foto di una voce di catalogo |
| POST | `/api/catalog/exercises` | Come `POST /api/exercises`: stesso controller, percorso nuovo per l'app aggiornata |
| PATCH | `/api/catalog/exercises/{id}` | Come `PATCH /api/exercises/{id}` |
| DELETE | `/api/catalog/exercises/{id}` | Come `DELETE /api/exercises/{id}` |
| POST | `/api/catalog/foods` | Come `POST /api/foods` |
| PATCH | `/api/catalog/foods/{id}` | Come `PATCH /api/foods/{id}` |
| DELETE | `/api/catalog/foods/{id}` | Come `DELETE /api/foods/{id}` |
| GET | `/api/users?q=` | Cerca per handle o nome (min. 2 caratteri) |
| GET | `/api/users/{handle}` | Profilo pubblico, filtrato |
| GET | `/api/friendships` | Amicizie e richieste, con la direzione |
| POST | `/api/friendships` | Chiede l'amicizia (o accetta, se l'altro aveva gia' chiesto) |
| PATCH | `/api/friendships/{id}/accept` | Accetta. Solo il destinatario |
| DELETE | `/api/friendships/{id}` | Rifiuta o rimuove |

Nessuna lettura e' pubblica: senza account non si vede niente di nessuno.

### Il gestionale (`/api/admin/*`)

Tutto dietro il middleware `admin` (regola 6), oltre ad `auth:sanctum`: chi non
e' amministratore prende 403, chi non ha un account 401.

| Metodo | Percorso | Cosa fa |
|---|---|---|
| GET | `/api/admin/users` | L'elenco, con quante proposte ciascuno ha fatto e quante pubblicate |
| PATCH | `/api/admin/users/{id}` | Accende o spegne l'AI per un utente |
| POST | `/api/admin/users/{id}/password` | Reimposta una password |
| GET | `/api/admin/stats` | I numeri della dashboard: in attesa, pubblicati, cosa manca |
| GET | `/api/admin/submissions?type=&status=&q=` | La coda di revisione, con l'autore di ogni proposta |
| POST | `/api/admin/submissions/{type}/{id}/approve` | Pubblica una proposta **pending**, correggendola se serve |
| POST | `/api/admin/submissions/{type}/{id}/reject` | Rifiuta una proposta **pending**. Rifiutato su altro stato: 422 |
| GET | `/api/admin/exercises?q=&muscleGroup=&equipment=&missing=` | Il catalogo intero, proposte comprese |
| POST | `/api/admin/exercises` | Crea una voce **gia' pubblicata**. Ricrearne una col nome di una cancellata la resuscita |
| PATCH | `/api/admin/exercises/{id}` | Corregge **qualunque** voce, non solo le proprie |
| DELETE | `/api/admin/exercises/{id}` | Cancellazione morbida di **qualunque** voce |
| POST | `/api/admin/exercises/{id}/photo` | Carica la foto di un esercizio (max 5 MB, solo immagini) |
| GET | `/api/admin/foods?q=&barcode=` | Il catalogo intero, proposte comprese |
| POST | `/api/admin/foods` | Crea una voce **gia' pubblicata**. Stessa resurrezione per nome degli esercizi |
| PATCH | `/api/admin/foods/{id}` | Corregge **qualunque** voce |
| DELETE | `/api/admin/foods/{id}` | Cancellazione morbida di **qualunque** voce |
| POST | `/api/admin/foods/{id}/image` | Carica l'immagine di un alimento |
| GET | `/api/admin/taxonomies/{kind}` | Gruppi muscolari o attrezzi (`kind` e' `muscle-groups` o `equipment`) |
| POST | `/api/admin/taxonomies/{kind}` | Aggiunge una voce. Ricrearne una con lo slug di una cancellata la resuscita |
| PATCH | `/api/admin/taxonomies/{kind}/{id}` | Corregge le etichette. Lo slug non si tocca da qui |
| DELETE | `/api/admin/taxonomies/{kind}/{id}` | Cancellazione morbida, rifiutata se qualche esercizio la usa ancora |

## Cosa manca

- Verifica dell'email e recupero password automatico. Al loro posto c'e' il
  reimposta password dell'amministratore, che con pochi utenti che si conoscono
  e' il rimedio proporzionato.
- Un database vero al posto di SQLite, se mai gli utenti diventassero tanti.
- **Un secondo ambiente.** Ce n'e' uno solo, e le migrazioni vanno dritte in
  produzione con un backup prima. La scelta test/prod di `deploy.sh` viene dal
  template e non e' configurata.
- **Nessuna rotta AI.** L'AI non ha mai toccato il server: la chiave sta nel
  bundle dell'app e le chiamate a Gemini partono dal telefono. Con il rilascio
  a pagamento quella scelta decade e le chiamate devono passare da qui - e'
  `TODO.md` § 3.1, ed e' la prima voce di quel lavoro, non l'ultima.

La **moderazione dei cataloghi**, che questa sezione elencava come mancante,
esiste dal 7 settembre 2026: una voce creata a mano nasce `pending` e non
`published`, un amministratore la approva o la rifiuta sotto `/api/admin/*`
(`SubmissionController`), e il pannello web (`/admin`, dietro
`EnsureAdmin`) corregge o toglie qualunque voce - non solo le proprie, che
resta la regola dell'app.

Il pannello vive in `resources/js/admin/`, servito da `GET /admin/{any?}` e
costruito con `npm run build` come ogni altro asset - dentro l'immagine Docker
al deploy, vedi § In produzione. Sette pagine: accesso, dashboard, proposte,
esercizi, alimenti, tassonomie, utenti.

L'accesso e' a **sessione** e non a token (`POST /admin/login`): un token per
una SPA va custodito nel browser, e cio' che sta in `localStorage` un XSS se
lo porta via; il cookie di sessione e' `httpOnly` e la sessione, per chi ha
appena fatto l'accesso, c'e' gia'. L'app continua a usare `POST /api/login` e
i suoi token: sono due client diversi con due esigenze diverse, e non c'e'
motivo di forzarli sullo stesso meccanismo. Le richieste del pannello a
`/api/admin/*` passano con lo stesso cookie di sessione perche' `statefulApi()`
(`bootstrap/app.php`) vale anche sulle rotte `/api/*`, non solo su `/admin/*`.

Tre cancelli, tutti da lanciare in `backend/`: `npm run typecheck`, `npm test`,
`npm run build`.
