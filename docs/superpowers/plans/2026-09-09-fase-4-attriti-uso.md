# Fase 4: i dodici attriti dell'uso quotidiano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chiudere le dodici cose che il proprietario si e' segnato usando l'app per giorni, piu' tre difetti preesistenti trovati indagandole.

**Architecture:** nessuna architettura nuova. Undici voci su dodici riusano
quel che c'e' gia' - `MetricEntrySheet`, `HistoryList`, `MetricHistoryHero`,
`DraftTextInput`, il drag di `RemindersScreen`. La sola cosa nuova e' una
query per modificare una voce libera, che non esiste.

**Tech Stack:** React Native 0.83, Expo 55, React 19, TypeScript strict,
expo-sqlite (better-sqlite3 nei test), zustand, i18n-js, reanimated +
gesture-handler.

**Spec:** non c'e' una spec: la fonte sono le dodici frasi del proprietario,
riportate verbatim in ogni task. L'indagine che le ha mappate sul codice sta
in `.superpowers/sdd/2026-09-08-gestionale-fase-3-app/fase-4-indagine.md` e
va letta insieme al brief di ogni task: contiene file, righe e vincoli.

## Global Constraints

Valgono per **ogni** task, non si ripetono nei singoli.

- **Italiano nei commenti e nei nomi di dominio.** Commenti solo dove la
  logica non si spiega da se': il "perche'", non il "cosa".
- **TypeScript strict, mai `any`.** `npm run typecheck` deve restare pulito.
- **Import assoluti con `@/`**, mai `../`.
- **Logging solo via `logger`**, mai `console.*`.
- **Ogni testo visibile via `t("chiave")`**, in **entrambi**
  `src/i18n/locales/it.json` e `en.json`. `keys.test.ts` confronta le due nei
  due versi e falisce su una chiave presente in una sola. Prima di aggiungere
  una chiave, cercare se una generica di primo livello dice gia' la stessa
  cosa: riusarla e' meglio che aggiungerne una quasi-uguale.
- **Mai `DELETE FROM` su una tabella sincronizzata.** Si scrive `deleted_at`,
  e le letture filtrano `deleted_at IS NULL`.
- **Chi scrive una riga di una tabella sincronizzata scrive `updated_at`.**
  Il push seleziona per `updated_at`: senza, la modifica non viaggia. Questo
  piano contiene un difetto esistente causato esattamente da questa
  dimenticanza (task 9).
- **Una tabella o colonna nuova va dichiarata** in `SYNCED_TABLES` /
  `LOCAL_ONLY_TABLES` (`src/services/sync.ts`) **e** in `BACKUP_TABLES`
  (`src/services/backup.ts`).
- **Le ore non si confrontano come stringhe**: `Date.parse`.
- **Il telefono resta la fonte di verita'.** Niente solleva verso una
  schermata; senza rete e senza account l'app funziona identica.
- **Convenzioni UI non negoziabili:** `TouchableOpacity` con
  `activeOpacity={0.6}`, mai `Pressable` con style-as-function; `hitSlop={8}`
  sui target piccoli; token da `@/src/styles`, mai hex inline; `Text` e
  `TextInput` da `@/src/components/ui/`, mai le primitive RN nude; un elenco
  di righe e' un `ListGroup`, non N `Card`; **al massimo un `HeroPanel` per
  schermata**; uno stato vuoto dentro qualcosa e' `compact`; un foglio che si
  chiude si svuota, e uno che si **riempie da una prop** torna a quella prop
  e non al vuoto.
- **Un campo il cui stato non vive accanto all'input e' `DraftTextInput`.**
- **Comandi di verifica dalla root:** `npm run typecheck`, `npm test`,
  `npm run lint` (0 errori, e gli 11 warning noti non devono crescere).
- **Niente `git push`, niente deploy.** Ogni task chiude con un commit locale
  su `main`. Messaggi in **inglese**, corpo esaustivo, senza trailer di
  co-autore, con la riga `Claude-Session:` in fondo.
- **Mai `git checkout` / `restore` / `stash`** per disfare una mutazione: si
  copia il file di lato e si ricopia indietro.

---

### Task 1: le etichette corte e le due sezioni che si scambiano di posto

Batch di quattro voci XS piu' una: sono tutte etichette o navigazione, nessuna
ha una superficie di review propria, e tenerle separate costerebbe quattro
dispatch per venti righe.

Le frasi del proprietario:

> 9. "In creazione scheda invece che mettere 'agginugi blocco' che è una frase
>    lunga, metterei solo 'Esercizio' che tanto c'è il + di fianco e lo fa
>    capire"
> 10. "In dettaglio esercizio creato, invece che avere 'modifica esercizio' ed
>     'elimina esercizio', mettiamo solo 'modifica' ed 'elimina' per accorciare"
> 11. "La sezione 'Backup' la sposterei nelle impostazioni."
> 12. "La sezione 'Salute' la sposterei invece sotto 'App' dov'era 'backup'"
> 4a. "Quando aggiungo con voce libera, non devo avere il flag con la stellina
>     'AI'"

**Files:** `src/i18n/locales/it.json`, `en.json`,
`src/navigation/screens/RoutineFormScreen.tsx`,
`src/navigation/screens/ExerciseDetailScreen.tsx`,
`src/navigation/screens/ProfileScreen.tsx`,
`src/navigation/screens/SettingsScreen.tsx`,
`src/navigation/screens/TodayScreen.tsx`

Dettagli di riga nell'indagine, §§ 9-12 e § 4.

- [ ] **Step 1: `gym.add_block` diventa "Esercizio" / "Exercise"**

Un solo chiamante, `RoutineFormScreen.tsx:517`. Nessuna chiave generica dice
"esercizio": si riscrive il valore, non si cambia la chiave.

- [ ] **Step 2: le due azioni del dettaglio esercizio**

`gym.delete_exercise` si **cancella** e il chiamante usa il `delete` di primo
livello, che dice gia' "Elimina"/"Delete".

`gym.edit_exercise` **non** si puo' riusare cosi': e' condivisa con il titolo
di `ExerciseFormSheet`, dove "Modifica esercizio" e' giusto. Serve una `edit`
di primo livello ("Modifica"/"Edit") accanto a `save`/`delete`/`cancel`, e la
usa il dettaglio; `gym.edit_exercise` resta al titolo del foglio.

- [ ] **Step 3: Backup va in Impostazioni, Salute va sotto App**

Scambio simmetrico, un commit. Entrambe le destinazioni sono nella stessa
`RootStack`, quindi non serve toccare la navigazione: si spostano le righe.
Verificare che nessun altro punto raggiunga `Backup` per nome di rotta.

- [ ] **Step 4: la stellina AI sparisce dalla voce libera**

`TodayScreen.tsx:295` passa `is_estimated: true` **fisso** su una voce
scritta a mano. Una voce libera non e' una stima di un modello: il flag va
passato per quel che e', cioe' falso quando la scrive l'utente. Non toccare
il badge in se': serve alle voci che vengono davvero da una stima.

- [ ] **Step 5: i tre cancelli piu' `keys.test.ts`**

Run: `npm test -- src/i18n/keys.test.ts` && `npm run typecheck` && `npm run lint`
Expected: verde. Una chiave cancellata da una lingua sola fa fallire
`keys.test.ts`.

- [ ] **Step 6: Commit**

---

### Task 2: le schede non saltano piu' in cima

> 8a. "Quando ho più schede, l'ordine deve rimanere quello che è. Se ne attivo
>     una, non deve tornare in alto."

Meta' della segnalazione 8, e si chiude con una clausola. L'altra meta' - il
riordino a trascinamento - e' il task 10, perche' e' l'unico L del piano.

**Files:** `src/db/queries/workouts.ts`, `src/db/queries/workouts.test.ts`

**Interfaces:**
- Consumes: niente.
- Produces: `listRoutines()` con un ordine stabile.

- [ ] **Step 1: il test che dichiara l'ordine stabile**

Tre schede create in sequenza; si attiva la seconda; l'elenco deve restare
nell'ordine di creazione. Il test va scritto **prima** e va visto fallire.

- [ ] **Step 2: guardalo fallire**

Run: `npx jest src/db/queries/workouts.test.ts`
Expected: FAIL - la scheda attivata esce prima.

- [ ] **Step 3: togli `is_active DESC` dall'`ORDER BY`**

`workouts.ts:59`. L'attiva si riconosce dal suo marcatore in elenco, non
dalla posizione: e' `getActiveRoutine` a rispondere alla domanda "quale e'
attiva", e ordinare per quello significa che accendere una scheda ne
riscrive la posizione sotto il dito.

- [ ] **Step 4: verde, e i test esistenti non si indeboliscono**

Run: `npx jest src/db/queries/workouts.test.ts` && `npm test`
Expected: PASS. Se un test esistente si appoggiava all'attiva-in-cima, va
riscritto per asserire l'ordine nuovo - non cancellato.

- [ ] **Step 5: Commit**

---

### Task 3: dallo storico passi si modifica una riga

> 1. "In storico passi devo poter cliccare su una riga per modificarne il
>    valore. al momento posso solo cancellare dopo aver tenuto premuto"

**Files:** `src/navigation/screens/StepsHistoryScreen.tsx`,
`src/containers/progress/MetricEntrySheet.tsx` (e il suo test),
i18n se serve un'etichetta.

`MetricEntrySheet` esiste, ha il selettore di data, e serve gia' il "+" di
Progressi. Va riusato con due prop nuove (`initialDate`, `initialValue`) e la
**data bloccata in modifica**: si sta correggendo il valore di un giorno, non
spostando un valore da un giorno a un altro - quello sarebbe cancellare e
riscrivere, e va fatto con i due gesti che ci sono gia'.

Vincolo dal § "Un foglio o una finestra che si chiude si svuota" di
`CLAUDE.md`: un foglio che si riempie da una prop torna **a quella prop**,
non al vuoto, o riaprendo la stessa riga il modulo si presenta vuoto.

- [ ] **Step 1: i test del foglio in modifica** (riempimento dalle prop,
      ritorno alla prop alla chiusura, data non modificabile)
- [ ] **Step 2: guardali fallire**
- [ ] **Step 3: le due prop e la data bloccata**
- [ ] **Step 4: `onRowPress` fuori selezione apre il foglio**
      `StepsHistoryScreen.tsx:119` oggi non fa niente. La pressione lunga
      resta quel che e': selezione multipla ed eliminazione in blocco.
- [ ] **Step 5: verde, e i cancelli**
- [ ] **Step 6: Commit**

---

### Task 4: e dallo storico peso allo stesso modo

> 2. "In storico peso stessa cosa dei passi, premendo devo poter modificare
>    quel giorno"

Le due schermate sono gemelle e condividono `HistoryList`. Task separato dal 3
di proposito: se il 3 scopre che il foglio va cambiato piu' del previsto,
questo eredita la soluzione invece di duplicarne il problema.

**Files:** `src/navigation/screens/WeightHistoryScreen.tsx` (riga 116), i test.

- [ ] **Step 1: il test** — toccando una riga si apre il foglio con il peso
      di quel giorno
- [ ] **Step 2: guardalo fallire**
- [ ] **Step 3: `onRowPress`, riusando quel che il task 3 ha costruito**
      Se serve una terza prop, va nel foglio, non in una copia.
- [ ] **Step 4: verde, e i cancelli**
- [ ] **Step 5: Commit**

---

### Task 5: la ricerca alimenti trova anche il marchio

> 5. "Quando cerco un alimento da aggiungere, devo poter anche cercare per
>    marchio. Quindi se ho 'Formaggio spalmabile' marchio 'milbona',
>    scrivendo 'milbona' mi deve uscire questo e tutti gli altri di quel
>    marchio."

**Files:** `src/db/queries/foods.ts`, `src/db/queries/foods.test.ts`

**Decisione presa:** si aggancia con un `LIKE` su `brand` **grezzo**, senza
`brand_norm` e senza migrazione. SQLite e' gia' case-insensitive su ASCII con
`LIKE`, quindi "milbona" trova "Milbona". Una colonna normalizzata con il suo
indice si aggiunge il giorno che la ricerca diventa lenta o che serve
insensibile agli accenti - non prima, e `TODO.md` lo registra.

Nessuno dei sei chiamanti rifiuta il marchio: cercare "milbona" e trovare i
suoi prodotti e' quel che si vuole in tutti e sei.

- [ ] **Step 1: i test** — il marchio trova; il nome continua a trovare; un
      alimento senza marchio non rompe niente (`brand` e' nullable)
- [ ] **Step 2: guardali fallire**
- [ ] **Step 3: la clausola**
- [ ] **Step 4: verde, e i cancelli**
- [ ] **Step 5: Commit**

---

### Task 6: la foto dell'alimento si vede

> 6. "Quando sto creando un alimento, scatto la foto e dopo conferma vedo
>    spazio nero, non mi mette in preview la foto scattata/caricata"

**Files:** `src/components/kal/PhotoField.tsx` (`PhotoTile`),
`src/services/photoStorage.ts`, i test.

**Quel che l'indagine ha trovato:** `PhotoTile` e' l'**unica** superficie
fotografica dell'app che non passa da `SyncedPhoto`, quindi per una foto
arrivata da un altro telefono il riquadro nero e' **certo**. Per la foto
appena scattata i due sospetti sono il ripiego silenzioso di `writeResized` e
l'uscita anticipata di `persistPhoto:71`. Zero test su questo percorso.

- [ ] **Step 1: riproduci prima di correggere**
      Un test che monti `PhotoTile` con un uri che non ha un file dietro deve
      dire cosa disegna oggi. Non si corregge un difetto che non si e' visto
      fallire.
- [ ] **Step 2: `PhotoTile` passa da `SyncedPhoto`**
      Il segnaposto invece del rettangolo vuoto: `CLAUDE.md` § Le foto lo
      dichiara per tutte le altre superfici, e questa e' l'eccezione rimasta
      indietro. "Il rettangolo vuoto sembra un difetto dell'app, il segnaposto
      dice che la foto esiste e non e' ancora arrivata."
- [ ] **Step 3: il percorso della foto appena scattata**
      Verificare i due sospetti e correggere quel che risulta. Se
      `writeResized` ripiega in silenzio, il ripiego va **registrato** -
      un'immagine che non si sa ridimensionare si archivia originale, ma
      nessuno deve scoprirlo da un riquadro nero.
- [ ] **Step 4: verde, e i cancelli**
- [ ] **Step 5: Commit**

---

### Task 7: si scrive veloce e non si perde piu' niente

> 7. "Se scrivo veloce mi si bugga e scrive parole a caso/riscrive ciò che sto
>    scrivendo. è un problema con il font, vedo che mette lettera normale e poi
>    la converte di font"

**La diagnosi del proprietario e' meta' giusta e va corretta nel piano.** Il
font **non puo'** cambiare fra due render: `resolveFontFamily` e' una lookup
sincrona su oggetti costanti, e `App.tsx:149` non monta niente prima che i
font siano caricati. Quel che vede e' il **testo in composizione dell'IME**
riscritto quando React riapplica il `value` - cioe' esattamente il difetto che
`CLAUDE.md` § Quel che si digita documenta, con il rimedio gia' in casa.

**Files:** `src/components/kal/SearchBar.tsx`, `CLAUDE.md`, e - a seconda di
quel che il task 7 misura - `OnboardingTextField` e le altre famiglie che
l'indagine elenca.

**Una riga di `CLAUDE.md` e' FALSA e va corretta nello stesso commit.** Il
documento dichiara `SearchBar` un'eccezione legittima "perche' ridisegna solo
se stessa". Non e' vero: `SearchBar` non ha stato proprio, ridisegna quel che
ridisegna il chiamante. Senza correggere quella frase, il prossimo che legge
il documento annulla questa modifica.

- [ ] **Step 1: `SearchBar` passa a `DraftTextInput`**
      Un intervento, nove schermate: Alimenti, Esercizi, Ricette, Amici, il
      foglio Aggiungi, `IngredientPicker`, `EntryCompositionSheet`,
      `ExercisePickerSheet`.
      Attenzione al vincolo che `DraftTextInput.test.tsx` enuncia: **un
      chiamante che trasforma il valore prima di rimandarlo indietro non puo'
      usarlo**, perche' ogni sua eco sembrerebbe un valore esterno. Verificare
      che nessuno dei nove lo faccia; se uno lo fa, resta fuori e si dichiara.
- [ ] **Step 2: la riga falsa di `CLAUDE.md`**
      Riscrivere l'eccezione: restano `QuantityPrompt` e `MetricEntrySheet`,
      il cui stato vive davvero accanto all'input e serve a disegnare la
      finestra stessa. `SearchBar` esce dall'elenco delle eccezioni.
- [ ] **Step 3: il secondo sospetto**
      `OnboardingTextField` (altezza e peso), dove ogni tasto ricalcola il
      TDEE e ridisegna l'hero. Misurare prima di cambiare: se il giro chiude
      dentro il fotogramma, lasciarlo e dirlo.
- [ ] **Step 4: verde, e i cancelli**
- [ ] **Step 5: Commit**

---

### Task 8: la pagina delle calorie, in sola lettura

> 3. "Devo avere la pagina di resoconto delle calorie, come ce l'ho per peso e
>    passi, solo che in questa non devo poter modificare nè eliminare."

**Files:** `src/navigation/screens/CaloriesHistoryScreen.tsx` (nuovo),
`src/navigation/index.tsx`, `src/containers/progress/HistoryList.tsx`,
`src/db/queries/` (la serie giornaliera), i18n, i test.

**Tre cose che questa schermata NON ha, e sono la sua definizione:** nessuna
modifica, nessuna eliminazione, nessuna selezione multipla. `HistoryList` va
reso **opzionale** sulla selezione invece di duplicato.

**La sorgente e' `dailyKcalRange`**, non `getDayDiary` in ciclo: un giorno di
calorie e' un totale che si calcola, non una riga di metrica. E la media va
sui giorni **registrati** - un giorno senza voci non e' un giorno a zero
calorie, come per i passi.

Le barre partono da zero (una quantita' tagliata alla base mente), e servono
da **un** punto; la linea del peso parte da due. Il delta **non ha un
colore**: verde su un calo direbbe che calare e' bene, e non e' l'app a
saperlo.

- [ ] **Step 1: il test della serie giornaliera**
- [ ] **Step 2: guardalo fallire**
- [ ] **Step 3: la query**
- [ ] **Step 4: `HistoryList` con la selezione opzionale**
      I due chiamanti esistenti non cambiano comportamento: un test per
      ciascuno lo dichiara.
- [ ] **Step 5: la schermata, e la riga che la apre da Progressi**
- [ ] **Step 6: verde, e i cancelli**
- [ ] **Step 7: Commit**

---

### Task 9: una voce libera si modifica

> 4b. "inoltre al click devo poterlo modificare (al momento mi apre una modale
>     con 'x la porzione' che è completamente inutile"

**Piu' grande di come suona:** in tutto `src/` **non esiste** nessuna funzione
per modificare i valori di una voce libera. Serve una query nuova.

**Files:** `src/db/queries/diary.ts` (o dove vivono le voci) e il suo test,
`src/containers/diary/FreeEntrySheet.tsx`,
`src/navigation/screens/TodayScreen.tsx` (`onEditEntry`), i18n.

**La regola dei grammi decide cosa "modificare" possa significare.** Una voce
libera "congela il totale e memorizza quantita' 1": quindi si modificano
**nome e valori assoluti**, mai i grammi. Chi aggiunge un campo grammi qui
rimette il difetto che quella regola esiste per impedire.

E il foglio in modifica segue la regola dei fogli: si riempie da `editing` e
alla chiusura torna a `editing`, non al vuoto.

- [ ] **Step 1: i test della query** (nome e valori si riscrivono;
      `updated_at` si scrive - la tabella e' sincronizzata; la quantita'
      resta 1)
- [ ] **Step 2: guardali fallire**
- [ ] **Step 3: la query**
- [ ] **Step 4: `FreeEntrySheet` in modalita' modifica**
- [ ] **Step 5: il bivio in `onEditEntry`**
      Una voce libera apre il foglio; una voce con un alimento dietro
      continua ad aprire `QuantityPrompt`, che per lei ha senso.
- [ ] **Step 6: verde, e i cancelli**
- [ ] **Step 7: Commit**

---

### Task 10: le schede si riordinano trascinandole

> 8b. "Permettiamo invece lo spostamento delle card tenendo premuto, in modo da
>     riordinare a piacere come nei promemoria"

L'unico L del piano, ed e' l'ultimo di proposito: tutto il resto e' chiuso
prima che questo cominci.

**Files:** `src/db/migrations/021_routine_position.ts` (nuovo),
`src/db/migrations/index.ts`, `src/db/queries/workouts.ts` e il suo test,
`src/navigation/screens/RoutinesScreen.tsx`, `src/services/sync.ts` se serve.

**Precedente da copiare:** `RemindersScreen` ha il drag completo - gesture
reanimated, `movePosition`, `reorderReminders`.

**E un difetto da NON copiare, che l'indagine ha trovato:**
`reorderReminders` **non scrive `updated_at`**, e siccome `reminders` sta in
`SYNCED_TABLES` e il push seleziona per `updated_at`, **il riordino dei
promemoria non si e' mai sincronizzato da quando esiste.** Il riordino delle
schede deve scrivere `updated_at`; e il difetto dei promemoria si chiude nel
task 11.

**Il riordino obbliga ad abbandonare la `FlatList` di `RoutinesScreen`**,
contro una regola che nomina "schede" per iscritto. E' motivato e va scritto
nel commit: le schede sono due o tre, non duecento - la regola parla di
elenchi lunghi e virtualizzati, e questo non lo e'. Se un giorno lo diventasse,
il drag e la virtualizzazione tornerebbero in conflitto e vince la
virtualizzazione.

- [ ] **Step 1: la migrazione 021** — una colonna di posizione su `routines`,
      seminata sull'ordine di creazione attuale
- [ ] **Step 2: i test della query di riordino** (l'ordine si riscrive;
      `updated_at` si scrive su ogni riga toccata; una posizione duplicata
      non manda in crisi l'elenco)
- [ ] **Step 3: guardali fallire**
- [ ] **Step 4: la query, e `ORDER BY position`**
- [ ] **Step 5: il drag nella schermata**
- [ ] **Step 6: verde, e i cancelli**
- [ ] **Step 7: Commit**

---

### Task 11: tre difetti trovati per strada

Nessuno dei tre e' fra le dodici. Due li ha trovati la verifica finale della
Fase 3, uno l'indagine di questa. Si chiudono qui perche' sono piccoli e
perche' due riguardano regole che il documento dichiara e il codice non
rispetta.

**Files:** `src/db/queries/reminders.ts` e il suo test,
`src/services/photoSync.test.ts`, `src/services/photoSync.ts`

- [ ] **Step 1: `reorderReminders` scrive `updated_at`**
      Il riordino dei promemoria non si e' mai sincronizzato. Un test lo
      dichiara, e il Global Constraint di questo piano esiste per questo.
- [ ] **Step 2: l'ordine "prima il locale, poi il remoto" viene pinnato**
      In `raccogliDelleRighe` l'ordine e' corretto e **nessun test lo tiene**:
      invertendolo la suite delle foto resta verde. `CLAUDE.md` § Le foto lo
      dichiara ("Due ordini che non si invertono"), e la ragione e' che
      un'interruzione fra i due lascerebbe un file che nessuna riga nomina, che
      `uploadPendingPhotos` ricaricherebbe al giro dopo. Il test va scritto e
      verificato per mutazione.
- [ ] **Step 3: il commento stantio**
      `photoSync.test.ts:277` dice ancora `orphanPhotoNames`, rinominato in
      `orphanPhotoUris` altrove.
- [ ] **Step 4: verde, e i cancelli**
- [ ] **Step 5: Commit**

---

### Task 12: `TODO.md` dice cosa resta

- [ ] **Step 1: chiudere le dodici voci** e registrare quel che si e'
      deliberatamente rinviato: `brand_norm` con il suo indice (task 5), il
      pin del punto di chiamata di `defaultSlug`, e la stima da foto di
      `TodayScreen` senza pin dalla Fase 3.
- [ ] **Step 2: Commit**
