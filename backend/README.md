# KalTrack — backend degli amici

Il server che serve **solo** alla parte social di KalTrack: amici, profilo
pubblico e i totali di giornata che si scelgono di condividere.

L'app funziona senza. Il diario, la palestra, le misure e tutto il resto
vivono sul telefono e non passano mai di qui. Chi non vuole gli amici non ha
bisogno di questo server e non se ne accorge.

## Cosa arriva al server, e cosa no

Arriva: email, password (hash), handle, nome, avatar, bio, e **un riepilogo
per giorno** con kcal, passi, peso e numero di allenamenti.

Non arriva: il diario, gli alimenti, le ricette, le schede, le serie, le foto,
le misure, i digiuni. Il dettaglio di cosa si e' mangiato resta sul telefono,
dove e' sempre stato.

## Le due regole della privacy

Ogni numero di un profilo passa **due** controlli, entrambi in
`app/Http/Resources/PublicProfileResource.php`:

1. il proprietario ha acceso quella condivisione;
2. chi guarda e' un suo amico **accettato**.

Le condivisioni partono tutte spente. Un profilo appena creato non mostra
niente: si sceglie cosa mostrare, non si scopre cosa si stava gia' mostrando.

`tests/Feature/PrivacyTest.php` verifica entrambe le regole. Un campo aggiunto
al profilo senza passare da li' esce per tutti, e solo quel test lo direbbe.

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

## Endpoint

| Metodo | Percorso | Cosa fa |
|---|---|---|
| POST | `/api/register` | Crea l'account, torna il token |
| POST | `/api/login` | Torna il token |
| POST | `/api/logout` | Revoca **solo** il token in uso |
| GET | `/api/me` | Il proprio profilo, per intero |
| PATCH | `/api/me` | Handle, nome, bio, avatar, condivisioni |
| PUT | `/api/me/stats` | Il telefono pubblica i totali di giornata |
| GET | `/api/users?q=` | Cerca per handle o nome (min. 2 caratteri) |
| GET | `/api/users/{handle}` | Profilo pubblico, filtrato |
| GET | `/api/friendships` | Amicizie e richieste, con la direzione |
| POST | `/api/friendships` | Chiede l'amicizia (o accetta, se l'altro aveva gia' chiesto) |
| PATCH | `/api/friendships/{id}/accept` | Accetta. Solo il destinatario |
| DELETE | `/api/friendships/{id}` | Rifiuta o rimuove |

Nessuna lettura e' pubblica: senza account non si vede niente di nessuno.

## Cosa manca

- Deploy: hosting, dominio, HTTPS, e un database vero al posto di SQLite.
- Verifica dell'email e recupero password.
- Il lato app oltre al layer di rete: le schermate di amici e profilo.
