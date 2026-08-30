# Confronto multiplo e confronto in palestra - Piano

> **Non ancora implementato.** Scritto il 30 agosto 2026, dopo il confronto a due
> (`src/domain/comparison.ts`). Da eseguire quando il lavoro in corso e' chiuso.

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

- [ ] Migrazione: `share_gym` su `users`, `boolean` con default `false`.
- [ ] `UpdateProfileRequest` e `ProfileController`: accettarla come le altre
      quattro.
- [ ] Estendere `forgetUnsharedStats`: spegnendola, quel che era gia' stato
      pubblicato **si cancella**, esattamente come per le altre.
- [ ] Test: spegnere `share_gym` svuota `shared_workouts` di quell'utente.

Prima questa, cosi' non esiste un momento in cui il resto del lavoro puo'
pubblicare qualcosa che nessuno ha acconsentito a pubblicare.

### Task 2: cosa si pubblica di un allenamento

Il minimo che rende il confronto sensato, e nient'altro:

- [ ] `shared_workouts`: `user_id`, `date`, `exercise_name`, `sets`,
      `total_reps`, `volume_kg`, `top_weight_kg`.
- [ ] **Il nome dell'esercizio come testo**, non l'id: gli id degli esercizi
      sono locali al telefono e due dispositivi non li condividono.
- [ ] Nessuna nota, nessun commento, nessuna serie singola. Il dettaglio di un
      allenamento resta sul telefono come il diario.
- [ ] `PUT /api/me/workouts` con la stessa forma di `/me/stats`: sostituisce, non
      somma.

### Task 3: da due a N nel dominio

- [ ] `buildComparison` diventa `buildMultiComparison(mine, others[], shares[])`.
- [ ] Ogni persona porta le proprie condivisioni: nel confronto a cinque, una
      metrica compare se **almeno uno** la condivide, e per gli altri e' un
      trattino. Nascondere l'intera riga perche' uno solo non condivide
      punirebbe gli altri quattro.
- [ ] `ahead` diventa una classifica parziale, e resta `null` sulle calorie.
- [ ] Test: le stesse sette prove del confronto a due, piu' quelle sul
      comportamento con condivisioni disomogenee.

### Task 4: un endpoint solo per N persone

- [ ] `GET /api/comparison?handles=a,b,c,d` - massimo quattro, piu' se stessi.
- [ ] Le due regole della privacy si applicano **per ciascuno**: uno che non e'
      amico esce senza numeri, non fa fallire la richiesta.
- [ ] Test: chiedendo cinque handle di cui uno non amico, tornano i quattro
      giusti e il quinto senza dati.

### Task 5: la schermata

- [ ] Selezione: fino a quattro amici, con il limite spiegato e non solo imposto.
- [ ] Le colonne scorrono in orizzontale dentro il proprio contenitore: cinque
      colonne di numeri su un telefono non ci stanno, e la pagina non deve
      scorrere di lato per intero.
- [ ] Sezione palestra separata da quella dei totali: sono due domande diverse.

### Task 6: dirlo

- [ ] Testo dell'interruttore `share_gym`: cosa comincia a uscire, in una frase.
- [ ] `backend/README.md`: aggiornare "cosa esce verso gli altri utenti", che
      oggi dice che la palestra non esce. Da quel momento non sara' piu' vero
      per chi ha acceso l'interruttore.

## Quel che questo piano NON fa

- Classifiche pubbliche o fra sconosciuti. Solo fra amici accettati, come tutto
  il resto.
- Notifiche del tipo "Marco ti ha superato". Il confronto lo si va a guardare,
  non ti viene a cercare.
- Confronto sulle calorie con un vincitore. Vedi sopra, e non e' negoziabile
  senza riaprire la discussione per intero.
