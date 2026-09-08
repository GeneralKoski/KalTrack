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
php artisan test             # 251 test
php artisan migrate          # 21 migrazioni
```

Il database di sviluppo e di produzione e' **SQLite**. In produzione sta in WAL
su un volume Docker montato in `/data`, e le migrazioni le lancia l'entrypoint
del container all'avvio. Procedura di deploy in `README.md` § In produzione.

## Le regole che non si negoziano

1. **Niente esce verso chi non e' amico accettato**, con **due eccezioni
   dichiarate**: i cataloghi comuni di `exercises` e `foods`, che sono di tutti
   gli iscritti **una volta pubblicati** - una proposta la vede solo il server
   e chi la revisiona. Sono descritte in `README.md` § L'eccezione dichiarata,
   e non se ne aggiungono altre senza scriverle la'.
2. **`created_by` non esce da nessuna risposta, con due eccezioni, entrambe
   sotto `/api/admin/*`:** la coda di revisione (`SubmissionController`), dove
   chi guarda e' chi decide e deve sapere chi propone, e `AdminController::
   users()`, che pubblica per ciascun utente quante proposte ha fatto e
   quante sono state pubblicate - un fatto derivato dall'autore, non l'autore
   stesso, ma della stessa natura: serve a chi amministra, non al catalogo di
   tutti. Ovunque altro viaggia `mine`: il catalogo dice a te che una voce e'
   tua, non dice a nessun altro di chi e'.
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
   `is_admin` e' un middleware (`EnsureAdmin`) sul gruppo di rotte, non un
   controllo scritto a mano in ogni controller: il gestionale ne porta una
   ventina, e un controllo ripetuto venti volte e' un controllo che prima o
   poi manca in uno.
7. **Ogni indice unico su una tabella con `SoftDeletes` copre anche le righe
   cancellate**: non solo `name_norm` (`exercises`, `foods`), ma anche
   `exercises.uid`, `foods.uid`, `muscle_groups.slug` ed `equipment_types.slug`.
   Ogni controllo scritto per evitare che il database risponda con un errore
   illeggibile deve interrogare `withTrashed()`, o quel controllo non vede la
   collisione con una riga cancellata e il database risponde comunque con
   quell'errore. E' successo quattro volte nella stessa fase - l'ultima nel
   seeder delle tassonomie, dove nessuno se lo aspettava perche' non e' un
   controller.

## Convenzioni di codice

Valgono le guide Dieffetech `docs/laravel/` (skill `dieffetech-docs`). Due
scostamenti dal template, entrambi voluti:

- **Nessuna policy** e nessuna `authorizeResource`. Il diritto qui non e' "puo'
  questo ruolo": e' "sono amici" oppure "e' una voce che ho aggiunto io",
  cioe' una condizione sui dati che vive nelle query. Il controllo di
  `is_admin` sta nel middleware `admin` sul gruppo di rotte, non in ogni
  controller.
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
- **Attributi PHP 8 per `$fillable`** (`#[Fillable([...])]`) su tutti e nove i
  modelli.
- **Test di funzionalita' con `RefreshDatabase`** - tutte le classi in
  `tests/Feature/` - e ogni endpoint che pubblica qualcosa ha un test
  con **un secondo account vero** che prova a leggere quel che non e' suo. Non
  e' cortesia: le due regole della privacy si verificano solo da fuori.
- **Throttle su tutto quel che chiunque puo' chiamare** (`login`, `register`) e
  su quel che assegna credenziali (`admin/.../password`).

## Il pannello

`resources/js/admin/`. React 19 + Ant Design 6 + TanStack Query + React
Router, TypeScript strict, test con Vitest. Quattro cose da non rompere:

- **Ogni richiesta passa da `apiFetch`.** Un `fetch` nudo non porta il token
  CSRF e torna 419 - e' quel che faceva l'upload di serie di AntD, che fa un
  `fetch` suo per conto proprio, ed e' il motivo per cui `PhotoUpload` usa
  `customRequest`.
- **I moduli di scheda rimandano l'intero elenco modificabile, ed e' voluto.**
  `ExerciseForm` e `FoodForm` mandano tutto cio' che il modulo mostra - nome
  compreso - a ogni salvataggio, perche' ogni campo e' gia' a schermo e
  precompilato dalla riga: un'istantanea intera non puo' perdere un valore che
  nessuno ha guardato. `TaxonomyForm` fa lo stesso sui suoi tre campi
  modificabili, e trattiene solo lo slug - che non si modifica da li' e che il
  server ignorerebbe comunque. E' per questo che `array_key_exists` campo per
  campo, nei controller ammin, e' una **rete di sicurezza** e non un contratto
  su cui il client fa affidamento: chi manda tutto non ne ha bisogno, chi manda
  meno lo trova gia' li'.
- **La coda di revisione (`ReviewDrawer`) e' l'unico punto che confronta
  davvero**, con `changedFields` contro i valori con cui la proposta e'
  arrivata - `approve` scrive quel che riceve, e li' un campo intonso deve
  restare invisibile. Il motivo per cui il confronto serve e' concreto e non
  ipotetico: `Input`/`Input.TextArea` svuotati mandano `''`, mentre una
  proposta senza quel campo porta `null` - senza normalizzare `''` in `null`
  **prima** del confronto (`normalizzaTesto`), un campo di testo che nessuno ha
  toccato differirebbe comunque e verrebbe scritto come una correzione che
  nessuno ha fatto.
- **Gli errori 422 si vedono in due posti**: il `message` in un toast, gli
  `errors` sotto il campo. E' il contrario della regola dell'app (`CLAUDE.md`
  alla radice, § Convenzioni non negoziabili), e qui e' voluto: li' il toast
  e' l'unico posto perche' un telefono non ha spazio, qui il modulo ce l'ha.
