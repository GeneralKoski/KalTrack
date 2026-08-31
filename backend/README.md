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
iscritti**. Un esercizio o un alimento creato a mano da qualcuno entra
nell'elenco di chiunque abbia un account, amico o no.

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
risposta. Al suo posto c'e' `mine`, cioe' "questa la puoi correggere tu". Sapere
che un esercizio l'ha inventato Tizio resta un fatto su Tizio che non serve a
nessuno per allenarsi; sapere che l'hai inventato tu serve a te per correggerlo.
Una voce senza autore - vecchia, o di un account cancellato - resta in elenco e
non la modifica piu' nessuno: sparire dal servizio non deve poter svuotare il
catalogo di tutti.

La cancellazione e' vera e non `deleted_at`: questi due elenchi non si
sincronizzano con nessun telefono, quindi non esiste il difetto per cui una
riga tolta risorge al giro dopo. Il telefono che l'aveva importata se la tiene.

Quel che i cataloghi NON contengono e' altrettanto deliberato: niente note,
niente istruzioni, niente "quanto ti sta antipatico", niente preferiti. Sono
giudizi personali su un esercizio o su un alimento, non la loro descrizione.

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
| POST | `/api/images` | Carica il file di una foto (max 5 MB) |
| GET | `/api/images/{nome}` | Scarica una foto. **Solo le proprie** |
| DELETE | `/api/images/{nome}` | Cancella una foto |
| PUT | `/api/me/workouts` | Il telefono pubblica la palestra. **403 a interruttore spento** |
| GET | `/api/comparison?handles=&date=&days=` | Fino a 4 persone insieme, filtrate per ciascuna |
| GET | `/api/exercises?q=&after=` | Il catalogo esercizi, comune a tutti gli iscritti. Paginato: `next` dice se c'e' altro |
| POST | `/api/exercises` | Aggiunge una voce (o torna quella che c'era) |
| PATCH | `/api/exercises/{id}` | Corregge. **Solo le proprie** |
| DELETE | `/api/exercises/{id}` | Toglie. **Solo le proprie** |
| GET | `/api/foods?q=&after=` | Il catalogo alimenti, comune a tutti gli iscritti. Paginato come sopra |
| POST | `/api/foods` | Aggiunge una voce (o torna quella che c'era) |
| PATCH | `/api/foods/{id}` | Corregge. **Solo le proprie** |
| DELETE | `/api/foods/{id}` | Toglie. **Solo le proprie** |
| GET | `/api/users?q=` | Cerca per handle o nome (min. 2 caratteri) |
| GET | `/api/users/{handle}` | Profilo pubblico, filtrato |
| GET | `/api/admin/users` | L'elenco. **Solo amministratori** |
| POST | `/api/admin/users/{id}/password` | Reimposta una password. **Solo amministratori** |
| GET | `/api/friendships` | Amicizie e richieste, con la direzione |
| POST | `/api/friendships` | Chiede l'amicizia (o accetta, se l'altro aveva gia' chiesto) |
| PATCH | `/api/friendships/{id}/accept` | Accetta. Solo il destinatario |
| DELETE | `/api/friendships/{id}` | Rifiuta o rimuove |

Nessuna lettura e' pubblica: senza account non si vede niente di nessuno.

## Cosa manca

- Verifica dell'email e recupero password automatico. Al loro posto c'e' il
  reimposta password dell'amministratore, che con pochi utenti che si conoscono
  e' il rimedio proporzionato.
- Un database vero al posto di SQLite, se mai gli utenti diventassero tanti.
- **Moderazione dei cataloghi.** Ciascuno corregge o toglie solo le proprie
  voci, e non c'e' modo per un amministratore di togliere quella di un altro:
  una voce scritta male da qualcun altro resta nell'elenco di tutti. Con pochi
  utenti che si conoscono non e' un problema, e aggiungere un potere di
  cancellazione su roba altrui prima che serva sarebbe peggio del male.
- **Un secondo ambiente.** Ce n'e' uno solo, e le migrazioni vanno dritte in
  produzione con un backup prima. La scelta test/prod di `deploy.sh` viene dal
  template e non e' configurata.
