# Confronto multiplo e confronto in palestra - Piano

> **Chiuso il 31 agosto 2026.** Eseguito per intero, compresa la schermata che
> crea un esercizio a mano - che all'inizio non esisteva - e deployato in
> produzione (sei migrazioni, batch 5).
>
> Strada facendo sono cresciute due cose oltre il piano: i cataloghi sono
> diventati **due** (esercizi e alimenti, per le ricette) e ogni voce ha un
> **autore**, perche' senza proprietario non esiste "il mio" e una voce scritta
> male restava nell'app di tutti per sempre. Le decisioni di privacy sono nella
> sezione qui sotto; quella sull'autore e' arrivata dopo ed e' scritta in
> `backend/README.md`.

**Obiettivo:** confrontarsi con **fino a quattro** altre persone insieme, e non
solo su calorie/passi/allenamenti ma anche su quel che si fa in palestra -
volume, ripetizioni, carichi.

**Spec di riferimento:** `docs/superpowers/specs/2026-08-28-kaltrack-design.md`,
sezione 9.2, dove il confronto era fuori scope e per quale ragione.

---

## La cosa da capire prima di scrivere una riga

**I dati della palestra oggi non escono dal telefono.** `shared_stats` ha
quattro colonne - `kcal`, `steps`, `weight_kg`, `workouts` - e "workouts" e' un
conteggio, non un contenuto. Confrontare il volume su panca vuol dire
pubblicare, per ogni giorno, **quali esercizi hai fatto e con quanto carico**.

Non e' un dettaglio di implementazione, e' la parte piu' grossa del lavoro. Fino
a ieri la promessa dell'app era che al server arrivassero i totali e non il
contenuto. Questa funzione la cambia, e va cambiata **esplicitamente**: con un
interruttore suo, spento di serie, e un testo che dica cosa comincia a uscire.

Chi non lo accende non condivide niente di nuovo e non se ne accorge.

## Decisioni prese il 30 agosto 2026

Prese esplicitamente prima di scrivere codice, perche' cambiano cosa esce dal
telefono. Chi le riapre lo faccia sapendo che sono scelte e non default.

1. **`share_gym` e' un interruttore a se'**, spento di serie e indipendente da
   `share_workouts`. Chi oggi condivide il conteggio degli allenamenti non si
   ritrova la palestra accesa: sono due promesse diverse.
2. **La finestra la sceglie l'utente**: 7, 30, 90 giorni o un valore libero,
   default 7. Vive accanto agli altri interruttori, sul server, perche' e' parte
   di cosa si pubblica e non di come e' fatto il telefono.
3. **Il catalogo degli esercizi e' globale.** Un esercizio creato a mano sale sul
   server ed entra nell'elenco di **tutti** gli iscritti, non solo degli amici.
   E' il primo dato dell'app che esce verso chi amico non e', ed e' la ragione
   del Task 4-bis: prima di questo lavoro la frase "non esce niente verso i non
   amici" era vera senza eccezioni.
4. **Finita un'amicizia i dati restano sul server, invisibili.** Li nasconde il
   controllo `isFriend` come per i totali. Si cancellano spegnendo
   l'interruttore, che resta l'unico gesto che cancella davvero.

## Le regole che restano in piedi

Valgono quelle gia' scritte in `src/domain/comparison.ts`, e non si riaprono:

- **il peso non si confronta.** Vale a maggior ragione fra cinque persone.
- **le calorie si affiancano senza vincitore.** Con cinque colonne la tentazione
  di ordinarle e' piu' forte, ed e' la stessa tentazione sbagliata.
- **un numero mancante non e' un ultimo posto.** Chi non ha registrato non e'
  "quello che ha fatto meno".

E una nuova, che vale solo qui:

- **in palestra il confronto e' legittimo.** Volume e carichi sono sport: li' "di
  piu'" vuol dire davvero qualcosa, e una classifica e' quello che uno cerca.
  La differenza con le calorie non e' arbitraria: un carico si allena, un
  fabbisogno no.

## File

- `backend/database/migrations/*_add_gym_to_shared_stats.php` - crea
  **`shared_workouts`**, tabella nuova e non colonne in piu' su `shared_stats`:
  un giorno ha molti esercizi, e un JSON dentro `shared_stats` renderebbe
  impossibile interrogarlo per esercizio.
- `backend/app/Models/SharedWorkout.php`
- `backend/app/Http/Controllers/Api/ComparisonController.php` - **un** endpoint
  che prende N handle e torna i loro dati insieme.
- `backend/app/Http/Resources/PublicProfileResource.php` - il nuovo campo passa
  di qui, come tutti.
- `src/domain/comparison.ts` - da due a N.
- `src/containers/social/` - la schermata a piu' colonne.
- `src/services/shareSync.ts` - pubblica anche la palestra, se acceso.

## Task

### Task 1: la colonna che decide, prima di tutto il resto

- [x] Migrazione: `share_gym` su `users`, `boolean` con default `false`.
- [x] `UpdateProfileRequest` e `ProfileController`: accettarla come le altre
      quattro.
- [x] Estendere `forgetUnsharedStats`: spegnendola, quel che era gia' stato
      pubblicato **si cancella**, esattamente come per le altre.
- [x] Test: spegnere `share_gym` svuota `shared_workouts` di quell'utente.
- [x] Stessa migrazione: `share_window_days` su `users`, intero con default 7.
      Accettare 1..365 e nient'altro: senza un limite superiore un valore
      assurdo diventa "pubblica tutto" senza che nessuno l'abbia scelto.

Prima questa, cosi' non esiste un momento in cui il resto del lavoro puo'
pubblicare qualcosa che nessuno ha acconsentito a pubblicare.

### Task 2: cosa si pubblica di un allenamento

Il minimo che rende il confronto sensato, e nient'altro:

- [x] `shared_workouts`: `user_id`, `date`, `exercise_name`, `sets`,
      `total_reps`, `volume_kg`, `top_weight_kg`.
- [x] **Il nome dell'esercizio come testo**, non l'id: gli id degli esercizi
      sono locali al telefono e due dispositivi non li condividono.
- [x] Nessuna nota, nessun commento, nessuna serie singola. Il dettaglio di un
      allenamento resta sul telefono come il diario.
- [x] `PUT /api/me/workouts` con la stessa forma di `/me/stats`: sostituisce, non
      somma.

### Task 3: da due a N nel dominio

- [x] `buildComparison` diventa `buildMultiComparison(mine, others[], shares[])`.
- [x] Ogni persona porta le proprie condivisioni: nel confronto a cinque, una
      metrica compare se **almeno uno** la condivide, e per gli altri e' un
      trattino. Nascondere l'intera riga perche' uno solo non condivide
      punirebbe gli altri quattro.
- [x] `ahead` diventa una classifica parziale, e resta `null` sulle calorie.
- [x] Test: le stesse sette prove del confronto a due, piu' quelle sul
      comportamento con condivisioni disomogenee.

### Task 4: un endpoint solo per N persone

- [x] `GET /api/comparison?handles=a,b,c,d` - massimo quattro, piu' se stessi.
- [x] Le due regole della privacy si applicano **per ciascuno**: uno che non e'
      amico esce senza numeri, non fa fallire la richiesta.
- [x] Test: chiedendo cinque handle di cui uno non amico, tornano i quattro
      giusti e il quinto senza dati.

### Task 4-bis: il catalogo globale degli esercizi

Questo task **non era nel piano** ed e' stato aggiunto dopo la decisione 3. E'
l'unico punto in cui qualcosa esce verso chi non e' amico, quindi va tenuto
stretto e piccolo.

- [x] `exercises` sul server: `name`, `name_norm`, `muscle_group`, `equipment`.
      Niente `notes`, niente `instructions`, niente `dislike_level`: sono
      giudizi personali su un esercizio, non la sua descrizione.
- [x] `GET /api/exercises` per leggerlo, `POST /api/exercises` per aggiungerne
      uno. Sotto `auth:sanctum` come tutto: il catalogo e' di tutti gli
      iscritti, non del mondo.
- [x] **Deduplica su `name_norm`**, che e' la colonna che l'app ha gia'. Due
      persone che scrivono "Panca Piana" e "panca piana" aggiungono una voce
      sola, altrimenti il catalogo di tutti si riempie di doppioni.
- [x] Chi ha proposto una voce non esce mai: il catalogo non dice **chi** ha
      aggiunto cosa. Sapere che un esercizio l'ha inventato Tizio e' un fatto su
      Tizio, e non serve a nessuno per allenarsi.
- [x] Test: due nomi che differiscono solo per le maiuscole restano una riga; la
      risposta del catalogo non contiene nessun riferimento all'autore.

### Task 5: la schermata

- [x] Selezione: fino a quattro amici, con il limite spiegato e non solo imposto.
- [x] Le colonne scorrono in orizzontale dentro il proprio contenitore: cinque
      colonne di numeri su un telefono non ci stanno, e la pagina non deve
      scorrere di lato per intero.
- [x] Sezione palestra separata da quella dei totali: sono due domande diverse.

### Task 6: dirlo

- [x] Testo dell'interruttore `share_gym`: cosa comincia a uscire, in una frase.
- [x] `backend/README.md`: aggiornare "cosa esce verso gli altri utenti", che
      oggi dice che la palestra non esce. Da quel momento non sara' piu' vero
      per chi ha acceso l'interruttore.
- [x] Sempre nel README: il catalogo esercizi e' la prima eccezione alla frase
      "solo verso amici accettati". Scriverla come eccezione dichiarata, non
      lasciarla scoprire a chi legge il codice.
- [x] Testo, dove si crea un esercizio: dire che il nome finira' nell'elenco di
      tutti. Va detto **prima** di scriverlo, non dopo averlo salvato.
      Fatto in `ExerciseFormSheet`, sopra il campo del nome. Non compare senza
      account: sarebbe un avviso su una cosa che non succede.

## Quel che questo piano NON fa

- Classifiche pubbliche o fra sconosciuti. Solo fra amici accettati, come tutto
  il resto.
- Notifiche del tipo "Marco ti ha superato". Il confronto lo si va a guardare,
  non ti viene a cercare.
- Confronto sulle calorie con un vincitore. Vedi sopra, e non e' negoziabile
  senza riaprire la discussione per intero.
