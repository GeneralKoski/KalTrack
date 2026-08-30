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

Non esce **niente** del resto. Il diario, gli alimenti, le ricette, le schede,
le serie, le foto, le misure, i digiuni stanno in `sync_records`, che e' legato
all'utente e non ha nessun endpoint che lo esponga a terzi. Il dettaglio di
cosa si e' mangiato non e' visibile a nessuno.

## Le due regole della privacy

Ogni numero di un profilo passa **due** controlli, entrambi in
`app/Http/Resources/PublicProfileResource.php`:

1. il proprietario ha acceso quella condivisione;
2. chi guarda e' un suo amico **accettato**.

Le condivisioni partono tutte spente. Un profilo appena creato non mostra
niente: si sceglie cosa mostrare, non si scopre cosa si stava gia' mostrando.

`tests/Feature/PrivacyTest.php` verifica entrambe le regole. Un campo aggiunto
al profilo senza passare da li' esce per tutti, e solo quel test lo direbbe.

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
