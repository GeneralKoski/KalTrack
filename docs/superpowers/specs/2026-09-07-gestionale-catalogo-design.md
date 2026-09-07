# Il gestionale del catalogo

7 settembre 2026.

## Cosa

Un pannello web in React, dentro `backend/`, servito da Laravel su `/admin`,
da cui si amministra il **catalogo comune**: esercizi con le loro descrizioni e
foto, alimenti, e le tassonomie che li descrivono (gruppi muscolari,
attrezzatura). Piu' l'elenco degli iscritti, con il reset password che esiste
gia' e un interruttore nuovo per l'AI.

E una coda di **revisione**: cio' che un utente si crea sul telefono viene
proposto, non pubblicato, ed entra nel catalogo di tutti solo quando
l'amministratore lo approva.

## Perche' non e' un CRUD

Tre cose che il progetto oggi da' per assodate cambiano, e vanno cambiate
insieme o il gestionale scrive nel vuoto.

**Le descrizioni e le foto degli esercizi sul server non esistono.**
`instructions` vive nel seed dell'app (`src/db/seed/exercises.ts`) e
`photo_uri` nella migrazione 18 del telefono. Il catalogo condiviso porta
nome, gruppo muscolare, muscoli secondari e attrezzatura, e basta. Correggere
una descrizione da web, oggi, non ha dove scriverla.

**Il catalogo non si aggiorna, si integra.** `importCatalog` inserisce solo
cio' che manca, confrontando sul nome normalizzato, e non tocca mai una riga
che esiste gia'. E' la stessa regola di `applyExerciseSeeds`, ed e'
deliberata: la scelta dell'utente vince. Ma una descrizione corretta da web
riguarda proprio righe che esistono gia', quindi quella regola va sostituita
con una piu' precisa (§ La propagazione).

**Tutto cio' che si crea a mano diventa pubblico da solo.** La migrazione di
`exercises` lo dichiara: "un esercizio che qualcuno si e' creato entra
nell'elenco di chiunque, cosi' il catalogo cresce invece di restare quello del
primo giorno". Da qui in poi non e' piu' vero: cresce quando l'amministratore
lo decide.

Cio' che **non** cambia: il telefono resta la fonte di verita' del diario,
l'app funziona senza rete e senza account, e `sync.ts` non si tocca. Il
catalogo e' l'unica parte che diventa server-first, ed e' l'unica per cui ha
senso: e' anagrafica condivisa, non roba che si scrive in palestra.

## Le decisioni prese

1. **Il catalogo e' autoritativo sui campi di catalogo.** Le righe locali con
   `is_custom = 0` si riallineano al server: nome, gruppo, muscoli secondari,
   attrezzatura, istruzioni, foto. Le righe `is_custom = 1` non si toccano
   mai.
2. **I giudizi personali restano personali.** `notes`, `dislike_level`,
   `is_banned`, `usage_count` non li scrive mai il catalogo, in nessun caso.
   Sono opinioni su un esercizio, non la sua descrizione.
3. **Cio' che si crea si propone.** Nasce `pending`, resta sul telefono di chi
   l'ha scritto, ed entra nel catalogo di tutti solo da approvato.
4. **L'identita' di una voce e' un `uid` stabile, non il nome.** Il nome
   normalizzato non regge una rinomina fatta da web: al pull successivo il
   telefono non riconosce la riga e ne crea un doppione.
5. **Le tassonomie stanno sul server e arrivano all'app senza un rilascio.**
   `MuscleGroup` ed `Equipment` smettono di essere union TypeScript e
   diventano righe.
6. **Una voce tolta dal catalogo non si cancella dal telefono**, diventa
   `is_custom = 1`.
7. **Il gestionale e' una SPA dentro `backend/`**, non un secondo deploy.

## Il modello sul server

### `exercises`

Colonne nuove:

| Colonna | Tipo | Perche' |
|---|---|---|
| `uid` | string(64), unique | L'identita' stabile. Per i 200 del seed e' gia' pronta: sono gli id parlanti (`ex-panca-piana-bilanciere`). Per le voci proposte e' un UUID |
| `status` | enum `pending`/`published`/`rejected`, default `pending` | La moderazione |
| `instructions` | text, nullable | Come si esegue. Oggi vive solo nel seed dell'app |
| `photo` | string(120), nullable | Il nome del file, come per le foto utente |
| `reviewed_at` | timestamp, nullable | Quando e' stata decisa |
| `reviewed_by` | foreignId users, nullable, nullOnDelete | Da chi |
| `review_note` | string(500), nullable | Perche' e' stata rifiutata. E' cio' che si dice all'autore, il giorno che glielo si dira' |
| `deleted_at` | timestamp, nullable | Soft delete. Serve a dire ai telefoni "questa non c'e' piu'": una cancellazione vera non ha modo di raccontarsi, ed e' la regola 1 della sincronizzazione applicata a un'altra tabella |

`created_by` c'e' gia' (migrazione `add_author_to_exercises`) e finalmente
serve a qualcosa oltre al controllo di proprieta': in revisione bisogna sapere
chi ha proposto cosa. **Continua a non uscire verso gli utenti**: la regola "il
catalogo dice a te che quella voce e' tua, non dice a nessun altro di chi e'"
resta valida per tutti tranne l'amministratore.

`name_norm` resta unico e resta la chiave della deduplica in ingresso.

### `foods`

Le stesse sei colonne di moderazione (`uid`, `status`, `reviewed_*`,
`deleted_at`), piu':

| Colonna | Tipo | Perche' |
|---|---|---|
| `barcode` | string(32), nullable, index | Il telefono ce l'ha dalla scansione e il server no. E' identita' esatta: due prodotti con lo stesso codice sono lo stesso prodotto |
| `off_id` | string(64), nullable | La provenienza da OpenFoodFacts, per sapere quali valori sono stati compilati da chiunque |
| `image` | string(120), nullable | Come `photo` sugli esercizi |

### `muscle_groups` e `equipment_types`

Due tabelle uguali: `id`, `slug` (unique), `label_it`, `label_en`, `sort`,
`deleted_at`, timestamps.

Sono seminate dalle costanti che oggi stanno in `src/types/gym.ts`, con le
etichette prese da `gym.muscle.*` e `gym.equipment.*` di `it.json` e `en.json`.
Lo slug e' cio' che va in colonna sugli esercizi e non cambia mai: rinominare
"Femorali" in "Ischiocrurali" cambia `label_it`, non `slug`, o ogni esercizio
che lo nomina resterebbe orfano.

`corpo_libero` non e' cancellabile: `EquipmentScreen` lo dichiara sempre
presente ("Il corpo libero c'e' sempre") e `listAvailableEquipment` ragiona per
esclusione a partire da li'.

### `users`

Una colonna: `ai_enabled`, boolean, **default true**.

Default acceso e non spento perche' oggi l'AI e' attiva per chiunque, gratuita
e con la chiave nel bundle: nascere spenta la toglierebbe a tutti quelli che ce
l'hanno. Il giorno in cui le chiamate passano dal backend (`TODO.md` § 3.1) il
default si rovescia e il diritto si concede.

### Le migrazioni dei dati

- Le righe di `exercises` e `foods` che ci sono oggi diventano `published`:
  erano gia' catalogo vivo, e nascere `pending` le nasconderebbe a tutti.
- Le stesse righe ricevono un `uid`: UUID per tutte, tranne dove il
  `name_norm` combacia con un esercizio del seed, che prende il suo id
  parlante.
- Un comando `php artisan catalog:seed` carica i 200 esercizi e gli alimenti
  del seed dell'app come `published`, con `uid` = id del seed, `instructions`
  incluse. **Senza questo passo il primo pull duplica duecento esercizi su ogni
  telefono**: il seed li ha inseriti con i suoi id, il catalogo li manderebbe
  come voci nuove, e il confronto per `uid` non troverebbe niente. Il comando
  e' idempotente per `uid`.

  Il comando **non legge `src/db/seed/`**, e non e' una scelta di comodo: in
  produzione `backend/` viaggia da solo, l'rsync di § In produzione manda
  quella cartella e nient'altro, quindi `../src/` li' non esiste e il comando
  fallirebbe solo sul server. Legge invece
  `backend/database/seeders/data/exercises.json` e `foods.json`, generati da
  uno script npm (`npm run seed:export`) e **committati**. Lo script gira
  quando il seed cambia, e un test dell'app confronta il conteggio dei due
  file con quello delle costanti: un esercizio aggiunto al seed e non
  riesportato e' un esercizio che il catalogo non conosce, e nessuno se ne
  accorgerebbe.

## Le API

### Per l'app, sotto `auth:sanctum`

```
GET    /api/catalog/exercises?since=&after=
GET    /api/catalog/foods?since=&after=
GET    /api/catalog/taxonomies
GET    /api/catalog/images/{name}
POST   /api/catalog/exercises          proposta
PATCH  /api/catalog/exercises/{uid}    solo la propria, solo se pending
DELETE /api/catalog/exercises/{uid}    solo la propria, solo se pending
        (e i tre gemelli per foods)
```

`GET` restituisce **solo `published`**. Il proprio in attesa non si rimanda:
e' gia' sul telefono di chi l'ha scritto.

`since` e' l'`updated_at` del server dell'ultima riga ricevuta, e con `since`
valorizzato la risposta **include le voci cancellate** (solo `uid` e
`deletedAt`): senza, una voce tolta dal catalogo non avrebbe modo di
raccontarsi. `after` resta il cursore su `name_norm` che c'e' gia'.

Le rotte attuali `/api/exercises` e `/api/foods` restano e continuano a
funzionare: un telefono con la build di ieri non deve smettere di sincronizzare
il catalogo il giorno del deploy. `POST` su quelle crea `pending` come le
nuove, `GET` filtra `published`.

`GET /api/catalog/images/{name}` serve i byte da
`storage/app/private/catalog/`, **non** da `images/{utente}/`: una foto di
catalogo e' comune a tutti, e il percorso per utente la renderebbe di uno solo.
Resta fuori da `public/` come le altre.

### Per il gestionale, sotto `auth:sanctum` + `EnsureAdmin`

```
GET    /api/admin/stats
GET    /api/admin/submissions?type=&status=&q=
POST   /api/admin/submissions/{type}/{id}/approve   corpo = i campi corretti
POST   /api/admin/submissions/{type}/{id}/reject    corpo = la nota
GET|POST|PATCH|DELETE  /api/admin/exercises[/{id}]
POST   /api/admin/exercises/{id}/photo
GET|POST|PATCH|DELETE  /api/admin/foods[/{id}]
POST   /api/admin/foods/{id}/image
GET|POST|PATCH|DELETE  /api/admin/muscle-groups[/{id}]
GET|POST|PATCH|DELETE  /api/admin/equipment[/{id}]
GET    /api/admin/users
PATCH  /api/admin/users/{user}          ai_enabled
POST   /api/admin/users/{user}/password
```

`EnsureAdmin` e' un middleware vero e sostituisce `ensureAdmin()` dentro
`AdminController`: con dodici rotte da proteggere, un controllo scritto a mano
in ogni metodo e' un controllo che prima o poi si dimentica in uno.

`GET /api/admin/stats` torna i numeri della dashboard, fra cui i due che dicono
cosa manca: quanti esercizi pubblicati sono senza descrizione e quanti senza
foto.

`approve` accetta i campi corretti nello stesso corpo della chiamata: in
revisione si corregge **mentre si guarda**, e una modifica seguita da
un'approvazione sarebbero due richieste che possono divergere.

### L'accesso del gestionale

Sanctum SPA a cookie di sessione, non token: un token in `localStorage` e' un
token che un XSS porta via, e qui la sessione ce l'abbiamo gia' (`SESSION_DRIVER=database`, la tabella `sessions` esiste dalla prima migrazione).

In `routes/web.php`:

```
GET    /admin/{any?}    la SPA, catch-all
POST   /admin/login     guardia di sessione
POST   /admin/logout
GET    /sanctum/csrf-cookie   (fornito da Sanctum)
```

`POST /api/login`, che torna un token, resta com'e': la usa l'app.

Il login del gestionale **rifiuta chi non e' `is_admin`** invece di far entrare
e poi mostrare pagine vuote.

## La propagazione all'app

`importCatalog` e `importFoodCatalog` diventano un `syncCatalog` solo, in
`src/services/catalogSync.ts`.

**Quando gira**: all'avvio e a ogni ritorno in primo piano, con una finestra di
**un'ora** (un marcatore locale accanto a `sync.cursor`, in
`syncMarkers.ts`), piu' a richiesta con lo swipe in Esercizi e in Alimenti. Il
pull e' incrementale: si manda `since`, si riceve cio' che e' cambiato.

**Come si aggancia una riga**: per `catalog_uid`, con ricaduta sul nome
normalizzato per le righe gia' installate che l'`uid` non ce l'hanno ancora
(cioe' tutte, al primo pull dopo l'aggiornamento). Agganciata per nome, la riga
riceve l'`uid` e da li' in poi si aggancia per quello.

**Cosa scrive**, riga per riga:

- `is_custom = 0`: nome, `name_norm`, gruppo, muscoli secondari, attrezzatura,
  istruzioni, foto. Nient'altro.
- `is_custom = 1`: niente. Mai.
- `notes`, `dislike_level`, `is_banned`, `usage_count`: mai, nemmeno su una
  riga di catalogo.
- Voce con `deletedAt`: la riga locale **non si cancella**, passa a
  `is_custom = 1`. Cancellarla porterebbe via il nome a ogni allenamento
  passato che la nominava, ed e' esattamente quel che `deleteRoutine` evita
  non cancellando i giorni. Diventa roba sua e smette di ricevere
  aggiornamenti.
- Voce che qui non c'e': si inserisce con `is_custom = 0`, come oggi.

**Le foto**: il nome arriva nella riga, i byte da
`GET /api/catalog/images/{name}`, e si archiviano con `persistPhoto` come
quelle utente. Una foto non ancora scaricata si disegna con `SyncedPhoto`, che
il segnaposto lo sa gia' fare. Il download e' pigro e non blocca il pull: un
catalogo con duecento immagini non deve tenere ferma la palestra al primo
avvio.

### Le migrazioni dell'app

- **019** `catalog_uid`: `exercises.catalog_uid`, `foods.catalog_uid`, con
  indice.
- **020** `taxonomies`: `muscle_groups` e `equipment_types`
  (`slug` PK, `label_it`, `label_en`, `sort`), seminate dalle costanti attuali.

`catalog_uid` sta su una tabella che si sincronizza, quindi viaggia nel
payload. Il `CLAUDE.md` § La ricerca di un alimento avverte contro il tenere in
colonna un id del server, perche' "su un secondo dispositivo o dopo un cambio di
account punterebbe alla riga di un altro catalogo". Qui non vale, e va detto
perche': `uid` non e' un autoincrement ma una stringa stabile assegnata alla
voce, il server e' uno solo, e la stessa voce ha lo stesso `uid` per chiunque.
Un `uid` che dall'altra parte non esiste non risolve e basta, e la ricaduta sul
nome lo ripesca.

Le due tabelle nuove vanno in **`LOCAL_ONLY_TABLES`** con il motivo: sono la
copia locale di un elenco comune, si ricostruiscono dal server, e mandarle al
server vorrebbe dire rispedirgli cio' che ha appena mandato lui. E' la regola 5
della sincronizzazione, che ha un test che la controlla.

## Le tassonomie dinamiche

`MUSCLE_GROUPS` ed `EQUIPMENT` in `src/types/gym.ts` smettono di essere l'elenco
autorevole e restano come **seme** della migrazione 020. I tipi `MuscleGroup` ed
`Equipment` diventano `string`.

Cio' che il compilatore smette di garantire va garantito altrove:

- `parseEquipment` e `parseMuscles` in `exerciseCatalog.ts` oggi buttano i
  valori che non sono nell'union. Da qui in poi il metro e' la tabella:
  si tiene cio' che la tassonomia conosce, e il resto si butta come prima.
  Il controllo non sparisce, cambia fonte.
- **L'etichetta viene dalla riga**, `label_it` o `label_en` secondo la lingua
  dello store, e le chiavi `gym.muscle.*` / `gym.equipment.*` di i18n restano
  come ricaduta per i dodici gruppi e gli undici attrezzi che ci sono oggi. Un
  gruppo nuovo arriva con la sua etichetta gia' scritta da chi l'ha creato: e'
  il motivo per cui la tabella ha due colonne di etichetta e non una chiave.
- `i18n/keys.test.ts` oggi verifica che ogni valore dell'union abbia la sua
  chiave. Continua a farlo **sulle costanti del seme**, che restano: e' il
  minimo garantito, e un gruppo aggiunto da web non ha una chiave i18n per
  definizione.
- Colori e icone per gruppo muscolare, dove ci sono, prendono una ricaduta
  neutra per gli slug che non conoscono. Un gruppo nuovo si vede grigio, non
  fa sparire la schermata.

## Il gestionale

`backend/resources/js/admin/`. Vite (gia' configurato, l'input si aggiunge),
React 19, TypeScript strict, **Ant Design 5**, React Router, TanStack Query.

| Pagina | Cosa c'e' |
|---|---|
| Login | Solo `is_admin`. Il resto della SPA non esiste per chi non e' entrato |
| Dashboard | Proposte in attesa, iscritti, voci pubblicate per tipo, e i due numeri che dicono cosa manca: esercizi senza descrizione, esercizi senza foto |
| Proposte | Coda unica esercizi + alimenti, filtri per tipo, autore, data. Si apre una proposta, si correggono i campi guardandola, si approva o si rifiuta con una nota. E' l'unico posto dove si vede chi ha proposto |
| Esercizi | Tabella con ricerca e filtri (gruppo, attrezzatura, senza descrizione, senza foto). Form completo: nome, gruppo, muscoli secondari, attrezzatura, istruzioni, foto |
| Alimenti | Tabella + form: nome, marca, valori per 100 g, liquido, porzione predefinita, etichetta porzione, codice a barre, immagine |
| Tassonomie | Gruppi muscolari e attrezzatura: slug, etichetta it/en, ordine. Lo slug non e' modificabile dopo la creazione |
| Utenti | Handle, nome, email, iscrizione, proposte fatte e approvate. Reset password. Interruttore IA |

Le validazioni sono quelle del server e si vedono nel form: il backend riassume
gia' i suoi errori in una frase sola (`App\Support\ValidationMessage`), e AntD
sa mettere il messaggio sotto il campo giusto dal corpo `errors`.

Il deploy non cambia: `npm run build` dentro `backend/`, e poi l'rsync e il
`docker compose build` che ci sono gia'. L'unica aggiunta al Dockerfile e' lo
stage che builda gli asset.

## L'interruttore IA

`users.ai_enabled` esce in `GET /me`, l'app lo tiene nell'`accountStore` e a
interruttore spento non monta `AssistantButton`.

**Oggi e' un cartello, non una serratura.** La chiave Gemini sta nel bundle e le
chiamate partono dal telefono: spegnere l'interruttore nasconde il microfono e
nient'altro, e chi ripacchettizza l'APK lo riaccende. Il `CLAUDE.md` lo dice
gia' in § AI e vale identico qui. Si costruisce ora perche' la colonna e la UI
servano subito a regalare l'AI a chi si vuole, non perche' proteggano qualcosa.
Diventa una serratura quando le chiamate passano dal backend (`TODO.md` § 3.1),
e quel giorno il controllo e' una riga nel proxy.

Senza account non c'e' `ai_enabled` e non c'e' niente da spegnere: l'app senza
account funziona come sempre.

## Cosa cambia nell'app esistente

- `src/services/exerciseCatalog.ts` e `foodCatalog.ts` si fondono in
  `catalogSync.ts`. `publishToCatalog` diventa `submitToCatalog`.
- `ExerciseFormSheet` e `FoodFormScreen`: il testo sopra il campo nome oggi
  promette che la voce "entra nell'elenco di chiunque abbia un account". Da qui
  in poi sarebbe falso: diventa "verra' proposta e, se approvata, entrera' nel
  catalogo di tutti". Chiave nuova in `it.json` **e in `en.json`**.
- `src/types/gym.ts`: i due tipi diventano `string`, le costanti restano come
  seme.
- `src/db/queries/exercises.ts` e `foods.ts`: `catalog_uid` in lettura e
  scrittura, piu' le query della tassonomia.
- `sync.ts`: le due tabelle nuove in `LOCAL_ONLY_TABLES`.
- `CLAUDE.md`: § L'unica cosa che esce verso i non amici va riscritta - non e'
  piu' "entra nell'elenco di chiunque", e § Il catalogo degli esercizi non puo'
  piu' dire che aggiornare il seed non raggiunge chi ce l'ha gia'.

## Test

**Server**

- Una voce `pending` non esce da `GET /api/catalog/exercises`, nemmeno al suo
  autore.
- Un non-admin prende 403 su ogni rotta `/api/admin/*`, elencate una per una.
- Il login del gestionale rifiuta un utente valido ma non admin.
- Il pull incrementale: con `since`, tornano le righe cambiate dopo e le
  cancellate, e nessuna riga due volte.
- `catalog:seed` e' idempotente: due esecuzioni, duecento righe.
- I due JSON esportati hanno tante voci quante le costanti del seed: un
  esercizio aggiunto a `src/db/seed/` e non riesportato fa fallire il test.
- Approvando con correzioni, la voce esce corretta e non come proposta.
- Le voci che esistevano prima della migrazione risultano `published`.

**App**

- Riga `is_custom = 0`: nome, istruzioni e foto si riallineano.
- Riga `is_custom = 1`: il pull non la tocca.
- `notes`, `dislike_level`, `is_banned`, `usage_count` sopravvivono a un pull
  che riscrive tutto il resto.
- Voce rinominata da web: si riconosce per `uid` e si rinomina, non si duplica.
- Riga senza `uid`: si aggancia per nome normalizzato e riceve l'`uid`.
- Voce cancellata dal catalogo: la riga resta e diventa `is_custom = 1`.
- La finestra di un'ora: due chiamate ravvicinate fanno una richiesta sola.
- `sync.test.ts` continua a passare con le due tabelle nuove dichiarate.
- Uno slug di tassonomia sconosciuto non fa sparire niente: etichetta di
  ricaduta.

**Gestionale**

Typecheck e build in CI. Test di componente solo dove c'e' logica vera: il form
nutrizionale (le kcal ricalcolate dai macro) e la revisione con correzione.

## Le fasi

Sono tre e vanno in quest'ordine, perche' ognuna e' il presupposto della
successiva. Ognuna e' rilasciabile: il server nuovo serve i telefoni vecchi, e
il gestionale e' utile prima che l'app sappia leggere il catalogo nuovo.

1. **Server**: colonne, tassonomie, moderazione, `EnsureAdmin`, `catalog:seed`,
   le rotte `/api/catalog/*` e `/api/admin/*`.
2. **Gestionale**: la SPA, tutte le pagine.
3. **App**: migrazioni 019 e 020, `catalogSync.ts`, tassonomie dinamiche, i
   testi delle due schermate.

## Fuori perimetro

- **I tipi di pasto** restano nel seed dell'app. Ognuno se li rinomina e se li
  nasconde, e portarli sul server vorrebbe dire decidere cosa fare di chi li ha
  gia' personalizzati, senza che nessuno lo abbia chiesto.
- **Il diario** resta local-first, intero. `sync.ts` non si tocca.
- **Il catalogo "della community"** - vedere le proposte altrui prima
  dell'approvazione - e' un secondo momento, dichiarato tale. Per ora ciascuno
  vede solo il proprio finche' non e' pubblicato.
- **Dire all'autore che la sua proposta e' stata rifiutata**: `review_note` si
  scrive, ma non c'e' ancora niente che gliela mostri. La colonna nasce ora
  perche' il giorno che serve i dati ci siano gia'.
- **Sospendere e cancellare account**: non richiesti.
- **Il proxy AI**: e' `TODO.md` § 3.1 e ha la sua spec.
