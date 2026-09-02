# KalTrack — il server

Convenzioni per lavorare su questo backend. **Le regole di prodotto e di
privacy stanno in [`README.md`](README.md)**, che va letto prima di toccare
qualunque cosa esca verso un altro utente: qui c'e' solo quel che serve a
scrivere codice senza rompere le promesse scritte la'.

> Questo file conteneva le istruzioni di bootstrap del template Laravel Boost,
> identiche a `AGENTS.md` e senza una parola su KalTrack. Dicevano di lanciare
> `composer require laravel/boost --dev` su un progetto che funziona: e' stato
> sostituito il 2 settembre 2026.

## Cos'e'

Laravel 13 su PHP 8.3+, l'API degli **amici** e la **copia** del database del
telefono. Non e' la fonte di verita': quella e' il telefono, e l'app funziona
senza rete e senza account. Il server tiene una copia.

## Comandi

```bash
php artisan serve            # sviluppo
php artisan test             # 125 test
php artisan migrate          # 17 migrazioni
```

Il database di sviluppo e di produzione e' **SQLite**. In produzione sta in WAL
su un volume Docker montato in `/data`, e le migrazioni le lancia l'entrypoint
del container all'avvio. Procedura di deploy in `README.md` § In produzione.

## Le regole che non si negoziano

1. **Niente esce verso chi non e' amico accettato**, con **due eccezioni
   dichiarate**: i cataloghi comuni di `exercises` e `foods`, che sono di tutti
   gli iscritti. Sono descritte in `README.md` § L'eccezione dichiarata, e non
   se ne aggiungono altre senza scriverle la'.
2. **`created_by` non esce da nessuna risposta.** Al suo posto viaggia `mine`:
   il catalogo dice a te che una voce e' tua, non dice a nessun altro di chi
   e'.
3. **Le cinque regole della sincronizzazione stanno in `CLAUDE.md` alla radice**
   (§ Sincronizzazione). La prima vale anche qui: una riga di una tabella
   sincronizzata non si cancella davvero, si scrive `deleted_at`.
4. **`sync_records.updated_at` arriva dal telefono e non si riscrive**: e' il
   criterio con cui si decide chi vince un conflitto. Il modello ha
   `$timestamps = false` e `$dateFormat` con i millesimi per questo, e non per
   gusto - il formato di serie tronca al secondo e due scritture nello stesso
   secondo diventerebbero indistinguibili.
5. **Un nome utente si confronta senza maiuscole**, e c'e' un solo posto che lo
   sa: `User::whereHandle`. Vale ovunque - accesso, unicita', apertura di un
   profilo, ricerca.
6. **Il controllo dei permessi sta nel server**, mai solo nella schermata. Per
   `is_admin` e' dentro il controller, accanto a cio' che protegge.

## Convenzioni di codice

Valgono le guide Dieffetech `docs/laravel/` (skill `dieffetech-docs`). Due
scostamenti dal template, entrambi voluti:

- **Nessuna policy** e nessuna `authorizeResource`. Il diritto qui non e' "puo'
  questo ruolo": e' "sono amici" oppure "e' una voce che ho aggiunto io",
  cioe' una condizione sui dati che vive nelle query. Il controllo di
  `is_admin` sta dentro `AdminController`, accanto a cio' che protegge.
- **Nessuna Spatie QueryBuilder.** Non c'e' un endpoint con filtri
  componibili: l'API ha un solo consumatore, che chiede quel che gli serve.

Il resto segue il template, e va seguito:

- **FormRequest** dove la validazione ha piu' di un paio di campi
  (`app/Http/Requests/`, sei classi: accesso, registrazione, sincronizzazione,
  statistiche, allenamenti, profilo). `$request->validate()` inline solo dove i
  campi sono uno o due, come in `ImageController`.
- **API Resource** dove la risposta ha una forma che si ripete
  (`app/Http/Resources/`, quattro classi). E' anche il posto dove si tiene la
  promessa che `created_by` non esca.
- **Attributi PHP 8 per `$fillable`** (`#[Fillable([...])]`) su tutti e sette i
  modelli.
- **Test di funzionalita' con `RefreshDatabase`** - tutte e quattordici le
  classi in `tests/Feature/` - e ogni endpoint che pubblica qualcosa ha un test
  con **un secondo account vero** che prova a leggere quel che non e' suo. Non
  e' cortesia: le due regole della privacy si verificano solo da fuori.
- **Throttle su tutto quel che chiunque puo' chiamare** (`login`, `register`) e
  su quel che assegna credenziali (`admin/.../password`).
