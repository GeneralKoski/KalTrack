# Gestionale, Fase 3: il lato app

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'app consuma `/api/catalog/*` con `catalog_uid` come identita' stabile,
legge le tassonomie dal server, e smette di promettere che una voce creata a mano
entra subito nell'elenco di tutti.

**Architecture:** Due migrazioni locali (019 `catalog_uid`, 020 tassonomie), un
servizio solo (`src/services/catalogSync.ts`) che sostituisce
`exerciseCatalog.ts` + `foodCatalog.ts`, un client dedicato
(`src/api/catalog.ts`), uno store per le tassonomie
(`src/stores/taxonomyStore.ts`). L'aggancio di una riga e' per `catalog_uid`,
con ricaduta sul nome normalizzato solo per le righe che l'uid non ce l'hanno
ancora. Piu' un'aggiunta minima al server, senza la quale il lato app non puo'
chiudere: `uid` nella risposta di una proposta e binding per `uid` sulle rotte
di scrittura `catalog/*`.

**Tech Stack:** React Native 0.83 / Expo 55 / React 19, TypeScript strict,
expo-sqlite (better-sqlite3 in test), zustand, Jest. Lato server Laravel 12 +
Pest/PHPUnit.

**Spec:** `docs/superpowers/specs/2026-09-07-gestionale-catalogo-design.md`
(§ La propagazione all'app, § Le migrazioni dell'app, § Le tassonomie dinamiche,
§ Cosa cambia nell'app esistente, § Test > App). Stato di partenza:
`.superpowers/sdd/2026-09-07-gestionale-fase-1-server/RIPRENDI-QUI.md`.
Voci aperte: `TODO.md` § 5.1 e § 5.3.

## Global Constraints

Valgono per **ogni** task, non si ripetono nei singoli.

- **Italiano nei commenti e nei nomi di dominio**, come tutto il repository.
  Commenti solo dove la logica non si spiega da se': il "perche'", non il
  "cosa".
- **TypeScript strict, mai `any`.** `npm run typecheck` deve restare pulito.
- **Import assoluti con `@/`**, mai percorsi relativi `../`.
- **Logging solo via `logger`**, mai `console.*`.
- **Ogni testo visibile via `t("chiave")`**, chiavi in **entrambi**
  `src/i18n/locales/it.json` e `en.json`. `src/i18n/keys.test.ts` confronta le
  due lingue nei due versi e fallisce su una chiave presente in una sola.
- **Mai `DELETE FROM` su una tabella sincronizzata.** Si scrive `deleted_at`.
  L'eccezione consentita e' una tabella locale dichiarata in
  `LOCAL_ONLY_TABLES`.
- **Le ore non si confrontano come stringhe**: `Date.parse`, mai `>` fra ISO.
- **Una tabella nuova va dichiarata in un elenco o nell'altro**
  (`SYNCED_TABLES` / `LOCAL_ONLY_TABLES` in `src/services/sync.ts`) **e** in
  `BACKUP_TABLES` (`src/services/backup.ts`): `sync.test.ts` e
  `backup.test.ts` confrontano gli elenchi con `sqlite_master` e falliscono
  su una tabella senza casa.
- **Il telefono resta la fonte di verita'.** Nessuna funzione di questo piano
  puo' sollevare verso una schermata: senza rete e senza account l'app
  funziona identica. Ogni entrata di `catalogSync.ts` incassa i propri errori
  e torna un valore.
- **Un errore che `apiRequest` ha gia' scritto non si riscrive**: si passa da
  `alreadyLogged(error)` (`src/api/errors.ts`) prima di un `logger.warn`.
- **I comandi di verifica** girano dalla root del repository:
  `npm run typecheck`, `npm test`, `npm run lint`. Lato server, da `backend/`:
  `php artisan test`.
- **Niente `git push`, niente deploy.** Ogni task chiude con un commit locale
  su `main` (il ramo corrente), senza trailer di co-autore.

---

## File Structure

**Creati**

| File | Responsabilita' |
|---|---|
| `src/db/migrations/019_catalog_uid.ts` | `catalog_uid` su `exercises` e `foods`, con indice |
| `src/db/migrations/020_taxonomies.ts` | `muscle_groups` e `equipment_types`, seminate dalle costanti |
| `src/db/queries/taxonomies.ts` | Le letture e la riscrittura in blocco delle due tabelle |
| `src/db/queries/taxonomies.test.ts` | Test delle query di tassonomia |
| `src/api/catalog.ts` | Il client di `/api/catalog/*`: tipi e chiamate |
| `src/services/catalogSync.ts` | Il pull incrementale, la finestra, le proposte |
| `src/services/catalogSync.test.ts` | Il grosso dei test di questa fase |
| `src/domain/taxonomy.ts` | La risoluzione pura di un'etichetta da uno slug |
| `src/domain/taxonomy.test.ts` | Test di `taxonomyLabel` |
| `src/stores/taxonomyStore.ts` | Le tassonomie in memoria, con i due risolutori di etichetta |

**Modificati**

| File | Cosa cambia |
|---|---|
| `src/db/migrations/index.ts` | Registra 019 e 020 |
| `src/db/queries/exercises.ts` | `catalogUid` in input, aggancio per uid, scrittura dei soli campi di catalogo, `listAvailableEquipment` dalla tassonomia |
| `src/db/queries/foods.ts` | Gli stessi tre innesti, senza `is_custom` (per gli alimenti il marcatore e' `source`) |
| `src/types/gym.ts` | `MuscleGroup` ed `Equipment` diventano `string`, le costanti restano come seme |
| `src/services/syncMarkers.ts` | I segnaposto del catalogo, in `LOCAL_ONLY_SETTINGS` |
| `src/services/sync.ts` | Le due tabelle nuove in `LOCAL_ONLY_TABLES` |
| `src/services/backup.ts` | Le due tabelle nuove in `BACKUP_TABLES` |
| `src/services/photoStorage.ts` | `CATALOG_PHOTOS_DIR` |
| `src/services/photoSync.ts` | `ensureLocalPhoto` sceglie endpoint e cartella dal percorso |
| `src/App.tsx` | Idrata le tassonomie all'avvio, avvia il pull del catalogo |
| `src/services/syncScheduler.ts` | Chiama `syncCatalog()` accanto a `runSync()` |
| `src/navigation/screens/ExercisesScreen.tsx` | Il bottone chiama `syncCatalog(true)` |
| `src/navigation/screens/FoodsScreen.tsx` | Lo stesso bottone, che non c'era |
| `src/navigation/screens/ExerciseDetailScreen.tsx` | Ritiro della proposta per uid |
| `src/navigation/screens/FoodFormScreen.tsx` | Proposta/correzione/ritiro per uid, testo nuovo |
| `src/containers/gym/ExerciseFormSheet.tsx` | Lo stesso, piu' i selettori dalla tassonomia |
| I 17 punti che chiamano `t(\`gym.muscle.*\`)` / `t(\`gym.equipment.*\`)` | Passano dal risolutore dello store |
| `src/i18n/locales/it.json`, `en.json` | `foods.catalog_notice`, `gym.catalog_notice` |
| `src/i18n/keys.test.ts` | Continua a controllare le costanti del seme, dichiarandolo |
| `CLAUDE.md`, `TODO.md`, `RIPRENDI-QUI.md` | La documentazione di quel che e' cambiato |

**Cancellati**

| File | Perche' |
|---|---|
| `src/services/exerciseCatalog.ts` | Confluisce in `catalogSync.ts` |
| `src/services/exerciseCatalog.test.ts` | I suoi casi rinascono in `catalogSync.test.ts` |
| `src/services/foodCatalog.ts` | Confluisce in `catalogSync.ts` |

**Lato server (aggiunta minima)**

| File | Cosa cambia |
|---|---|
| `backend/routes/api.php` | Binding `{exercise:uid}` / `{food:uid}` sulle scritture `catalog/*` |
| `backend/app/Http/Controllers/Api/ExerciseController.php` | `uid` in `publicShape` |
| `backend/app/Http/Controllers/Api/FoodController.php` | `uid` in `publicShape` |
| `backend/tests/Feature/CatalogWriteTest.php` | Nuovo: le scritture per uid |

---

## Le tre regole di questa fase

Stanno qui e non in un task perche' ogni task le presuppone.

**1. `catalog_uid` e' l'identita'; il nome e' la ricaduta di un giro solo.**
Si cerca per `catalog_uid`. Non trovato, si cerca per `name_norm`: e' il caso
delle righe gia' installate, che al primo pull dopo l'aggiornamento non hanno
ancora l'uid. Agganciata per nome, la riga **riceve l'uid** e dal giro dopo si
aggancia per quello. Non trovata affatto, si inserisce.

**2. Il catalogo scrive solo i campi di catalogo, e solo sulle righe che sono
sue.** Per gli esercizi la riga e' sua se `is_custom = 0`; per gli alimenti se
`source = 'seed'`. `notes`, `dislike_level`, `is_banned`, `usage_count`,
`is_favorite`, `barcode`, `off_id` non li scrive **mai**, su nessuna riga.

Gli alimenti non hanno `is_custom` e non gliene serve uno: `source = 'seed'`
sono esattamente le righe che `catalog:seed` ha pubblicato sul server sotto i
loro id parlanti - la stessa popolazione, non due. `searchMyFoods` filtra gia'
`source != 'seed'`, quindi "In libreria" continua a voler dire quel che vuole
dire. Il pull inserisce con `source = 'seed'` per la stessa ragione.

**3. Una voce tolta dal catalogo non si cancella: cambia padrone.**
`is_custom = 1` per un esercizio, `source = 'user'` per un alimento. **L'uid
resta in colonna**: cancellarlo vorrebbe dire che una voce ripristinata dal
pannello non si riconosce piu' e si duplica, mentre tenendolo il pull la
ritrova, vede che ora e' roba dell'utente, e non la tocca.

---

### Task 1: `catalog_uid` in colonna, e le query che lo usano

Il difetto che questo task chiude: l'app aggancia una voce di catalogo per nome
normalizzato, quindi ogni rinomina fatta dal pannello arriva sui telefoni come
una voce nuova e quella col nome vecchio resta. Una rinomina, un doppione per
telefono.

**Files:**
- Create: `src/db/migrations/019_catalog_uid.ts`
- Modify: `src/db/migrations/index.ts`
- Modify: `src/db/queries/exercises.ts`
- Modify: `src/db/queries/foods.ts`
- Modify: `src/types/gym.ts` (solo `ExerciseRow`)
- Modify: `src/types/nutrition.ts` (solo `FoodRow`)
- Test: `src/db/queries/exercises.test.ts`, `src/db/queries/foods.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `newId()`, `nowIso()` (`src/db/ids`), `normalizeText()`
  (`src/domain/text`), `MIGRATIONS` (`src/db/migrations/index`).
- Produces, e i task 4/5/7 si appoggiano esattamente a questi nomi:
  ```ts
  // src/db/queries/exercises.ts
  export interface CatalogExerciseFields {
    name: string;
    muscleGroup: string;
    secondaryMuscles: string[];
    equipment: string[];
    instructions: string | null;
    photoUri: string | null;
  }
  export function findExerciseByCatalogUid(uid: string): Promise<ExerciseRow | null>
  export function setExerciseCatalogUid(id: string, uid: string): Promise<void>
  export function applyCatalogExercise(id: string, uid: string, fields: CatalogExerciseFields): Promise<void>
  export function detachExerciseFromCatalog(id: string): Promise<void>

  // src/db/queries/foods.ts
  export interface CatalogFoodFields {
    name: string;
    brand: string | null;
    nutrients: Nutrients;
    isLiquid: boolean;
    defaultServingG: number | null;
    servingLabel: string | null;
    imageUri: string | null;
  }
  export function findFoodByCatalogUid(uid: string): Promise<FoodRow | null>
  export function setFoodCatalogUid(id: string, uid: string): Promise<void>
  export function applyCatalogFood(id: string, uid: string, fields: CatalogFoodFields): Promise<void>
  export function detachFoodFromCatalog(id: string): Promise<void>
  ```
  Piu' `catalogUid?: string | null` in `ExerciseInput` e in `FoodInput`, e
  `catalog_uid: string | null` in `ExerciseRow` e in `FoodRow`.

- [ ] **Step 1: Scrivi la migrazione 019**

`src/db/migrations/019_catalog_uid.ts`:

```ts
import type { Migration } from "@/src/db/migrations/types";

/**
 * L'identita' stabile di una voce di catalogo.
 *
 * Fin qui l'app riconosceva una voce dal nome normalizzato, che e' la stessa
 * chiave con cui il server tiene fuori i doppioni. Regge finche' nessuno
 * rinomina: da quando il pannello di amministrazione permette di correggere
 * il nome di una proposta mentre la si approva, la voce rinominata arriva sul
 * telefono come una voce nuova e quella col nome vecchio resta. Una rinomina,
 * un doppione per telefono.
 *
 * `uid` non e' un autoincrement del server e per questo puo' stare in una
 * colonna che si sincronizza: e' una stringa stabile assegnata alla voce, il
 * server e' uno solo, e la stessa voce ha lo stesso uid per chiunque. Un uid
 * che dall'altra parte non esiste non risolve e basta, e la ricaduta sul nome
 * lo ripesca.
 */
export const migration019: Migration = {
  version: 19,
  name: "catalog_uid",
  up: `
ALTER TABLE exercises ADD COLUMN catalog_uid TEXT;
ALTER TABLE foods ADD COLUMN catalog_uid TEXT;
CREATE INDEX idx_exercises_catalog_uid ON exercises (catalog_uid);
CREATE INDEX idx_foods_catalog_uid ON foods (catalog_uid);
`,
};
```

- [ ] **Step 2: Registrala in `src/db/migrations/index.ts`**

Aggiungi l'import accanto agli altri e la voce in fondo a `MIGRATIONS`:

```ts
import { migration019 } from "@/src/db/migrations/019_catalog_uid";
```

```ts
  migration018,
  migration019,
];
```

- [ ] **Step 3: Lancia il test delle migrazioni**

Run: `npm test -- src/db/migrations/migrations.test.ts`
Expected: PASS. `migrations.test.ts` confronta `user_version` con
`MIGRATIONS[MIGRATIONS.length - 1].version`, quindi ora si aspetta 19: se la
registrazione dello step 2 manca, questo test lo dice.

- [ ] **Step 4: Aggiungi la colonna ai due tipi di riga**

In `src/types/gym.ts`, dentro `ExerciseRow`, dopo `photo_uri`:

```ts
  /**
   * L'identita' della voce nel catalogo comune, quando ne ha una.
   *
   * Null per un esercizio che nessuno ha mai proposto e per le righe scritte
   * prima della migrazione 019.
   */
  catalog_uid: string | null;
```

In `src/types/nutrition.ts`, dentro `FoodRow`, dopo `image_uri`:

```ts
  /** Come `exercises.catalog_uid`: l'identita' nel catalogo comune. */
  catalog_uid: string | null;
```

E in `FoodInput`, dopo `imageUri`:

```ts
  catalogUid?: string | null;
```

- [ ] **Step 5: Scrivi i test che ancora falliscono, sugli esercizi**

In coda a `src/db/queries/exercises.test.ts`:

```ts
describe("l'aggancio al catalogo", () => {
  it("ritrova una riga dal suo uid", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });

    const trovato = await findExerciseByCatalogUid("ex-panca-piana-bilanciere");
    expect(trovato?.id).toBe(id);
  });

  /**
   * E' il primo pull dopo l'aggiornamento: la riga c'e', l'uid no, e si
   * aggancia per nome una volta sola.
   */
  it("appiccica l'uid a una riga che non ce l'ha", async () => {
    const id = await createExercise({
      name: "Squat",
      muscleGroup: "quadricipiti",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      isCustom: false,
    });
    expect((await getExercise(id))?.catalog_uid).toBeNull();

    await setExerciseCatalogUid(id, "ex-squat-bilanciere");

    expect((await getExercise(id))?.catalog_uid).toBe("ex-squat-bilanciere");
  });

  /**
   * La regola 2 di questa fase, ed e' quella che il catalogo non deve poter
   * violare: quel che si pensa di un esercizio non e' la sua descrizione.
   */
  it("riscrive la descrizione e non i giudizi personali", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      notes: "spalla destra, attenzione",
      isCustom: false,
    });
    await setExerciseDislike(id, 2);
    await setExerciseBanned(id, true);

    await applyCatalogExercise(id, "ex-panca-piana-bilanciere", {
      name: "Panca piana con bilanciere",
      muscleGroup: "petto",
      secondaryMuscles: ["tricipiti"],
      equipment: ["bilanciere", "panca"],
      instructions: "Scapole addotte, bilanciere a mezzo petto.",
      photoUri: null,
    });

    const riga = await getExercise(id);
    expect(riga?.name).toBe("Panca piana con bilanciere");
    expect(riga?.name_norm).toBe("panca piana con bilanciere");
    expect(riga?.instructions).toBe("Scapole addotte, bilanciere a mezzo petto.");
    expect(riga?.catalog_uid).toBe("ex-panca-piana-bilanciere");
    // Quel che il catalogo non deve aver toccato.
    expect(riga?.notes).toBe("spalla destra, attenzione");
    expect(riga?.dislike_level).toBe(2);
    expect(riga?.is_banned).toBe(1);
  });

  /**
   * La regola 3: tolta dal catalogo, la riga resta e diventa dell'utente.
   * Cancellarla porterebbe via il nome a ogni allenamento passato che la
   * nominava, che e' esattamente quel che `deleteRoutine` evita non
   * cancellando i giorni.
   */
  it("staccata dal catalogo resta, e diventa dell'utente", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });

    await detachExerciseFromCatalog(id);

    const riga = await getExercise(id);
    expect(riga).not.toBeNull();
    expect(riga?.is_custom).toBe(1);
    // L'uid RESTA: senza, una voce ripristinata dal pannello non si
    // riconoscerebbe piu' e il pull ne creerebbe un doppione.
    expect(riga?.catalog_uid).toBe("ex-panca-piana-bilanciere");
  });
});
```

Gli import in cima al file vanno estesi con `findExerciseByCatalogUid`,
`setExerciseCatalogUid`, `applyCatalogExercise`, `detachExerciseFromCatalog`,
`getExercise`, `setExerciseDislike`, `setExerciseBanned` (quelli che non ci
sono gia').

- [ ] **Step 6: Lanciali e verifica che falliscano**

Run: `npm test -- src/db/queries/exercises.test.ts`
Expected: FAIL, con `findExerciseByCatalogUid is not a function` e simili.

- [ ] **Step 7: Implementa le quattro funzioni sugli esercizi**

In `src/db/queries/exercises.ts`, aggiungi `catalogUid` a `ExerciseInput`:

```ts
export interface ExerciseInput {
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment[];
  instructions?: string | null;
  notes?: string | null;
  photoUri?: string | null;
  isCustom?: boolean;
  catalogUid?: string | null;
}
```

In `createExercise`, aggiungi la colonna alla `INSERT` (elenco colonne,
segnaposto e parametri, subito dopo `photo_uri` / `input.photoUri ?? null`):

```ts
    `INSERT INTO exercises (id, name, name_norm, muscle_group, secondary_muscles,
       equipment, is_custom, is_banned, dislike_level, notes, instructions,
       photo_uri, catalog_uid, usage_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 0, ?, ?)`,
```

con `input.catalogUid ?? null` fra `input.photoUri ?? null` e `now`.

E in coda al file:

```ts
/** La riga che porta questo uid di catalogo, cancellate escluse. */
export async function findExerciseByCatalogUid(
  uid: string,
): Promise<ExerciseRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ExerciseRow>(`${SELECT} AND catalog_uid = ?`, [uid]);
}

/**
 * Appiccica l'uid a una riga che non ce l'ha.
 *
 * E' il primo pull dopo l'aggiornamento, quando le righe gia' installate si
 * riconoscono solo dal nome normalizzato: da qui in poi quella riga si
 * aggancia per uid e una rinomina fatta dal pannello la aggiorna invece di
 * duplicarla.
 *
 * `updated_at` NON si tocca: l'uid non e' una modifica dei dati dell'utente,
 * e muoverlo rimanderebbe la riga al server a ogni primo pull di ogni
 * telefono.
 */
export async function setExerciseCatalogUid(
  id: string,
  uid: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE exercises SET catalog_uid = ? WHERE id = ?", [
    uid,
    id,
  ]);
}

/**
 * Riallinea una riga di catalogo ai valori del server.
 *
 * L'elenco delle colonne e' il confine, e va letto come tale: `notes`,
 * `dislike_level`, `is_banned` e `usage_count` NON ci sono e non devono
 * comparirci. Sono giudizi su un esercizio e storia di come lo si usa, non la
 * sua descrizione, e il catalogo non ne sa niente - riscriverli vorrebbe dire
 * che un aggiornamento del catalogo cancella "questo mi fa male alla spalla".
 *
 * `is_custom` non c'e' per il motivo opposto: chi chiama ha gia' verificato
 * che valga 0, e riscriverlo qui sarebbe l'unico modo di riportare sotto il
 * catalogo una riga che l'utente si e' preso.
 */
export async function applyCatalogExercise(
  id: string,
  uid: string,
  fields: CatalogExerciseFields,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE exercises
        SET name = ?, name_norm = ?, muscle_group = ?, secondary_muscles = ?,
            equipment = ?, instructions = ?, photo_uri = ?, catalog_uid = ?,
            updated_at = ?
      WHERE id = ?`,
    [
      fields.name,
      normalizeText(fields.name),
      fields.muscleGroup,
      JSON.stringify(fields.secondaryMuscles),
      JSON.stringify(fields.equipment),
      fields.instructions,
      fields.photoUri,
      uid,
      nowIso(),
      id,
    ],
  );
}

/**
 * La voce non e' piu' in catalogo: la riga resta, e diventa dell'utente.
 *
 * Non si cancella, e non e' una cautela: cancellandola, ogni allenamento
 * passato che la nominava perderebbe il nome di quel che si e' fatto. E'
 * la stessa ragione per cui `deleteRoutine` non cancella i giorni.
 *
 * L'uid resta in colonna. Cancellarlo sembrerebbe piu' pulito e sarebbe un
 * difetto: una voce ripristinata dal pannello non si riconoscerebbe piu' per
 * uid, il nome combacerebbe con una riga che ora e' `is_custom = 1` e quindi
 * intoccabile, e il pull finirebbe per inserirne un doppione.
 */
export async function detachExerciseFromCatalog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE exercises SET is_custom = 1, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}
```

Con il tipo, sopra `createExercise`:

```ts
/** I campi che il catalogo possiede, e nessun altro. */
export interface CatalogExerciseFields {
  name: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string | null;
  photoUri: string | null;
}
```

- [ ] **Step 8: Lanciali e verifica che passino**

Run: `npm test -- src/db/queries/exercises.test.ts`
Expected: PASS.

- [ ] **Step 9: Scrivi i test degli alimenti, i tre casi che differiscono**

In coda a `src/db/queries/foods.test.ts`:

```ts
describe("l'aggancio al catalogo", () => {
  it("ritrova una riga dal suo uid", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });

    expect((await findFoodByCatalogUid("food-riso"))?.id).toBe(id);
  });

  /**
   * `barcode` e `off_id` sono identita' e non contenuto: nessuna schermata ha
   * un campo per modificarli, e il catalogo non ne sa piu' di questo telefono
   * - il codice ce l'ha messo una scansione fatta qui.
   */
  it("riscrive i valori e non il codice a barre", async () => {
    const id = await createFood({
      name: "Yogurt",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 60 },
      source: "seed",
      barcode: "8001234567890",
      offId: "off-yogurt",
    });
    await toggleFoodFavorite(id);

    await applyCatalogFood(id, "food-yogurt", {
      name: "Yogurt bianco",
      brand: "Marca",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 62, protein: 3.5 },
      isLiquid: false,
      defaultServingG: 125,
      servingLabel: "1 vasetto = 125 g",
      imageUri: null,
    });

    const riga = await getFood(id);
    expect(riga?.name).toBe("Yogurt bianco");
    expect(riga?.kcal).toBe(62);
    expect(riga?.catalog_uid).toBe("food-yogurt");
    // Identita' e stato d'uso: non li tocca.
    expect(riga?.barcode).toBe("8001234567890");
    expect(riga?.off_id).toBe("off-yogurt");
    expect(riga?.is_favorite).toBe(1);
  });

  /**
   * Gli alimenti non hanno `is_custom`: il marcatore e' `source`, e staccarsi
   * dal catalogo vuol dire passare da 'seed' a 'user'.
   */
  it("staccata dal catalogo resta, e diventa dell'utente", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });

    await detachFoodFromCatalog(id);

    const riga = await getFood(id);
    expect(riga).not.toBeNull();
    expect(riga?.source).toBe("user");
    expect(riga?.catalog_uid).toBe("food-riso");
  });
});
```

- [ ] **Step 10: Lanciali e verifica che falliscano**

Run: `npm test -- src/db/queries/foods.test.ts`
Expected: FAIL, con `findFoodByCatalogUid is not a function`.

- [ ] **Step 11: Implementa le quattro funzioni sugli alimenti**

In `src/db/queries/foods.ts`, aggiungi `catalog_uid` alla `INSERT` di
`createFood` (colonna, segnaposto e `input.catalogUid ?? null` subito dopo
`image_uri` / `input.imageUri ?? null`), e in coda al file:

```ts
/** I campi che il catalogo possiede. Nota chi NON c'e': `barcode` e `off_id`. */
export interface CatalogFoodFields {
  name: string;
  brand: string | null;
  nutrients: Nutrients;
  isLiquid: boolean;
  defaultServingG: number | null;
  servingLabel: string | null;
  imageUri: string | null;
}

/** La riga che porta questo uid di catalogo, cancellate escluse. */
export async function findFoodByCatalogUid(
  uid: string,
): Promise<FoodRow | null> {
  const db = await getDb();
  return db.getFirstAsync<FoodRow>(`${SELECT_FOOD} AND catalog_uid = ?`, [uid]);
}

/** Come `setExerciseCatalogUid`, e per la stessa ragione: `updated_at` fermo. */
export async function setFoodCatalogUid(
  id: string,
  uid: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE foods SET catalog_uid = ? WHERE id = ?", [uid, id]);
}

/**
 * Riallinea un alimento di catalogo ai valori del server.
 *
 * `barcode`, `off_id`, `is_favorite`, `usage_count` e `source` NON ci sono.
 * I primi due sono identita' e non contenuto - e' la stessa regola per cui
 * `updateFood` non li tocca; gli altri due sono stato d'uso di questo
 * telefono; `source` e' il marcatore che dice di chi e' la riga, e
 * riscriverlo qui sarebbe l'unico modo di riportare sotto il catalogo un
 * alimento che l'utente si e' preso.
 */
export async function applyCatalogFood(
  id: string,
  uid: string,
  fields: CatalogFoodFields,
): Promise<void> {
  const db = await getDb();
  const n = fields.nutrients;
  await db.runAsync(
    `UPDATE foods SET
       name = ?, name_norm = ?, brand = ?,
       kcal = ?, protein = ?, carbs = ?, sugars = ?, fat = ?,
       saturated_fat = ?, fiber = ?, salt = ?,
       is_liquid = ?, default_serving_g = ?, serving_label = ?, image_uri = ?,
       catalog_uid = ?, updated_at = ?
     WHERE id = ?`,
    [
      fields.name,
      normalizeText(fields.name),
      fields.brand,
      n.kcal,
      n.protein,
      n.carbs,
      n.sugars,
      n.fat,
      n.saturatedFat,
      n.fiber,
      n.salt,
      fields.isLiquid ? 1 : 0,
      fields.defaultServingG,
      fields.servingLabel,
      fields.imageUri,
      uid,
      nowIso(),
      id,
    ],
  );
}

/** Come `detachExerciseFromCatalog`: la riga resta, e l'uid con lei. */
export async function detachFoodFromCatalog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE foods SET source = 'user', updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}
```

`Nutrients` va importato da `@/src/types/nutrition` se non lo e' gia'.

- [ ] **Step 12: Lancia i tre cancelli**

Run: `npm test -- src/db/queries` && `npm run typecheck`
Expected: PASS entrambi. Poi `npm test` intero: `sync.test.ts` e
`backup.test.ts` toccano `exercises` e `foods` e devono restare verdi - le
colonne nuove sono nullable, quindi le righe scritte prima non cambiano.

- [ ] **Step 13: Commit**

```bash
git add src/db/migrations/019_catalog_uid.ts src/db/migrations/index.ts \
  src/db/queries/exercises.ts src/db/queries/exercises.test.ts \
  src/db/queries/foods.ts src/db/queries/foods.test.ts \
  src/types/gym.ts src/types/nutrition.ts
git commit -m "$(cat <<'EOF'
feat(catalogo): catalog_uid come identita' stabile di una voce di catalogo

Migrazione 019: `exercises.catalog_uid` e `foods.catalog_uid`, con indice.
Piu' le quattro query per lato che il pull incrementale usera': aggancio per
uid, appiccicamento dell'uid a una riga che non ce l'ha, riallineamento dei
soli campi di catalogo, e distacco di una voce tolta dal catalogo.

Fin qui l'app riconosceva una voce di catalogo dal nome normalizzato. Regge
finche' nessuno rinomina: da quando il pannello di amministrazione permette di
correggere il nome di una proposta mentre la si approva - il primo campo del
modulo di revisione - la voce rinominata arriva sul telefono come una voce
nuova e quella col nome vecchio resta. Una rinomina, un doppione per telefono.

`applyCatalogExercise` e `applyCatalogFood` elencano le colonne che scrivono, e
l'elenco e' il confine: `notes`, `dislike_level`, `is_banned`, `usage_count`,
`is_favorite`, `barcode` e `off_id` non ci sono. Sono giudizi personali, stato
d'uso e identita', non la descrizione di una voce.

Il distacco lascia l'uid in colonna: cancellarlo sembra piu' pulito ed e' un
difetto - una voce ripristinata dal pannello non si riconoscerebbe piu' per
uid, e il pull ne inserirebbe un doppione.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 2: il client di `/api/catalog/*`

**Files:**
- Create: `src/api/catalog.ts`
- Test: nessuno. E' un modulo di sole dichiarazioni e chiamate `apiRequest`,
  e i test che contano sono quelli di `catalogSync.ts` (task 4 e 5), che
  mockano `apiRequest` e verificano percorso e parametri. Un test qui
  ripeterebbe l'implementazione.

**Interfaces:**
- Consumes: `apiRequest` (`src/api/client.ts`), la cui firma e'
  `apiRequest<T>({ method, path, body?, params? })` con
  `params?: Record<string, string>`.
- Produces:
  ```ts
  export interface CatalogCursor { since: string; afterId: number }
  export interface CatalogPage<T> { data: T[]; cursor: CatalogCursor | null; next: CatalogCursor | null }
  export interface CatalogExercise { uid, name, nameNorm, muscleGroup, secondaryMuscles, equipment, instructions, photo, mine, deletedAt }
  export interface CatalogFood { uid, name, nameNorm, brand, barcode, offId, kcal, protein, carbs, sugars, fat, saturatedFat, fiber, salt, isLiquid, defaultServingG, servingLabel, image, mine, deletedAt }
  export interface TaxonomyEntry { slug: string; labelIt: string; labelEn: string; sort: number; deletedAt: string | null }
  export interface Taxonomies { muscleGroups: TaxonomyEntry[]; equipment: TaxonomyEntry[] }
  export function fetchCatalogExercises(cursor?: CatalogCursor): Promise<CatalogPage<CatalogExercise>>
  export function fetchCatalogFoods(cursor?: CatalogCursor): Promise<CatalogPage<CatalogFood>>
  export function fetchTaxonomies(): Promise<Taxonomies>
  export function submitExercise(input: ExerciseSubmission): Promise<{ uid: string } | null>
  export function amendExercise(uid: string, input: ExerciseSubmission): Promise<void>
  export function withdrawExercise(uid: string): Promise<void>
  export function submitFood(input: FoodSubmission): Promise<{ uid: string } | null>
  export function amendFood(uid: string, input: FoodSubmission): Promise<void>
  export function withdrawFood(uid: string): Promise<void>
  ```

- [ ] **Step 1: Scrivi il file**

`src/api/catalog.ts`:

```ts
import { apiRequest } from "@/src/api/client";

/**
 * Il catalogo comune, in pull incrementale.
 *
 * Sostituisce le letture `/exercises` e `/foods` di `social.ts`, che mandavano
 * tutto il catalogo a ogni giro e lasciavano al telefono il compito di
 * inserire quel che gli mancava. La differenza non e' il traffico: quella non
 * poteva aggiornare una riga che il telefono aveva gia', quindi una
 * descrizione corretta dal pannello non arrivava a nessuno.
 *
 * Le rotte vecchie sul server restano vive per i telefoni che non si sono
 * ancora aggiornati. Qui non si chiamano piu'.
 */

/**
 * Dove eravamo arrivati.
 *
 * E' una COPPIA e non un istante, e non e' un raffinamento: Laravel scrive i
 * timestamp al secondo, e `catalog:seed` inserisce duecento righe nello
 * stesso secondo. Con il solo istante, la seconda pagina salterebbe
 * centonovantanove righe (con `>`) o le rimanderebbe per sempre (con `>=`).
 */
export interface CatalogCursor {
  since: string;
  afterId: number;
}

/**
 * Una pagina, con due segnaposto che rispondono a due domande.
 *
 * `cursor` e' DOVE SIAMO ARRIVATI, e c'e' sempre tranne che su una pagina
 * vuota: e' quello che si salva. `next` e' SE C'E' ALTRO DA CHIEDERE, e
 * diventa null appena la pagina non e' piena: e' quello che decide se il
 * ciclo continua. Confonderli era il difetto chiuso nel task 4 - salvando
 * `next`, l'ultima pagina non avanzava il segnaposto e la coda del catalogo
 * si riscaricava a ogni giro.
 */
export interface CatalogPage<T> {
  data: T[];
  cursor: CatalogCursor | null;
  next: CatalogCursor | null;
}

/**
 * Una voce di catalogo.
 *
 * `deletedAt` valorizzato vuol dire che di questa voce arriva SOLO l'identita'
 * e la data: il server non manda il contenuto di una voce cancellata, perche'
 * mandarlo sarebbe un invito a riscriverla. Per questo tutto il resto e'
 * facoltativo nel tipo - la forma del payload lo e' davvero, e fingere che non
 * lo sia sposterebbe il controllo a runtime dove il compilatore non lo vede.
 */
export interface CatalogExercise {
  uid: string;
  deletedAt: string | null;
  name?: string;
  nameNorm?: string;
  muscleGroup?: string;
  /** Elenco separato da virgole, come in colonna sul server. */
  secondaryMuscles?: string | null;
  equipment?: string | null;
  instructions?: string | null;
  /** Il NOME del file, non un percorso: i byte si chiedono a parte. */
  photo?: string | null;
  mine?: boolean;
}

export interface CatalogFood {
  uid: string;
  deletedAt: string | null;
  name?: string;
  nameNorm?: string;
  brand?: string | null;
  barcode?: string | null;
  offId?: string | null;
  kcal?: number;
  protein?: number;
  carbs?: number;
  sugars?: number;
  fat?: number;
  saturatedFat?: number;
  fiber?: number;
  salt?: number;
  isLiquid?: boolean;
  defaultServingG?: number | null;
  servingLabel?: string | null;
  image?: string | null;
  mine?: boolean;
}

/** Un gruppo muscolare o un attrezzo, come li conosce il server. */
export interface TaxonomyEntry {
  slug: string;
  labelIt: string;
  labelEn: string;
  sort: number;
  deletedAt: string | null;
}

export interface Taxonomies {
  muscleGroups: TaxonomyEntry[];
  equipment: TaxonomyEntry[];
}

const pageParams = (cursor?: CatalogCursor): Record<string, string> =>
  cursor
    ? { since: cursor.since, afterId: String(cursor.afterId) }
    : {};

export const fetchCatalogExercises = (cursor?: CatalogCursor) =>
  apiRequest<CatalogPage<CatalogExercise>>({
    method: "get",
    path: "/catalog/exercises",
    params: pageParams(cursor),
  });

export const fetchCatalogFoods = (cursor?: CatalogCursor) =>
  apiRequest<CatalogPage<CatalogFood>>({
    method: "get",
    path: "/catalog/foods",
    params: pageParams(cursor),
  });

/**
 * Le tassonomie escono intere a ogni chiamata, cancellate comprese.
 *
 * Ventitre' righe in tutto: un cursore su ventitre' righe e' complessita' che
 * non compra niente. Le cancellate escono con la loro data invece di sparire,
 * perche' sul telefono ci sono esercizi che nominano quello slug in colonna.
 */
export const fetchTaxonomies = () =>
  apiRequest<Taxonomies>({ method: "get", path: "/catalog/taxonomies" });

export interface ExerciseSubmission {
  name: string;
  muscleGroup: string;
  secondaryMuscles?: string | null;
  equipment?: string | null;
}

export interface FoodSubmission {
  name: string;
  brand?: string | null;
  kcal: number;
  protein?: number;
  carbs?: number;
  sugars?: number;
  fat?: number;
  saturatedFat?: number;
  fiber?: number;
  salt?: number;
  isLiquid?: boolean;
  defaultServingG?: number | null;
  servingLabel?: string | null;
}

/**
 * Propone una voce al catalogo.
 *
 * Torna l'uid da salvare in colonna, o **null**: il server risponde `{ ok:
 * true }` senza `data` quando il nome combacia con una voce che qualcuno ha
 * tolto dal catalogo, e in quel caso non ha creato niente da agganciare. Un
 * `null` non e' un errore, e' "non c'e' un uid perche' non c'e' una proposta".
 */
export const submitExercise = (input: ExerciseSubmission) =>
  apiRequest<{ data?: { uid: string } }>({
    method: "post",
    path: "/catalog/exercises",
    body: input,
  }).then((r) => (r.data ? { uid: r.data.uid } : null));

/**
 * Corregge la propria proposta, per uid.
 *
 * Il server accetta solo le proprie e solo finche' sono in attesa: da
 * pubblicata in poi la voce e' nell'app di tutti, e correggerla la
 * cambierebbe a chiunque. La copia dell'autore resta sul telefono.
 */
export const amendExercise = (uid: string, input: ExerciseSubmission) =>
  apiRequest<{ data: { uid: string } }>({
    method: "patch",
    path: `/catalog/exercises/${encodeURIComponent(uid)}`,
    body: input,
  }).then(() => undefined);

export const withdrawExercise = (uid: string) =>
  apiRequest<{ ok: boolean }>({
    method: "delete",
    path: `/catalog/exercises/${encodeURIComponent(uid)}`,
  }).then(() => undefined);

export const submitFood = (input: FoodSubmission) =>
  apiRequest<{ data?: { uid: string } }>({
    method: "post",
    path: "/catalog/foods",
    body: input,
  }).then((r) => (r.data ? { uid: r.data.uid } : null));

export const amendFood = (uid: string, input: FoodSubmission) =>
  apiRequest<{ data: { uid: string } }>({
    method: "patch",
    path: `/catalog/foods/${encodeURIComponent(uid)}`,
    body: input,
  }).then(() => undefined);

export const withdrawFood = (uid: string) =>
  apiRequest<{ ok: boolean }>({
    method: "delete",
    path: `/catalog/foods/${encodeURIComponent(uid)}`,
  }).then(() => undefined);
```

- [ ] **Step 2: Verifica che compili**

Run: `npm run typecheck`
Expected: PASS. Nessuno lo importa ancora, quindi ESLint potrebbe segnalare il
modulo come non usato: `npm run lint` deve comunque restare pulito - se
segnala, il task 4 lo consuma subito dopo e la segnalazione sparisce da se',
ma **non** si mette un `eslint-disable` per zittirla.

- [ ] **Step 3: Commit**

```bash
git add src/api/catalog.ts
git commit -m "$(cat <<'EOF'
feat(catalogo): il client di /api/catalog/*

Le letture incrementali (esercizi, alimenti, tassonomie) e le tre scritture
per uid di una propria proposta. Le rotte vecchie di `social.ts` non si
chiamano piu' da qui, e restano vive sul server per i telefoni che non si sono
ancora aggiornati.

Il cursore e' una coppia (istante, id) e non un istante: Laravel scrive i
timestamp al secondo e `catalog:seed` inserisce duecento righe nello stesso
secondo, quindi con il solo istante la seconda pagina salterebbe
centonovantanove righe o le rimanderebbe per sempre.

`submitExercise` e `submitFood` tornano `null` e non sollevano quando il
server risponde senza `data`: e' il caso del nome che combacia con una voce
tolta dal catalogo, dove non c'e' una proposta da agganciare. Non e' un
errore.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 3: le scritture del catalogo si indirizzano per uid (server)

E' l'unica aggiunta lato server di questa fase, e senza di lei il lato app non
puo' chiudere. Oggi `POST /api/catalog/exercises` risponde con `publicShape`,
che porta `id` e **non** `uid`: il telefono non ha modo di sapere quale uid
salvare in colonna per la proposta che ha appena fatto. E `PATCH`/`DELETE
/api/catalog/exercises/{exercise}` risolvono per chiave primaria, mentre la
spec le dichiara `{uid}` (§ Le API): con l'id, il telefono dovrebbe tenersi in
colonna un autoincrement del server, che e' proprio la cosa che `CLAUDE.md`
§ La ricerca di un alimento vieta.

Le rotte vecchie `/api/exercises/{id}` e `/api/foods/{id}` **non si toccano**:
restano indirizzate per id e continuano a servire i telefoni con la build di
ieri. Nessun test esistente chiama le rotte `catalog/*` in scrittura
(verificato: `grep -rn "catalog/exercises/\|catalog/foods/" backend/tests`
non trova niente), quindi il cambio di binding non ne rompe nessuno.

**Files:**
- Modify: `backend/routes/api.php` (le sei rotte di scrittura `catalog/*`)
- Modify: `backend/app/Http/Controllers/Api/ExerciseController.php`
  (`publicShape`)
- Modify: `backend/app/Http/Controllers/Api/FoodController.php`
  (`publicShape`)
- Test: `backend/tests/Feature/CatalogWriteTest.php` (nuovo)

**Interfaces:**
- Consumes: `Exercise`, `Food` (con `uid` gia' fillable e unique dalla Fase 1),
  `soloLaPropriaProposta` (privata, gia' nei due controller).
- Produces, per il task 7: `POST /api/catalog/{exercises,foods}` risponde
  `{ data: { uid, id, name, ... } }`; `PATCH`/`DELETE
  /api/catalog/{exercises,foods}/{uid}` accettano l'uid nel percorso.

- [ ] **Step 1: Scrivi il test, che ancora fallisce**

`backend/tests/Feature/CatalogWriteTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Food;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Le scritture del catalogo si indirizzano per `uid`.
 *
 * Il telefono deve poter correggere e ritirare la propria proposta senza
 * tenersi in colonna un autoincrement di questo server: `uid` e' una stringa
 * stabile assegnata alla voce, e la stessa voce ha lo stesso uid per
 * chiunque. Le rotte vecchie `/api/exercises/{id}` restano per id.
 */
class CatalogWriteTest extends TestCase
{
    use RefreshDatabase;

    private function esercizio(array $over = []): array
    {
        return array_merge([
            'name' => 'Panca piana',
            'muscleGroup' => 'petto',
            'secondaryMuscles' => 'tricipiti',
            'equipment' => 'bilanciere,panca',
        ], $over);
    }

    /**
     * Senza `uid` nella risposta il telefono non sa cosa salvare in colonna, e
     * alla correzione successiva ricadrebbe sul nome - cioe' esattamente il
     * difetto che l'uid esiste per chiudere.
     */
    public function test_una_proposta_risponde_col_proprio_uid(): void
    {
        $anna = User::factory()->create();

        $risposta = $this->actingAs($anna)
            ->postJson('/api/catalog/exercises', $this->esercizio())
            ->assertOk();

        $uid = $risposta->json('data.uid');
        $this->assertNotEmpty($uid);
        $this->assertSame($uid, Exercise::where('name_norm', 'panca piana')->first()->uid);
    }

    public function test_si_corregge_la_propria_proposta_per_uid(): void
    {
        $anna = User::factory()->create();
        $uid = $this->actingAs($anna)
            ->postJson('/api/catalog/exercises', $this->esercizio())
            ->json('data.uid');

        $this->actingAs($anna)
            ->patchJson("/api/catalog/exercises/{$uid}", $this->esercizio([
                'name' => 'Panca piana con bilanciere',
            ]))
            ->assertOk()
            ->assertJsonPath('data.uid', $uid);

        $this->assertSame(
            'Panca piana con bilanciere',
            Exercise::where('uid', $uid)->first()->name,
        );
    }

    public function test_si_ritira_la_propria_proposta_per_uid(): void
    {
        $anna = User::factory()->create();
        $uid = $this->actingAs($anna)
            ->postJson('/api/catalog/exercises', $this->esercizio())
            ->json('data.uid');

        $this->actingAs($anna)
            ->deleteJson("/api/catalog/exercises/{$uid}")
            ->assertOk();

        $this->assertSoftDeleted('exercises', ['uid' => $uid]);
    }

    /** La stessa regola di prima, che il binding non deve aver allentato. */
    public function test_la_proposta_di_un_altro_resta_403(): void
    {
        $anna = User::factory()->create();
        $bea = User::factory()->create();
        $uid = $this->actingAs($anna)
            ->postJson('/api/catalog/exercises', $this->esercizio())
            ->json('data.uid');

        $this->actingAs($bea)
            ->patchJson("/api/catalog/exercises/{$uid}", $this->esercizio())
            ->assertStatus(403);
        $this->actingAs($bea)
            ->deleteJson("/api/catalog/exercises/{$uid}")
            ->assertStatus(403);
    }

    /** Un uid che non esiste e' un 404, non un 500 da binding mancato. */
    public function test_un_uid_sconosciuto_e_un_404(): void
    {
        $anna = User::factory()->create();

        $this->actingAs($anna)
            ->patchJson('/api/catalog/exercises/non-esiste', $this->esercizio())
            ->assertNotFound();
    }

    public function test_gli_alimenti_seguono_le_stesse_tre_regole(): void
    {
        $anna = User::factory()->create();
        $alimento = ['name' => 'Riso', 'kcal' => 358];

        $uid = $this->actingAs($anna)
            ->postJson('/api/catalog/foods', $alimento)
            ->assertOk()
            ->json('data.uid');
        $this->assertNotEmpty($uid);

        $this->actingAs($anna)
            ->patchJson("/api/catalog/foods/{$uid}", ['name' => 'Riso bianco', 'kcal' => 358])
            ->assertOk();
        $this->assertSame('Riso bianco', Food::where('uid', $uid)->first()->name);

        $this->actingAs($anna)->deleteJson("/api/catalog/foods/{$uid}")->assertOk();
        $this->assertSoftDeleted('foods', ['uid' => $uid]);
    }

    /** Le rotte vecchie restano per id: un telefono non aggiornato le usa. */
    public function test_le_rotte_vecchie_restano_indirizzate_per_id(): void
    {
        $anna = User::factory()->create();
        $this->actingAs($anna)->postJson('/api/exercises', $this->esercizio());
        $voce = Exercise::where('name_norm', 'panca piana')->first();

        $this->actingAs($anna)
            ->patchJson("/api/exercises/{$voce->id}", $this->esercizio([
                'name' => 'Panca',
            ]))
            ->assertOk();
    }
}
```

- [ ] **Step 2: Lancialo e verifica che fallisca**

Run (da `backend/`): `php artisan test --filter=CatalogWriteTest`
Expected: FAIL. `data.uid` e' null nel primo test, e i due seguenti danno 404
perche' il percorso porta un uid dove il binding aspetta un id.

- [ ] **Step 3: Aggiungi `uid` alle due `publicShape`**

In `ExerciseController::publicShape`, come prima chiave, sopra `'id'`:

```php
            /*
             * L'identita' stabile, ed e' quella che il telefono salva in
             * colonna: `id` e' un autoincrement di QUESTO server, mentre
             * `uid` e' una stringa assegnata alla voce e uguale per chiunque.
             * Entrambi escono perche' entrambi indirizzano una scrittura: le
             * rotte `catalog/*` per uid, quelle vecchie per id.
             */
            'uid' => $exercise->uid,
            'id' => $exercise->id,
```

La stessa aggiunta in `FoodController::publicShape`, con il commento
abbreviato a un rimando (`// Vedi ExerciseController::publicShape.`).

- [ ] **Step 4: Cambia il binding delle sei rotte di scrittura**

In `backend/routes/api.php`, il blocco `catalog/*` in scrittura diventa:

```php
    /*
     * Le scritture si indirizzano per `uid`, le rotte vecchie per id.
     *
     * Non e' simmetria mancata: il telefono tiene `catalog_uid` in una colonna
     * che si sincronizza, e un autoincrement di questo server in una colonna
     * che viaggia punterebbe alla riga sbagliata sul secondo dispositivo.
     * `uid` invece e' una stringa stabile, uguale per chiunque, e un uid che
     * dall'altra parte non esiste non risolve e basta.
     */
    Route::post('catalog/exercises', [ExerciseController::class, 'store'])
        ->middleware('throttle:30,1');
    Route::patch('catalog/exercises/{exercise:uid}', [ExerciseController::class, 'update']);
    Route::delete('catalog/exercises/{exercise:uid}', [ExerciseController::class, 'destroy']);

    Route::post('catalog/foods', [FoodController::class, 'store'])
        ->middleware('throttle:60,1');
    Route::patch('catalog/foods/{food:uid}', [FoodController::class, 'update']);
    Route::delete('catalog/foods/{food:uid}', [FoodController::class, 'destroy']);
```

- [ ] **Step 5: Lancia il test e verifica che passi**

Run (da `backend/`): `php artisan test --filter=CatalogWriteTest`
Expected: PASS, sette test.

- [ ] **Step 6: Lancia la suite intera del server**

Run (da `backend/`): `php artisan test`
Expected: PASS. `uid` aggiunto a `publicShape` e' una chiave in piu' in una
risposta: gli `assertJsonPath` esistenti non se ne accorgono, un eventuale
`assertExactJson` si'. Se uno fallisce, si aggiunge la chiave all'atteso -
non si toglie dalla risposta.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/api.php \
  backend/app/Http/Controllers/Api/ExerciseController.php \
  backend/app/Http/Controllers/Api/FoodController.php \
  backend/tests/Feature/CatalogWriteTest.php
git commit -m "$(cat <<'EOF'
feat(catalogo): le scritture di catalog/* si indirizzano per uid

`publicShape` porta ora anche `uid`, e le sei rotte di scrittura
`catalog/*` usano il binding `{exercise:uid}` / `{food:uid}`. Le rotte
vecchie `/api/exercises/{id}` e `/api/foods/{id}` restano indirizzate per id
per i telefoni con la build di ieri.

Senza questo, il lato app non si chiude: il telefono deve tenersi in colonna
l'identita' della propria proposta per poterla correggere, e `catalog_uid` sta
su una tabella che si sincronizza. Un autoincrement di questo server in una
colonna che viaggia punterebbe alla riga sbagliata sul secondo dispositivo;
`uid` e' una stringa stabile e uguale per chiunque, e un uid che dall'altra
parte non esiste non risolve e basta.

La spec dichiarava `PATCH /api/catalog/exercises/{uid}` dalla Fase 1: era il
binding a non seguirla.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 4: il cursore torna anche su una pagina non piena (server)

Il secondo e ultimo innesto lato server, e senza di lui il pull incrementale
non avanza mai.

`CatalogController::pull` torna `next` **solo quando la pagina e' piena**
(`$righe->count() === $limit`), che e' la convenzione giusta per "c'e' altro da
chiedere". Ma il telefono non ha nessun altro modo di sapere dove e' arrivato:
di una voce escono `uid`, i campi e `deletedAt`, e **non** `updatedAt`; di un
tombstone escono soltanto `uid` e `deletedAt`. Quindi con l'ultima pagina - che
per definizione non e' piena - il telefono resta col cursore della penultima, e
al pull successivo si rifa' la coda del catalogo. Ogni volta, per sempre.

Con 393 voci e pagine da 200 vuol dire riscaricare 193 righe a ogni giro, e
riapplicarle: e' idempotente, quindi non si romperebbe niente e nessuno se ne
accorgerebbe - che e' il modo in cui questi difetti campano per mesi.

`next` **non cambia semantica**: `CatalogPullTest` cicla su `next !== null` e
deve continuare a passare. Si aggiunge un campo accanto.

**Files:**
- Modify: `backend/app/Http/Controllers/Api/CatalogController.php` (il solo
  `return` di `pull`, piu' il commento che spiega i due campi)
- Test: `backend/tests/Feature/CatalogPullTest.php`

**Interfaces:**
- Produces: la risposta di `GET /api/catalog/{exercises,foods}` porta
  `cursor: { since, afterId } | null` accanto a `next`. `cursor` e' null solo
  su una pagina **vuota**; `next` resta null appena la pagina non e' piena.

- [ ] **Step 1: Scrivi i due test, che ancora falliscono**

In coda a `backend/tests/Feature/CatalogPullTest.php`:

```php
    /**
     * Il difetto che questo test blocca: con `next` come unico segnaposto, il
     * telefono non sa dove e' arrivato quando la pagina non e' piena - e
     * l'ultima pagina non lo e' mai. Riscaricava la coda del catalogo a ogni
     * giro, per sempre, senza che niente lo dicesse.
     */
    public function test_il_cursore_torna_anche_quando_non_c_e_altro(): void
    {
        $anna = User::factory()->create();
        $voce = Exercise::factory()->create(['status' => 'published']);

        $risposta = $this->actingAs($anna)
            ->getJson('/api/catalog/exercises')
            ->assertOk();

        // Non c'e' altro da chiedere...
        $this->assertNull($risposta->json('next'));
        // ...ma dove siamo arrivati si sa comunque.
        $this->assertSame(
            $voce->updated_at->toIso8601String(),
            $risposta->json('cursor.since'),
        );
        $this->assertSame($voce->id, $risposta->json('cursor.afterId'));
    }

    /** Su una pagina vuota non c'e' nessuna posizione da dichiarare. */
    public function test_una_pagina_vuota_non_ha_cursore(): void
    {
        $anna = User::factory()->create();

        $this->actingAs($anna)
            ->getJson('/api/catalog/exercises')
            ->assertOk()
            ->assertJsonPath('cursor', null)
            ->assertJsonPath('next', null);
    }
```

Se `Exercise::factory()` non esiste, si crea la voce con `Exercise::create([...])`
come fanno gli altri test dello stesso file - si copi da li' invece di
introdurre una factory nuova.

- [ ] **Step 2: Lanciali e verifica che falliscano**

Run (da `backend/`): `php artisan test --filter=CatalogPullTest`
Expected: FAIL sui due nuovi, `cursor.since` e' null; gli altri passano.

- [ ] **Step 3: Aggiungi il campo**

In `CatalogController::pull`, il `return` finale diventa:

```php
        /*
         * Due campi e non uno, e la differenza e' la domanda a cui rispondono.
         *
         * `cursor` e' DOVE SIAMO ARRIVATI, e c'e' sempre tranne che su una
         * pagina vuota. `next` e' SE C'E' ALTRO DA CHIEDERE, e sparisce
         * appena la pagina non e' piena.
         *
         * Con `next` da solo il telefono non sapeva dove fosse arrivato
         * quando la pagina non era piena - e l'ultima pagina non lo e' mai:
         * di una voce non esce `updated_at`, e di un tombstone escono solo
         * `uid` e `deletedAt`, quindi la posizione non e' ricavabile dal
         * contenuto. Il risultato era la coda del catalogo riscaricata e
         * riapplicata a ogni giro, in silenzio perche' idempotente.
         */
        $ultima = $righe->last();
        $posizione = $ultima === null ? null : [
            'since' => $ultima->updated_at->toIso8601String(),
            'afterId' => $ultima->id,
        ];

        return response()->json([
            'data' => $righe->map(function (Model $riga) use ($forma, $userId) {
                // ... invariato ...
            }),
            'cursor' => $posizione,
            'next' => $righe->count() === $limit ? $posizione : null,
        ]);
```

Il corpo della `map` non si tocca.

- [ ] **Step 4: Lancia i test e la suite intera**

Run (da `backend/`): `php artisan test`
Expected: PASS. `next` conserva la semantica, quindi il ciclo di
`test_il_cursore_non_salta_righe_con_lo_stesso_istante` continua a terminare
dove terminava.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/Api/CatalogController.php \
  backend/tests/Feature/CatalogPullTest.php
git commit -m "$(cat <<'EOF'
fix(catalogo): il pull dichiara dove e' arrivato anche senza altro da dare

La risposta porta ora `cursor` accanto a `next`. `cursor` dice dove siamo
arrivati e c'e' sempre tranne che su una pagina vuota; `next` dice se c'e'
altro da chiedere e resta null appena la pagina non e' piena. La semantica di
`next` non cambia.

Con `next` come unico segnaposto il telefono non aveva modo di sapere dove
fosse arrivato quando la pagina non era piena - e l'ultima pagina non lo e'
mai. Di una voce non esce `updated_at` e di un tombstone escono solo `uid` e
`deletedAt`, quindi la posizione non e' ricavabile dal contenuto: il telefono
restava col cursore della penultima pagina e riscaricava la coda del catalogo
a ogni giro. Idempotente, quindi in silenzio.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 5: le foto del catalogo hanno una cartella loro

Il pull scrive in `exercises.photo_uri` il percorso della foto **prima** che i
byte siano arrivati, e i byte li chiede `SyncedPhoto` quando la foto si guarda:
il download e' pigro e non trattiene il pull, che e' l'unico modo in cui un
catalogo con duecento immagini non tiene ferma la palestra al primo avvio. Nel
frattempo si vede il segnaposto, che e' quel che `SyncedPhoto` esiste per fare.

Perche' una cartella dedicata e non `PHOTOS_DIR`, che tre funzioni gia'
frequentano:

- `uploadPendingPhotos` manda al server **tutto** quel che trova in
  `PHOTOS_DIR`. Una foto di catalogo appena scaricata sarebbe ricaricata come
  foto personale dell'utente, in `images/{utente}/`: traffico inutile su
  un'immagine che il server ha gia', e una copia per utente di una foto che e'
  comune a tutti.
- `collectOrphanPhotos` cancella da `localPathOf(name)`, cioe' da
  `PHOTOS_DIR`: fuori da li' non le tocca, e va bene cosi' - una foto di
  catalogo non e' orfana perche' un esercizio e' stato cancellato, e' ancora
  la foto di quella voce per tutti gli altri.

Nessuna delle due funzioni cambia. E' la separazione delle cartelle a renderle
giuste senza toccarle.

**Files:**
- Modify: `src/services/photoStorage.ts` (`CATALOG_PHOTOS_DIR`)
- Modify: `src/services/photoSync.ts` (`ensureLocalPhoto`)
- Test: `src/services/photoSync.test.ts`

**Interfaces:**
- Consumes: `PHOTOS_DIR` (`src/services/photoStorage.ts`), `nameOf`,
  `localPathOf` (`src/services/photoSync.ts`), `API_URL`, `hasBackend`.
- Produces, per il task 6 e il task 7:
  ```ts
  // src/services/photoStorage.ts
  export const CATALOG_PHOTOS_DIR: string;
  // src/services/photoSync.ts
  export const catalogPhotoPath: (name: string) => string;
  ```
  E `ensureLocalPhoto(uri)` che, su un uri sotto `CATALOG_PHOTOS_DIR`, scarica
  da `/catalog/images/{name}` invece che da `/images/{name}`.

- [ ] **Step 1: Scrivi i test, che ancora falliscono**

In coda a `src/services/photoSync.test.ts`. Il file mocka gia'
`expo-file-system/legacy` e `@/src/api/config`, e le chiamate si osservano da
`fs` (`const fs = FileSystem as jest.Mocked<typeof FileSystem>`): si usi
quello, non si introduca un secondo modo. Gli import in cima vanno estesi con
`catalogPhotoPath` da `@/src/services/photoSync` e `PHOTOS_DIR` da
`@/src/services/photoStorage`.

```ts
describe("le foto del catalogo", () => {
  /**
   * La cartella decide l'endpoint, e non e' una scorciatoia: una foto di
   * catalogo e' comune a tutti gli iscritti e vive in
   * `storage/app/private/catalog/`, mentre `/images/{name}` serve i file di
   * un utente. Chiedere una foto di catalogo a `/images` e' un 404 sicuro, e
   * il segnaposto resterebbe per sempre.
   */
  it("scarica da /catalog/images quando la foto e' di catalogo", async () => {
    const uri = catalogPhotoPath("ex-panca.jpg");
    fs.getInfoAsync.mockResolvedValue({ exists: false });
    fs.downloadAsync.mockResolvedValue({ status: 200 });

    expect(await ensureLocalPhoto(uri)).toBe(uri);

    expect(fs.downloadAsync).toHaveBeenCalledWith(
      "https://esempio.tld/api/catalog/images/ex-panca.jpg",
      uri,
      expect.objectContaining({
        headers: { Authorization: "Bearer token-valido" },
      }),
    );
  });

  it("una foto dell'utente continua a passare da /images", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false });
    fs.downloadAsync.mockResolvedValue({ status: 200 });

    await ensureLocalPhoto(`${PHOTOS_DIR}/recipe-1.jpg`);

    expect(fs.downloadAsync).toHaveBeenCalledWith(
      "https://esempio.tld/api/images/recipe-1.jpg",
      `${PHOTOS_DIR}/recipe-1.jpg`,
      expect.anything(),
    );
  });

  /**
   * Il pull scrive il percorso prima che i byte ci siano: la foto gia' qui non
   * deve costare una richiesta a ogni disegno.
   */
  it("non chiede niente se la foto di catalogo e' gia' qui", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true });

    const uri = catalogPhotoPath("ex-panca.jpg");
    expect(await ensureLocalPhoto(uri)).toBe(uri);
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lanciali e verifica che falliscano**

Run: `npm test -- src/services/photoSync.test.ts`
Expected: FAIL, `catalogPhotoPath is not a function`.

- [ ] **Step 3: Dichiara la cartella**

In `src/services/photoStorage.ts`, accanto a `PHOTOS_DIR`:

```ts
/**
 * Le foto del catalogo comune, separate da quelle dell'utente.
 *
 * La separazione non e' ordine: `uploadPendingPhotos` manda al server tutto
 * quel che trova in `PHOTOS_DIR`, e una foto di catalogo appena scaricata
 * finirebbe ricaricata come foto personale in `images/{utente}` - una copia
 * per utente di un'immagine che e' comune a tutti, che il server ha gia'.
 * `collectOrphanPhotos` cancella dalla stessa cartella, e una foto di
 * catalogo non e' orfana perche' un esercizio e' stato tolto: e' ancora la
 * foto di quella voce per tutti gli altri.
 *
 * Nessuna delle due funzioni ha un caso speciale. E' la cartella a renderle
 * giuste.
 */
export const CATALOG_PHOTOS_DIR = `${FileSystem.documentDirectory}catalog-photos`;
```

- [ ] **Step 4: Insegna a `ensureLocalPhoto` da dove scaricare**

In `src/services/photoSync.ts`, importa `CATALOG_PHOTOS_DIR` accanto a
`PHOTOS_DIR` e aggiungi, sotto `localPathOf`:

```ts
/** Dove vive, o dovrebbe vivere, una foto del catalogo su QUESTO telefono. */
export const catalogPhotoPath = (name: string): string =>
  `${CATALOG_PHOTOS_DIR}/${name}`;

const isCatalogPhoto = (uri: string): boolean =>
  uri.startsWith(CATALOG_PHOTOS_DIR);
```

e riscrivi il corpo di `ensureLocalPhoto` cambiando **solo** la scelta di
percorso ed endpoint - il resto (il controllo del token, il 404 normale, la
cancellazione del file scritto a meta') resta identico:

```ts
export async function ensureLocalPhoto(uri: string): Promise<string | null> {
  if (!uri) return null;

  const name = nameOf(uri);
  /*
   * La cartella dell'uri decide dove cercare e a chi chiedere.
   *
   * Una foto di catalogo sta in `storage/app/private/catalog/` sul server, non
   * sotto `images/{utente}`: e' comune a tutti gli iscritti, e il percorso per
   * utente la renderebbe di uno solo. Chiederla a `/images` sarebbe un 404
   * garantito, e il segnaposto resterebbe per sempre senza che niente lo
   * dicesse.
   */
  const catalogo = isCatalogPhoto(uri);
  const local = catalogo ? catalogPhotoPath(name) : localPathOf(name);
  const endpoint = catalogo
    ? `${API_URL}/catalog/images/${encodeURIComponent(name)}`
    : `${API_URL}/images/${encodeURIComponent(name)}`;

  if (await exists(local)) return local;
  if (!hasBackend()) return null;

  const token = useAccountStore.getState().token;
  if (!token) return null;

  try {
    const result = await FileSystem.downloadAsync(endpoint, local, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (result.status !== 200) {
      // Un 404 e' normale: il telefono d'origine non l'ha ancora caricata, o
      // il gestionale non ha ancora messo la foto su quella voce di catalogo.
      await FileSystem.deleteAsync(local, { idempotent: true });
      return null;
    }
    return local;
  } catch (error) {
    logger.warn(`[foto] scaricamento non riuscito: ${name}`, error);
    await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
    return null;
  }
}
```

`FileSystem.downloadAsync` non crea la cartella di destinazione: se i test o
l'emulatore mostrano un fallimento al primo scaricamento di una foto di
catalogo, si aggiunge `await FileSystem.makeDirectoryAsync(CATALOG_PHOTOS_DIR,
{ intermediates: true }).catch(() => {})` **prima** del download - e' la
stessa `ensureDir()` che `photoStorage.ts` fa per `PHOTOS_DIR`, che qui non
passa da nessuno perche' nessuno ci scrive con `persistPhoto`.

- [ ] **Step 5: Lancia i test**

Run: `npm test -- src/services/photoSync.test.ts` && `npm run typecheck`
Expected: PASS entrambi. I test esistenti del file coprono le foto utente e
devono restare verdi: se uno di loro cambia comportamento, la scelta di
percorso e' scritta al rovescio.

- [ ] **Step 6: Commit**

```bash
git add src/services/photoStorage.ts src/services/photoSync.ts \
  src/services/photoSync.test.ts
git commit -m "$(cat <<'EOF'
feat(catalogo): le foto del catalogo hanno una cartella e un endpoint loro

`CATALOG_PHOTOS_DIR` accanto a `PHOTOS_DIR`, e `ensureLocalPhoto` sceglie
percorso ed endpoint dalla cartella dell'uri: `/catalog/images/{name}` per una
foto di catalogo, `/images/{name}` per una foto dell'utente.

La separazione delle cartelle e' quel che rende giuste due funzioni senza
toccarle. `uploadPendingPhotos` manda al server tutto quel che trova in
`PHOTOS_DIR`, e una foto di catalogo appena scaricata finirebbe ricaricata
come foto personale in `images/{utente}`: una copia per utente di un'immagine
comune a tutti, che il server ha gia'. `collectOrphanPhotos` cancella dalla
stessa cartella, e una foto di catalogo non e' orfana perche' un esercizio e'
stato tolto - e' ancora la foto di quella voce per tutti gli altri.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 6: il pull degli esercizi

Il cuore della fase. Le tre regole in cima al piano si realizzano qui, e i
test le enunciano una per una.

**Files:**
- Create: `src/services/catalogSync.ts`
- Create: `src/services/catalogSync.test.ts`
- Modify: `src/services/syncMarkers.ts`

**Interfaces:**
- Consumes: `src/api/catalog.ts` (task 2), le quattro query di
  `src/db/queries/exercises.ts` (task 1), `catalogPhotoPath` (task 5),
  `getSetting`/`setSetting` (`src/db/queries/settings.ts`),
  `findExerciseByName`, `createExercise`, `MUSCLE_GROUPS`, `EQUIPMENT`.
- Produces:
  ```ts
  // src/services/catalogSync.ts
  export function pullExercises(): Promise<number>
  export function syncCatalog(): Promise<number>
  // src/services/syncMarkers.ts
  export const CATALOG_EXERCISES_CURSOR = "catalog.exercises_cursor";
  export const CATALOG_FOODS_CURSOR = "catalog.foods_cursor";
  export const CATALOG_PULLED_AT = "catalog.pulled_at";
  ```
  `pullExercises` torna quante righe ha toccato (inserite, riallineate o
  staccate), 0 quando non c'e' niente da fare o quando qualcosa e' andato
  storto. Non solleva mai.

- [ ] **Step 1: Dichiara i segnaposto del catalogo**

In `src/services/syncMarkers.ts`, sotto `CURSOR_KEY` e `PUSHED_KEY`:

```ts
/**
 * I tre segnaposto del catalogo comune.
 *
 * Sono separati da `sync.cursor` perche' sono due flussi diversi: quello e' il
 * contatore della copia dei dati dell'utente, questi sono la posizione dentro
 * un elenco che il server pubblica per tutti. Azzerare l'uno non deve
 * azzerare l'altro.
 *
 * I due cursori sono JSON, `{"since":...,"afterId":...}`, perche' il cursore
 * del catalogo e' una coppia: i timestamp del server hanno la risoluzione del
 * secondo e `catalog:seed` scrive duecento righe nello stesso secondo.
 */
export const CATALOG_EXERCISES_CURSOR = "catalog.exercises_cursor";
export const CATALOG_FOODS_CURSOR = "catalog.foods_cursor";
/** L'ora dell'ultimo pull su QUESTO telefono, per la finestra del task 8. */
export const CATALOG_PULLED_AT = "catalog.pulled_at";
```

e aggiungili a `LOCAL_ONLY_SETTINGS`, con il motivo:

```ts
  /*
   * I segnaposto del catalogo dicono a che punto e' arrivato QUESTO telefono
   * a leggere un elenco che il server pubblica per tutti. Sincronizzarli
   * porterebbe la posizione di un telefono sull'altro, che salterebbe le voci
   * arrivate prima di quel punto senza averle mai ricevute - lo stesso danno
   * che `sync.cursor` fa quando viaggia.
   */
  CATALOG_EXERCISES_CURSOR,
  CATALOG_FOODS_CURSOR,
  CATALOG_PULLED_AT,
```

- [ ] **Step 2: Scrivi i test, tutti quelli che ancora falliscono**

`src/services/catalogSync.test.ts`:

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  createExercise,
  getExercise,
  searchExercises,
  setExerciseBanned,
  setExerciseDislike,
} from "@/src/db/queries/exercises";
import { getSetting } from "@/src/db/queries/settings";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { pullExercises } from "@/src/services/catalogSync";
import { CATALOG_EXERCISES_CURSOR } from "@/src/services/syncMarkers";
import { useAccountStore } from "@/src/stores/accountStore";

jest.mock("@/src/api/config", () => ({
  API_URL: "https://esempio.tld/api",
  API_TIMEOUT_MS: 1000,
  hasBackend: () => true,
}));

// Il prefisso `mock` non e' vezzo: jest.mock viene issato in cima al file e
// senza quel prefisso rifiuta di leggere una variabile dichiarata dopo.
const mockApiRequest = jest.fn();
jest.mock("@/src/api/client", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  setAuthTokenProvider: jest.fn(),
}));

let db: LocalDatabase;

beforeEach(async () => {
  jest.clearAllMocks();
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  useAccountStore.setState({ token: "token-valido", profile: null });
});

afterEach(() => __setDbForTesting(null));

/** Una voce viva del catalogo. */
const voce = (over: Record<string, unknown> = {}) => ({
  uid: "ex-panca-piana-bilanciere",
  deletedAt: null,
  name: "Panca piana",
  nameNorm: "panca piana",
  muscleGroup: "petto",
  secondaryMuscles: "tricipiti,spalle",
  equipment: "bilanciere,panca",
  instructions: "Scapole addotte.",
  photo: null,
  mine: false,
  ...over,
});

/** Una pagina sola, senza seguito: e' il caso normale. */
const pagina = (voci: unknown[], cursore = { since: "2026-09-08T10:00:00+00:00", afterId: 7 }) => ({
  data: voci,
  cursor: voci.length > 0 ? cursore : null,
  next: null,
});

describe("pullExercises, l'aggancio di una riga", () => {
  it("inserisce una voce che qui non c'e'", async () => {
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    expect(await pullExercises()).toBe(1);

    const [riga] = await searchExercises({ term: "panca" });
    expect(riga.name).toBe("Panca piana");
    expect(riga.catalog_uid).toBe("ex-panca-piana-bilanciere");
    // Voce di catalogo, non roba inventata da chi usa questo telefono.
    expect(riga.is_custom).toBe(0);
    expect(riga.instructions).toBe("Scapole addotte.");
    expect(JSON.parse(riga.equipment ?? "[]")).toEqual(["bilanciere", "panca"]);
    expect(JSON.parse(riga.secondary_muscles ?? "[]")).toEqual([
      "tricipiti",
      "spalle",
    ]);
  });

  /**
   * Il difetto che tutta questa fase esiste per chiudere. Prima l'aggancio era
   * sul nome: rinominata dal pannello, la voce arrivava come nuova e quella
   * col nome vecchio restava. Una rinomina, un doppione per telefono.
   */
  it("rinomina invece di duplicare, riconoscendo l'uid", async () => {
    await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });

    mockApiRequest.mockResolvedValue(
      pagina([voce({ name: "Panca piana con bilanciere", nameNorm: "panca piana con bilanciere" })]),
    );

    await pullExercises();

    const righe = await searchExercises({ term: "panca" });
    expect(righe).toHaveLength(1);
    expect(righe[0].name).toBe("Panca piana con bilanciere");
  });

  /**
   * Il primo pull dopo l'aggiornamento: le righe gia' installate non hanno
   * l'uid, si riconoscono dal nome, e da qui in poi hanno l'uid.
   */
  it("aggancia per nome una riga senza uid, e le da' l'uid", async () => {
    const id = await createExercise({
      name: "panca  piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      isCustom: false,
    });
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    await pullExercises();

    expect(await searchExercises({ term: "panca" })).toHaveLength(1);
    expect((await getExercise(id))?.catalog_uid).toBe(
      "ex-panca-piana-bilanciere",
    );
  });
});

describe("pullExercises, quel che non tocca", () => {
  /** Regola 2: il catalogo scrive la descrizione, non i giudizi. */
  it("i giudizi personali sopravvivono a un pull che riscrive tutto il resto", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      notes: "spalla destra",
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });
    await setExerciseDislike(id, 2);
    await setExerciseBanned(id, true);
    mockApiRequest.mockResolvedValue(
      pagina([voce({ instructions: "Testo nuovo." })]),
    );

    await pullExercises();

    const riga = await getExercise(id);
    expect(riga?.instructions).toBe("Testo nuovo.");
    expect(riga?.notes).toBe("spalla destra");
    expect(riga?.dislike_level).toBe(2);
    expect(riga?.is_banned).toBe(1);
  });

  /** Regola 2: una riga `is_custom = 1` e' dell'utente, e non si tocca mai. */
  it("non tocca una riga dell'utente, nemmeno se l'uid combacia", async () => {
    const id = await createExercise({
      name: "La mia panca",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      // Il default: un esercizio scritto a mano e' `is_custom = 1`.
    });
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    await pullExercises();

    const riga = await getExercise(id);
    expect(riga?.name).toBe("La mia panca");
    expect(riga?.instructions).toBeNull();
  });

  /**
   * Il catalogo lo scrivono altri telefoni e il gestionale: un gruppo che
   * questa versione dell'app non conosce non deve entrare in colonna e
   * girare come se fosse buono.
   */
  it("scarta una voce il cui gruppo muscolare non esiste", async () => {
    mockApiRequest.mockResolvedValue(pagina([voce({ muscleGroup: "branchie" })]));

    expect(await pullExercises()).toBe(0);
    expect(await searchExercises({ term: "panca" })).toHaveLength(0);
  });

  it("tiene solo gli attrezzi e i muscoli che conosce", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([
        voce({
          equipment: "bilanciere,astronave",
          secondaryMuscles: "tricipiti,branchie",
        }),
      ]),
    );

    await pullExercises();

    const [riga] = await searchExercises({ term: "panca" });
    expect(JSON.parse(riga.equipment ?? "[]")).toEqual(["bilanciere"]);
    expect(JSON.parse(riga.secondary_muscles ?? "[]")).toEqual(["tricipiti"]);
  });
});

describe("pullExercises, una voce tolta dal catalogo", () => {
  /**
   * Regola 3. Cancellarla porterebbe via il nome a ogni allenamento passato
   * che la nominava, che e' quel che `deleteRoutine` evita non cancellando i
   * giorni.
   */
  it("la riga resta e diventa dell'utente", async () => {
    const id = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
      catalogUid: "ex-panca-piana-bilanciere",
      isCustom: false,
    });
    mockApiRequest.mockResolvedValue(
      pagina([{ uid: "ex-panca-piana-bilanciere", deletedAt: "2026-09-08T09:00:00+00:00" }]),
    );

    expect(await pullExercises()).toBe(1);

    const riga = await getExercise(id);
    expect(riga).not.toBeNull();
    expect(riga?.is_custom).toBe(1);
    expect(riga?.catalog_uid).toBe("ex-panca-piana-bilanciere");
  });

  /** Un tombstone per una voce che qui non c'e' non e' un errore. */
  it("un tombstone sconosciuto non fa niente e non solleva", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([{ uid: "ex-mai-vista", deletedAt: "2026-09-08T09:00:00+00:00" }]),
    );

    expect(await pullExercises()).toBe(0);
  });
});

describe("pullExercises, il cursore", () => {
  it("il primo pull non manda `since`", async () => {
    mockApiRequest.mockResolvedValue(pagina([voce()]));

    await pullExercises();

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "get",
        path: "/catalog/exercises",
        params: {},
      }),
    );
  });

  it("salva il cursore e lo rimanda al giro dopo", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([voce()], { since: "2026-09-08T10:00:00+00:00", afterId: 42 }),
    );
    await pullExercises();

    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toBe(
      '{"since":"2026-09-08T10:00:00+00:00","afterId":42}',
    );

    mockApiRequest.mockResolvedValue(pagina([]));
    await pullExercises();

    expect(mockApiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: { since: "2026-09-08T10:00:00+00:00", afterId: "42" },
      }),
    );
  });

  /**
   * Il difetto chiuso lato server nel task 4, visto da qui: si salva `cursor`
   * e non `next`. Con `next` l'ultima pagina non avanzava il segnaposto e la
   * coda del catalogo si rileggeva a ogni giro.
   */
  it("avanza il cursore anche quando non c'e' altro da chiedere", async () => {
    mockApiRequest.mockResolvedValue({
      data: [voce()],
      cursor: { since: "2026-09-08T11:00:00+00:00", afterId: 9 },
      next: null,
    });

    await pullExercises();

    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toContain('"afterId":9');
  });

  it("continua finche' il server dice che c'e' altro", async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        data: [voce()],
        cursor: { since: "2026-09-08T10:00:00+00:00", afterId: 1 },
        next: { since: "2026-09-08T10:00:00+00:00", afterId: 1 },
      })
      .mockResolvedValueOnce({
        data: [voce({ uid: "ex-squat-bilanciere", name: "Squat", nameNorm: "squat", muscleGroup: "quadricipiti" })],
        cursor: { since: "2026-09-08T10:00:01+00:00", afterId: 2 },
        next: null,
      });

    expect(await pullExercises()).toBe(2);
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
    expect(mockApiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: { since: "2026-09-08T10:00:00+00:00", afterId: "1" },
      }),
    );
  });

  /**
   * Un cursore illeggibile - scritto da una versione precedente, o corrotto -
   * riparte da zero. Al massimo costa un pull completo, che e' idempotente.
   */
  it("un cursore illeggibile riparte da zero", async () => {
    await db.runAsync(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
      [CATALOG_EXERCISES_CURSOR, "non-json", "2026-09-08T00:00:00.000Z"],
    );
    mockApiRequest.mockResolvedValue(pagina([]));

    await pullExercises();

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ params: {} }),
    );
  });
});

describe("pullExercises, quando non si puo' fare", () => {
  it("senza account non chiede niente", async () => {
    useAccountStore.setState({ token: null, profile: null });

    expect(await pullExercises()).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  /** Senza rete la palestra deve funzionare com'e' sempre funzionata. */
  it("un errore di rete non solleva e non avanza il cursore", async () => {
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    expect(await pullExercises()).toBe(0);
    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toBeNull();
  });
});
```

- [ ] **Step 3: Lanciali e verifica che falliscano**

Run: `npm test -- src/services/catalogSync.test.ts`
Expected: FAIL, `Cannot find module '@/src/services/catalogSync'`.

- [ ] **Step 4: Scrivi `catalogSync.ts`**

```ts
import * as catalog from "@/src/api/catalog";
import { hasBackend } from "@/src/api/config";
import { alreadyLogged } from "@/src/api/errors";
import {
  applyCatalogExercise,
  createExercise,
  detachExerciseFromCatalog,
  findExerciseByCatalogUid,
  findExerciseByName,
  setExerciseCatalogUid,
  type CatalogExerciseFields,
} from "@/src/db/queries/exercises";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { catalogPhotoPath } from "@/src/services/photoSync";
import { CATALOG_EXERCISES_CURSOR } from "@/src/services/syncMarkers";
import { useAccountStore } from "@/src/stores/accountStore";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  type Equipment,
  type MuscleGroup,
} from "@/src/types/gym";
import { logger } from "@/src/utils/logger";

/**
 * Il catalogo comune, portato nel telefono.
 *
 * Sostituisce `exerciseCatalog.ts` e `foodCatalog.ts`, che leggevano tutto il
 * catalogo a ogni giro e inserivano soltanto quel che mancava. La differenza
 * non e' il traffico: quel modo non poteva aggiornare una riga che il telefono
 * aveva gia', quindi una descrizione corretta dal gestionale non arrivava a
 * nessuno, e una voce rinominata arrivava come voce nuova lasciando in casa
 * quella col nome vecchio.
 *
 * TRE REGOLE, e ognuna e' un difetto pagato o evitato.
 *
 * 1. L'IDENTITA' E' `catalog_uid`. Il nome normalizzato e' la ricaduta di un
 *    giro solo, per le righe gia' installate che l'uid non ce l'hanno ancora:
 *    agganciata per nome, la riga riceve l'uid e dal giro dopo si aggancia per
 *    quello.
 * 2. IL CATALOGO SCRIVE SOLO I CAMPI DI CATALOGO, E SOLO SULLE RIGHE CHE SONO
 *    SUE. `is_custom = 1` non si tocca mai. `notes`, `dislike_level`,
 *    `is_banned` e `usage_count` non si toccano su nessuna riga: sono giudizi
 *    su un esercizio e storia di come lo si usa, non la sua descrizione.
 * 3. UNA VOCE TOLTA DAL CATALOGO NON SI CANCELLA, CAMBIA PADRONE. Cancellarla
 *    porterebbe via il nome a ogni allenamento passato che la nominava.
 *
 * Niente qui solleva verso una schermata: il telefono e' la fonte di verita',
 * e senza rete l'app funziona identica.
 */

/**
 * Quante pagine al massimo in un giro.
 *
 * Non e' una stima del catalogo: e' un tetto contro un ciclo che non finisce.
 * Un server che tornasse una pagina piena col cursore fermo terrebbe questo
 * ciclo dentro per sempre, e qui non c'e' nessuno che possa fermarlo.
 */
const MAX_PAGES = 50;

const attivo = (): boolean =>
  hasBackend() && useAccountStore.getState().token !== null;

/**
 * Il cursore salvato, o `undefined` per ripartire da zero.
 *
 * Un valore illeggibile - scritto da una versione precedente, o corrotto - non
 * e' un errore da propagare: riparte dall'inizio, che al massimo costa un pull
 * completo. Il pull e' idempotente, quindi non c'e' niente da riparare.
 */
async function readCursor(
  key: string,
): Promise<catalog.CatalogCursor | undefined> {
  const stored = await getSetting(key);
  if (stored === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as catalog.CatalogCursor).since === "string" &&
      typeof (parsed as catalog.CatalogCursor).afterId === "number"
    ) {
      return parsed as catalog.CatalogCursor;
    }
  } catch {
    // Vedi sopra: si riparte da zero.
  }
  return undefined;
}

const writeCursor = (key: string, cursore: catalog.CatalogCursor) =>
  setSetting(key, JSON.stringify(cursore));

/**
 * Gli slug che questa versione dell'app conosce.
 *
 * Il metro sono ancora le costanti di `src/types/gym.ts`; dal task 12 sara' la
 * tassonomia locale, cioe' quel che il server dichiara. Il controllo non
 * sparisce, cambia fonte: quel che non si conosce si butta invece di entrare
 * in colonna e girare per l'app come se fosse buono.
 */
const isMuscleGroup = (value: string): value is MuscleGroup =>
  (MUSCLE_GROUPS as readonly string[]).includes(value);

const parseMuscles = (value: string | null | undefined): MuscleGroup[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(isMuscleGroup);

const parseEquipment = (value: string | null | undefined): Equipment[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is Equipment => (EQUIPMENT as readonly string[]).includes(v));

/**
 * Una voce di catalogo applicata alla riga locale. Torna true se ha toccato
 * qualcosa.
 *
 * La riga si cerca per uid e, non trovata, per nome. Un TOMBSTONE si cerca
 * solo per uid, e non e' una dimenticanza: di una voce cancellata il server
 * manda solo `uid` e `deletedAt`, quindi un nome non c'e' da confrontare. Non
 * lascia scoperto niente, perche' i tombstone escono solo in un pull
 * incrementale - il primo pull, quello che distribuisce gli uid, non ne
 * contiene nessuno.
 */
async function applyExercise(voce: catalog.CatalogExercise): Promise<boolean> {
  const perUid = await findExerciseByCatalogUid(voce.uid);

  if (voce.deletedAt !== null) {
    if (!perUid || perUid.is_custom === 1) return false;
    await detachExerciseFromCatalog(perUid.id);
    return true;
  }

  if (!voce.name || !voce.muscleGroup || !isMuscleGroup(voce.muscleGroup)) {
    return false;
  }

  const esistente = perUid ?? (await findExerciseByName(voce.name));

  const campi: CatalogExerciseFields = {
    name: voce.name,
    muscleGroup: voce.muscleGroup,
    secondaryMuscles: parseMuscles(voce.secondaryMuscles),
    equipment: parseEquipment(voce.equipment),
    instructions: voce.instructions ?? null,
    /*
     * Il PERCORSO si scrive subito, i byte arrivano dopo.
     *
     * `SyncedPhoto` scarica quel che non c'e' e nel frattempo disegna un
     * segnaposto: cosi' il pull non tiene ferma la palestra per scaricare
     * duecento immagini al primo avvio, e la foto compare quando si guarda
     * quell'esercizio.
     */
    photoUri: voce.photo ? catalogPhotoPath(voce.photo) : null,
  };

  if (!esistente) {
    await createExercise({ ...campi, isCustom: false, catalogUid: voce.uid });
    return true;
  }

  // Agganciata per nome: da qui in poi si aggancia per uid, e una rinomina
  // dal pannello la aggiorna invece di duplicarla.
  if (esistente.catalog_uid === null) {
    await setExerciseCatalogUid(esistente.id, voce.uid);
  }

  // Regola 2: e' roba dell'utente. L'uid glielo si e' dato comunque, cosi' un
  // tombstone futuro sa di quale riga parla.
  if (esistente.is_custom === 1) return false;

  await applyCatalogExercise(esistente.id, voce.uid, campi);
  return true;
}

/** Il catalogo degli esercizi, dal cursore in poi. Non solleva. */
export async function pullExercises(): Promise<number> {
  try {
    if (!attivo()) return 0;

    let cursore = await readCursor(CATALOG_EXERCISES_CURSOR);
    let toccate = 0;

    for (let giro = 0; giro < MAX_PAGES; giro++) {
      const pagina = await catalog.fetchCatalogExercises(cursore);

      for (const voce of pagina.data) {
        if (await applyExercise(voce)) toccate++;
      }

      /*
       * Si salva `cursor` e non `next`: il primo dice dove siamo arrivati, il
       * secondo se c'e' altro. Salvando `next`, l'ultima pagina - che non e'
       * mai piena - non avanzava il segnaposto, e la coda del catalogo si
       * rileggeva a ogni giro in silenzio.
       *
       * Si salva a ogni pagina e non alla fine: un giro interrotto a meta'
       * riprende da dove era, invece di rifare tutto.
       */
      if (pagina.cursor) await writeCursor(CATALOG_EXERCISES_CURSOR, pagina.cursor);
      if (!pagina.next) break;
      cursore = pagina.next;
    }

    if (toccate > 0) logger.info(`[catalogo] esercizi aggiornati: ${toccate}`);
    return toccate;
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] esercizi non aggiornati", error);
    }
    return 0;
  }
}

/** Un giro di catalogo. Torna quante righe ha toccato in tutto. */
export async function syncCatalog(): Promise<number> {
  return pullExercises();
}
```

- [ ] **Step 5: Lancia i test e verifica che passino**

Run: `npm test -- src/services/catalogSync.test.ts`
Expected: PASS, sedici test.

- [ ] **Step 6: I tre cancelli**

Run: `npm run typecheck` && `npm run lint` && `npm test`
Expected: PASS. `exerciseCatalog.ts` e i suoi test sono ancora al loro posto e
devono restare verdi: si toglieranno nel task 9, quando le schermate avranno
smesso di chiamarli. Due servizi che leggono lo stesso catalogo per un paio di
task e' meno rischioso di una schermata che chiama una funzione che non c'e'
piu'.

- [ ] **Step 7: Commit**

```bash
git add src/services/catalogSync.ts src/services/catalogSync.test.ts \
  src/services/syncMarkers.ts
git commit -m "$(cat <<'EOF'
feat(catalogo): il pull incrementale degli esercizi, agganciato per uid

`catalogSync.ts` legge `/api/catalog/exercises` dal cursore in poi e applica
le tre regole di questa fase: l'identita' e' `catalog_uid` con ricaduta di un
giro solo sul nome normalizzato; il catalogo scrive solo i campi di catalogo e
solo sulle righe che sono sue (`is_custom = 0`); una voce tolta dal catalogo
non si cancella, diventa dell'utente.

Il modo vecchio inseriva soltanto quel che mancava, confrontando i nomi. Non
poteva aggiornare una riga gia' presente - quindi una descrizione corretta dal
gestionale non arrivava a nessuno - e una voce rinominata arrivava come voce
nuova lasciando in casa quella col nome vecchio.

Il cursore e' `cursor` e non `next`, ed e' un JSON in `settings` dichiarato
locale: dice a che punto e' arrivato QUESTO telefono a leggere un elenco
pubblicato per tutti, e sincronizzarlo farebbe saltare all'altro telefono le
voci arrivate prima di quel punto.

Il percorso della foto si scrive subito e i byte arrivano quando la foto si
guarda: un catalogo con duecento immagini non deve tenere ferma la palestra al
primo avvio.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 7: il pull degli alimenti

Le stesse tre regole, con un marcatore diverso: gli alimenti non hanno
`is_custom`, e la riga e' del catalogo quando `source = 'seed'`.

Non e' un'approssimazione. `source = 'seed'` sono esattamente le righe che
`catalog:seed` ha pubblicato sul server sotto i loro id parlanti - la stessa
popolazione, non due - e `searchMyFoods` filtra gia' `source != 'seed'`, quindi
"In libreria" continua a voler dire quel che vuole dire. Un terzo valore
(`'catalog'`) sarebbe una distinzione senza differenza, e costringerebbe a
ricordarsene in ogni filtro esistente.

Nota che questo pull **porta gli alimenti del catalogo sul telefono per la
prima volta**: `importFoodCatalog` esisteva dalla Fase 5 e **non aveva nessun
chiamante** (verificato: `grep -rn importFoodCatalog src/` trova solo la sua
definizione). Il catalogo comune degli alimenti non e' mai arrivato a nessuno.

**Files:**
- Modify: `src/services/catalogSync.ts`
- Modify: `src/services/catalogSync.test.ts`

**Interfaces:**
- Consumes: le quattro query di `src/db/queries/foods.ts` (task 1),
  `findFoodByName`, `createFood`, `EMPTY_NUTRIENTS`
  (`src/domain/nutrition`), `CATALOG_FOODS_CURSOR` (task 6).
- Produces: `export function pullFoods(): Promise<number>`, e `syncCatalog()`
  che ora torna la somma dei due.

- [ ] **Step 1: Scrivi i test, che ancora falliscono**

In coda a `src/services/catalogSync.test.ts` (gli import in cima si estendono
con `pullFoods`, `createFood`, `getFood`, `searchFoods`, `toggleFoodFavorite`,
`EMPTY_NUTRIENTS`, `CATALOG_FOODS_CURSOR`):

```ts
const alimento = (over: Record<string, unknown> = {}) => ({
  uid: "food-riso",
  deletedAt: null,
  name: "Riso",
  nameNorm: "riso",
  brand: null,
  barcode: null,
  offId: null,
  kcal: 358,
  protein: 7,
  carbs: 79,
  sugars: 0,
  fat: 0.6,
  saturatedFat: 0.2,
  fiber: 1,
  salt: 0,
  isLiquid: false,
  defaultServingG: 80,
  servingLabel: "1 porzione = 80 g",
  image: null,
  mine: false,
  ...over,
});

describe("pullFoods", () => {
  it("inserisce un alimento che qui non c'e', come voce di catalogo", async () => {
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    expect(await pullFoods()).toBe(1);

    const [riga] = await searchFoods("riso");
    expect(riga.name).toBe("Riso");
    expect(riga.kcal).toBe(358);
    expect(riga.catalog_uid).toBe("food-riso");
    // Marcatore di catalogo: `searchMyFoods` filtra `source != 'seed'`, quindi
    // "In libreria" resta "quelli che ho aggiunto io".
    expect(riga.source).toBe("seed");
    expect(riga.serving_label).toBe("1 porzione = 80 g");
  });

  it("riconosce l'uid e rinomina invece di duplicare", async () => {
    await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });
    mockApiRequest.mockResolvedValue(
      pagina([alimento({ name: "Riso bianco", nameNorm: "riso bianco" })]),
    );

    await pullFoods();

    const righe = await searchFoods("riso");
    expect(righe).toHaveLength(1);
    expect(righe[0].name).toBe("Riso bianco");
  });

  it("aggancia per nome un seed senza uid, e gli da' l'uid", async () => {
    const id = await createFood({
      name: "riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 350 },
      source: "seed",
    });
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    expect(await searchFoods("riso")).toHaveLength(1);
    expect((await getFood(id))?.catalog_uid).toBe("food-riso");
    expect((await getFood(id))?.kcal).toBe(358);
  });

  /**
   * Un alimento dell'utente col nome uguale non si riscrive e non si
   * affianca: i suoi valori li ha corretti lui, e una seconda riga con lo
   * stesso nome in elenco sarebbe indistinguibile.
   */
  it("non tocca un alimento dell'utente che porta lo stesso nome", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 111 },
      source: "user",
    });
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    expect(await searchFoods("riso")).toHaveLength(1);
    expect((await getFood(id))?.kcal).toBe(111);
  });

  /**
   * `barcode` e `off_id` sono identita' e non contenuto, e il preferito e' uno
   * stato d'uso di questo telefono: e' la stessa regola per cui `updateFood`
   * non li tocca.
   */
  it("non tocca codice a barre, provenienza e preferito", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 350 },
      source: "seed",
      barcode: "8001234567890",
      offId: "off-riso",
      catalogUid: "food-riso",
    });
    await toggleFoodFavorite(id);
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    const riga = await getFood(id);
    expect(riga?.kcal).toBe(358);
    expect(riga?.barcode).toBe("8001234567890");
    expect(riga?.off_id).toBe("off-riso");
    expect(riga?.is_favorite).toBe(1);
  });

  it("una voce tolta dal catalogo resta e diventa dell'utente", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });
    mockApiRequest.mockResolvedValue(
      pagina([{ uid: "food-riso", deletedAt: "2026-09-08T09:00:00+00:00" }]),
    );

    expect(await pullFoods()).toBe(1);

    const riga = await getFood(id);
    expect(riga).not.toBeNull();
    expect(riga?.source).toBe("user");
  });

  it("legge il proprio cursore, non quello degli esercizi", async () => {
    mockApiRequest.mockResolvedValue(
      pagina([alimento()], { since: "2026-09-08T12:00:00+00:00", afterId: 3 }),
    );

    await pullFoods();

    expect(await getSetting(CATALOG_FOODS_CURSOR)).toContain('"afterId":3');
    expect(await getSetting(CATALOG_EXERCISES_CURSOR)).toBeNull();
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/catalog/foods" }),
    );
  });

  it("senza account non chiede niente", async () => {
    useAccountStore.setState({ token: null, profile: null });

    expect(await pullFoods()).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("un errore di rete non solleva", async () => {
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    expect(await pullFoods()).toBe(0);
  });

  /**
   * Il difetto che la guardia sul fallback chiude, ed e' lo stesso trovato
   * dalla review del task 6: una riga che porta gia' un uid diverso non e'
   * questa voce. Senza la guardia, la riga di X si ritroverebbe con l'uid e i
   * valori di Y, e le ricette che la nominano parlerebbero di un altro
   * alimento.
   */
  it("non ruba una riga che porta gia' un altro uid", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 350 },
      source: "seed",
      catalogUid: "food-altro",
    });
    mockApiRequest.mockResolvedValue(pagina([alimento()]));

    await pullFoods();

    // La riga di prima e' intatta...
    const vecchia = await getFood(id);
    expect(vecchia?.catalog_uid).toBe("food-altro");
    expect(vecchia?.kcal).toBe(350);
    // ...e la voce nuova e' entrata come riga sua.
    expect(await searchFoods("riso")).toHaveLength(2);
  });

  /** Come per gli esercizi: il cursore si scrive a ogni pagina, non alla fine. */
  it("tiene il cursore della pagina applicata se la successiva cade", async () => {
    mockApiRequest
      .mockResolvedValueOnce({
        data: [alimento()],
        cursor: { since: "2026-09-08T12:00:00+00:00", afterId: 1 },
        next: { since: "2026-09-08T12:00:00+00:00", afterId: 1 },
      })
      .mockRejectedValueOnce(new Error("rete caduta"));

    await pullFoods();

    expect(await getSetting(CATALOG_FOODS_CURSOR)).toContain('"afterId":1');
  });

  /** Il tetto e' l'unica cosa fra un server che sbaglia e un giro infinito. */
  it("non fa piu' di MAX_PAGES giri", async () => {
    const cursore = { since: "2026-09-08T12:00:00+00:00", afterId: 1 };
    mockApiRequest.mockResolvedValue({
      data: [alimento()],
      cursor: cursore,
      next: cursore,
    });

    await pullFoods();

    expect(mockApiRequest).toHaveBeenCalledTimes(50);
  });
});

describe("syncCatalog", () => {
  it("fa i due pull e somma quel che hanno toccato", async () => {
    mockApiRequest
      .mockResolvedValueOnce(pagina([voce()]))
      .mockResolvedValueOnce(pagina([alimento()]));

    expect(await syncCatalog()).toBe(2);
    expect(mockApiRequest).toHaveBeenCalledTimes(2);
  });

  /**
   * Il secondo pull deve partire comunque: gli alimenti non devono restare
   * indietro perche' il catalogo degli esercizi non ha risposto.
   */
  it("il secondo pull parte anche se il primo e' andato male", async () => {
    mockApiRequest
      .mockRejectedValueOnce(new Error("rete assente"))
      .mockResolvedValueOnce(pagina([alimento()]));

    expect(await syncCatalog()).toBe(1);
  });
});
```

- [ ] **Step 2: Lanciali e verifica che falliscano**

Run: `npm test -- src/services/catalogSync.test.ts`
Expected: FAIL, `pullFoods is not a function`.

- [ ] **Step 3: Aggiungi il pull degli alimenti**

In `src/services/catalogSync.ts`, aggiungi gli import e, sotto
`pullExercises`:

```ts
/**
 * Una voce di catalogo alimentare applicata alla riga locale.
 *
 * Il marcatore di proprieta' qui e' `source` e non `is_custom`, che gli
 * alimenti non hanno: `source = 'seed'` e' una riga del catalogo, tutto il
 * resto e' dell'utente. Non e' un ripiego - `source = 'seed'` sono esattamente
 * le righe che `catalog:seed` ha pubblicato sul server sotto i loro id
 * parlanti, e `searchMyFoods` filtra gia' `source != 'seed'`.
 */
async function applyFood(voce: catalog.CatalogFood): Promise<boolean> {
  const perUid = await findFoodByCatalogUid(voce.uid);

  // `!= null` e non `!== null`: un campo assente non deve passare per un
  // tombstone, ed e' il perno della regola 3.
  if (voce.deletedAt != null) {
    if (!perUid || perUid.source !== "seed") return false;
    await detachFoodFromCatalog(perUid.id);
    return true;
  }

  if (!voce.name || voce.kcal === undefined) return false;

  /*
   * La ricaduta sul nome vale SOLO per una riga che non ha ancora un uid.
   *
   * Una riga che ne porta gia' uno diverso non e' questa voce, e' un'altra:
   * il pannello rinomina la voce X liberandone il nome, una voce Y nuova lo
   * prende, e la stessa pagina le porta entrambe. Accettando il match per
   * nome, la riga di X si ritroverebbe riscritta con l'uid e il contenuto di
   * Y - X orfana, e una riga che le ricette nominano diventata un altro
   * alimento. Due righe che per un giro condividono il nome sono la
   * soluzione, non il problema: l'altra voce si rinomina da se' al proprio
   * aggiornamento.
   */
  const perNome = perUid ?? (await findFoodByName(voce.name));
  const esistente =
    perNome === null || perNome.catalog_uid === null || perNome === perUid
      ? perNome
      : null;

  /*
   * `satisfies` e non un'annotazione: annotare allargherebbe i campi al tipo
   * dichiarato e il controllo delle proprieta' in eccesso sparirebbe, cioe'
   * la regola 2 smetterebbe di essere un errore del compilatore sul ramo di
   * inserimento. Con `satisfies` il tipo resta quello inferito E un campo di
   * troppo non compila.
   */
  const campi = {
    name: voce.name,
    brand: voce.brand ?? null,
    nutrients: {
      ...EMPTY_NUTRIENTS,
      kcal: voce.kcal,
      protein: voce.protein ?? 0,
      carbs: voce.carbs ?? 0,
      sugars: voce.sugars ?? 0,
      fat: voce.fat ?? 0,
      saturatedFat: voce.saturatedFat ?? 0,
      fiber: voce.fiber ?? 0,
      salt: voce.salt ?? 0,
    },
    isLiquid: voce.isLiquid ?? false,
    defaultServingG: voce.defaultServingG ?? null,
    servingLabel: voce.servingLabel ?? null,
    // Come per gli esercizi: il percorso subito, i byte quando si guarda.
    imageUri: voce.image ? catalogPhotoPath(voce.image) : null,
  } satisfies CatalogFoodFields;

  if (!esistente) {
    await createFood({
      name: campi.name,
      brand: campi.brand,
      nutrients: campi.nutrients,
      isLiquid: campi.isLiquid,
      defaultServingG: campi.defaultServingG,
      servingLabel: campi.servingLabel,
      imageUri: campi.imageUri,
      source: "seed",
      catalogUid: voce.uid,
    });
    return true;
  }

  if (esistente.catalog_uid === null) {
    await setFoodCatalogUid(esistente.id, voce.uid);
  }

  /*
   * E' dell'utente: non si riscrive e non se ne affianca una copia.
   *
   * L'uid glielo si e' dato comunque, cosi' un tombstone futuro sa di quale
   * riga parla; ma i valori li ha corretti lui, e una seconda riga con lo
   * stesso nome in elenco sarebbe indistinguibile dalla prima.
   */
  if (esistente.source !== "seed") return false;

  await applyCatalogFood(esistente.id, voce.uid, campi);
  return true;
}

/** Il catalogo degli alimenti, dal cursore in poi. Non solleva. */
export async function pullFoods(): Promise<number> {
  try {
    if (!attivo()) return 0;

    let cursore = await readCursor(CATALOG_FOODS_CURSOR);
    let toccate = 0;

    for (let giro = 0; giro < MAX_PAGES; giro++) {
      const pagina = await catalog.fetchCatalogFoods(cursore);

      for (const voce of pagina.data) {
        if (await applyFood(voce)) toccate++;
      }

      if (pagina.cursor) await writeCursor(CATALOG_FOODS_CURSOR, pagina.cursor);
      if (!pagina.next) break;
      cursore = pagina.next;
    }

    if (toccate > 0) logger.info(`[catalogo] alimenti aggiornati: ${toccate}`);
    return toccate;
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] alimenti non aggiornati", error);
    }
    return 0;
  }
}
```

E `syncCatalog` diventa:

```ts
/**
 * Un giro di catalogo. Torna quante righe ha toccato in tutto.
 *
 * I due pull sono in fila e non in `Promise.all`: `sqliteAdapter` serializza
 * comunque le query su un'unica connessione, quindi il parallelo non
 * guadagnerebbe niente e renderebbe illeggibile l'ordine dei log.
 *
 * Ognuno incassa i propri errori, quindi il secondo parte anche se il primo
 * e' andato male: gli alimenti non devono restare indietro perche' il
 * catalogo degli esercizi non ha risposto.
 */
export async function syncCatalog(): Promise<number> {
  const esercizi = await pullExercises();
  const alimenti = await pullFoods();
  return esercizi + alimenti;
}
```

- [ ] **Step 4: Lancia i test**

Run: `npm test -- src/services/catalogSync.test.ts` && `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/catalogSync.ts src/services/catalogSync.test.ts
git commit -m "$(cat <<'EOF'
feat(catalogo): il pull incrementale degli alimenti

Le stesse tre regole del pull degli esercizi, con `source = 'seed'` al posto
di `is_custom = 0` come marcatore di proprieta': gli alimenti non hanno
`is_custom`, e `source = 'seed'` sono esattamente le righe che `catalog:seed`
ha pubblicato sul server sotto i loro id parlanti. `searchMyFoods` filtra gia'
`source != 'seed'`, quindi "In libreria" continua a voler dire "quelli che ho
aggiunto io".

Questo pull porta il catalogo comune degli alimenti sul telefono per la prima
volta: `importFoodCatalog` esisteva dalla Fase 5 e non aveva nessun chiamante,
quindi quel catalogo non era mai arrivato a nessuno.

`applyCatalogFood` non tocca `barcode`, `off_id` e `is_favorite`: i primi due
sono identita' e non contenuto - la stessa regola per cui `updateFood` non li
tocca - il terzo e' stato d'uso di questo telefono.

I due pull vanno in fila e ognuno incassa i propri errori, cosi' gli alimenti
non restano indietro perche' il catalogo degli esercizi non ha risposto.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 8: quando gira, e il bottone che lo chiede

Tre inneschi: all'avvio, a ogni ritorno in primo piano, e a richiesta dalle
due schermate. I primi due passano dalla finestra di un'ora, il terzo la
scavalca.

**Files:**
- Modify: `src/services/catalogSync.ts` (la finestra)
- Modify: `src/services/catalogSync.test.ts`
- Modify: `src/services/syncScheduler.ts`
- Modify: `src/navigation/screens/ExercisesScreen.tsx`
- Modify: `src/navigation/screens/FoodsScreen.tsx`
- Modify: `src/i18n/locales/it.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `CATALOG_PULLED_AT` (task 6), `startSyncScheduler`.
- Produces: `syncCatalog(force = false)`. `force: true` ignora la finestra, ed
  e' quel che passano le due schermate.

- [ ] **Step 1: Scrivi i test della finestra**

In coda al `describe("syncCatalog")` di `src/services/catalogSync.test.ts`:

```ts
  /**
   * Il pull parte all'avvio e a ogni ritorno in primo piano: senza una
   * finestra, alternare due app avanti e indietro chiederebbe il catalogo a
   * ogni passaggio.
   */
  it("due chiamate ravvicinate fanno un giro solo", async () => {
    mockApiRequest.mockResolvedValue(pagina([]));

    await syncCatalog();
    const dopoIlPrimo = mockApiRequest.mock.calls.length;
    await syncCatalog();

    expect(mockApiRequest.mock.calls.length).toBe(dopoIlPrimo);
  });

  it("`force` scavalca la finestra: e' il bottone dell'utente", async () => {
    mockApiRequest.mockResolvedValue(pagina([]));

    await syncCatalog();
    const dopoIlPrimo = mockApiRequest.mock.calls.length;
    await syncCatalog(true);

    expect(mockApiRequest.mock.calls.length).toBeGreaterThan(dopoIlPrimo);
  });

  it("passata l'ora si rifa'", async () => {
    mockApiRequest.mockResolvedValue(pagina([]));
    await syncCatalog();

    // Un'ora e un minuto fa. Si scrive il segnaposto invece di spostare
    // l'orologio: e' un confronto fra due istanti, e falsificare il dato e'
    // piu' diretto che falsificare il tempo.
    await setSetting(
      CATALOG_PULLED_AT,
      new Date(Date.now() - 61 * 60 * 1000).toISOString(),
    );
    const dopoIlPrimo = mockApiRequest.mock.calls.length;

    await syncCatalog();

    expect(mockApiRequest.mock.calls.length).toBeGreaterThan(dopoIlPrimo);
  });

  it("senza account non scrive il segnaposto, o il primo pull vero aspetterebbe un'ora", async () => {
    useAccountStore.setState({ token: null, profile: null });

    expect(await syncCatalog()).toBe(0);
    expect(await getSetting(CATALOG_PULLED_AT)).toBeNull();
  });
```

Gli import si estendono con `setSetting` e `CATALOG_PULLED_AT`.

- [ ] **Step 2: Lanciali e verifica che falliscano**

Run: `npm test -- src/services/catalogSync.test.ts`
Expected: FAIL su "due chiamate ravvicinate" (oggi ne fa due) e su "senza
account non scrive il segnaposto" se `syncCatalog` non ha ancora la guardia.

- [ ] **Step 3: Aggiungi la finestra**

In `src/services/catalogSync.ts`, sopra `syncCatalog`:

```ts
/**
 * Sotto quest'ora dall'ultimo giro non se ne fa un altro.
 *
 * Il catalogo non e' il diario: e' anagrafica comune che cambia quando un
 * amministratore decide, non quando l'utente registra una serie. Un'ora e'
 * abbastanza spesso da far arrivare una correzione in giornata e abbastanza
 * raro da non pesare - e serve soprattutto al ritorno in primo piano, dove
 * senza finestra alternare due app avanti e indietro chiederebbe il catalogo
 * a ogni passaggio.
 */
export const CATALOG_WINDOW_MS = 60 * 60 * 1000;

/**
 * Vero se e' passata l'ora, o se non abbiamo mai fatto un giro.
 *
 * `Date.parse` e non un confronto fra stringhe: e' la regola 2 della
 * sincronizzazione, e vale anche qui. Un segnaposto illeggibile conta come
 * "mai fatto", che al massimo costa un giro in piu'.
 */
async function finestraScaduta(): Promise<boolean> {
  const stored = await getSetting(CATALOG_PULLED_AT);
  if (stored === null) return true;
  const ultimo = Date.parse(stored);
  if (Number.isNaN(ultimo)) return true;
  return Date.now() - ultimo >= CATALOG_WINDOW_MS;
}
```

e `syncCatalog` diventa:

```ts
/**
 * Un giro di catalogo. Torna quante righe ha toccato in tutto.
 *
 * `force` lo passa solo il bottone delle due schermate: chi lo tocca ha
 * appena chiesto il catalogo adesso, e fargli aspettare la finestra sarebbe un
 * comando che non fa niente.
 *
 * I due pull sono in fila e non in `Promise.all`: `sqliteAdapter` serializza
 * comunque le query su un'unica connessione, quindi il parallelo non
 * guadagnerebbe niente e renderebbe illeggibile l'ordine dei log. Ognuno
 * incassa i propri errori, quindi il secondo parte anche se il primo e'
 * andato male.
 */
export async function syncCatalog(force = false): Promise<number> {
  /*
   * La guardia sta QUI e non nei chiamanti, ed e' la lezione della regola 6
   * della sincronizzazione: `runSync` ha pagato l'aver tenuto la sua nello
   * scheduler mentre altri due chiamanti la scavalcavano.
   */
  if (!attivo()) return 0;
  if (!force && !(await finestraScaduta())) return 0;

  const esercizi = await pullExercises();
  const alimenti = await pullFoods();

  /*
   * Il segnaposto si scrive anche quando il giro non ha portato niente, e
   * anche quando e' fallito.
   *
   * Un giro che fallisce per mancanza di rete fallirebbe per lo stesso motivo
   * in ogni giro della stessa ora, e riprovare ogni quarto d'ora non
   * cambierebbe l'esito. Chi ha fretta ha il bottone, che passa `force` e non
   * guarda la finestra: e' li' che sta la via d'uscita, non in un
   * riprovare automatico piu' insistente.
   */
  await setSetting(CATALOG_PULLED_AT, new Date().toISOString());

  return esercizi + alimenti;
}
```

- [ ] **Step 4: Lancia i test**

Run: `npm test -- src/services/catalogSync.test.ts`
Expected: PASS. Attenzione ai test del task 7 che chiamano `syncCatalog()` due
volte nello stesso `it`: se ce ne sono, il secondo va cambiato in
`syncCatalog(true)` - non si tolga la finestra per farli passare.

- [ ] **Step 5: Attaccalo allo scheduler**

In `src/services/syncScheduler.ts`, dentro `runIfDue`, subito dopo
`const result = await runSync();`:

```ts
    /*
     * Il catalogo va agganciato qui e non a un timer suo: gli inneschi utili
     * sono gli stessi - l'avvio e il ritorno in primo piano - e la finestra
     * di un'ora sta dentro `syncCatalog`, che decide da se' se c'e' da fare.
     * Non e' atteso: il catalogo e' anagrafica, e la sincronizzazione dei
     * dati dell'utente non deve aspettarlo.
     */
    void syncCatalog();
```

con l'import `import { syncCatalog } from "@/src/services/catalogSync";`.

`src/App.tsx` **non si tocca**: `startSyncScheduler` gia' fa un giro forzato
all'avvio, e aggiungere una chiamata anche li' sarebbe il difetto della regola
6 - due giri nello stesso secondo, ognuno convinto di essere il primo.

- [ ] **Step 6: Cambia le due frasi del risultato**

Il pull ora **aggiorna** e non solo aggiunge, quindi "aggiunti" e' diventato
falso. In `src/i18n/locales/it.json`:

```
"gym.imported_none":  "Catalogo già aggiornato"
"gym.imported_some":  "%{count} esercizi aggiornati"
"foods.imported_none": "Catalogo già aggiornato"
"foods.imported_some": "%{count} alimenti aggiornati"
```

e in `en.json`:

```
"gym.imported_none":  "Catalog already up to date"
"gym.imported_some":  "%{count} exercises updated"
"foods.imported_none": "Catalog already up to date"
"foods.imported_some": "%{count} foods updated"
```

Le chiavi `foods.import_catalog`, `foods.imported_none` e
`foods.imported_some` esistono gia' in entrambe le lingue e non erano usate da
nessuno: `importFoodCatalog` non aveva chiamanti. Ora le usa `FoodsScreen`.

- [ ] **Step 7: Il bottone di Esercizi chiama il servizio nuovo**

In `src/navigation/screens/ExercisesScreen.tsx`, sostituisci l'import di
`importCatalog` con `syncCatalog` e riscrivi `aggiornaCatalogo`:

```ts
  const aggiornaCatalogo = async () => {
    setImporting(true);
    try {
      // `true`: chi tocca il bottone ha chiesto il catalogo adesso, e la
      // finestra di un'ora renderebbe questo comando un comando che non fa
      // niente.
      const toccate = await syncCatalog(true);
      showToast.success({
        title:
          toccate === 0
            ? t("gym.imported_none")
            : t("gym.imported_some", { count: toccate }),
      });
      if (toccate > 0) reload();
    } finally {
      setImporting(false);
    }
  };
```

- [ ] **Step 8: Lo stesso bottone in Alimenti, che non c'era**

In `src/navigation/screens/FoodsScreen.tsx`, aggiungi nell'intestazione lo
stesso `TouchableOpacity` con `CloudDownload` che sta in `ExercisesScreen` -
si copi da li', comprese `activeOpacity={0.6}`, `hitSlop={10}`, il `disabled`
e il colore `textFaint` mentre gira - piu' lo stato `importing` e la funzione
gemella, con `t("foods.imported_none")` / `t("foods.imported_some")` e il
`reload` della lista di quella schermata.

Il commento sopra il bottone dice la stessa cosa di quello di Esercizi e va
scritto una volta sola: qui basta
`{/* Come in Esercizi: il catalogo si aggiorna a mano, non da solo. */}`.

- [ ] **Step 9: I tre cancelli**

Run: `npm run typecheck` && `npm run lint` && `npm test`
Expected: PASS. `keys.test.ts` controlla che le quattro chiavi ci siano in
entrambe le lingue: se ne manca una, lo dice.

- [ ] **Step 10: Commit**

```bash
git add src/services/catalogSync.ts src/services/catalogSync.test.ts \
  src/services/syncScheduler.ts \
  src/navigation/screens/ExercisesScreen.tsx \
  src/navigation/screens/FoodsScreen.tsx \
  src/i18n/locales/it.json src/i18n/locales/en.json
git commit -m "$(cat <<'EOF'
feat(catalogo): il pull parte all'avvio, in primo piano e a richiesta

Finestra di un'ora dentro `syncCatalog`, segnaposto locale
`catalog.pulled_at`, e `force: true` per il bottone delle due schermate. Il
catalogo si aggancia agli inneschi che lo scheduler ha gia' - avvio e ritorno
in primo piano - invece di avere un timer suo.

La guardia sta dentro `syncCatalog` e non nei chiamanti: e' la lezione della
regola 6 della sincronizzazione, dove `runSync` ha pagato l'aver tenuto la
propria nello scheduler mentre altri due chiamanti la scavalcavano. Per la
stessa ragione `App.tsx` non chiama niente: `startSyncScheduler` fa gia' un
giro all'avvio.

Alimenti ha ora lo stesso bottone di Esercizi, che non aveva: le sue tre
chiavi i18n esistevano da settembre e non le usava nessuno, perche'
`importFoodCatalog` non aveva chiamanti.

Le due frasi del risultato dicono "aggiornati" e non "aggiunti": il pull
adesso riallinea le righe che c'erano gia', e "3 esercizi aggiunti" su tre
descrizioni corrette sarebbe una bugia.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 9: una proposta si ritrova per uid, e i due servizi vecchi vanno via

Il secondo difetto del § "Cosa fare per prima", ed e' distinto dal primo.
Oggi `updatePublishedExercise` ritrova la propria voce con
`miaInCatalogo(previousName)`, e quando quella ricerca non trova niente
**crea** invece di aggiornare. Due modi in cui va storto:

- `searchCatalogExercises` legge `/api/exercises`, che dalla Fase 1 filtra
  `status = 'published'`: una proposta **in attesa** non e' li' dentro. Quindi
  chi corregge la propria proposta prima dell'approvazione deposita **una
  seconda proposta** ogni volta.
- se un amministratore ha rinominato la voce approvandola, il nome vecchio non
  la ritrova piu' e vale lo stesso.

Con l'uid in colonna (task 1) e il binding per uid (task 3) la voce si
indirizza direttamente, e la ricerca per nome sparisce.

**Files:**
- Modify: `src/services/catalogSync.ts` (le sei entrate di scrittura)
- Modify: `src/services/catalogSync.test.ts`
- Modify: `src/containers/gym/ExerciseFormSheet.tsx`
- Modify: `src/navigation/screens/ExerciseDetailScreen.tsx`
- Modify: `src/navigation/screens/FoodFormScreen.tsx`
- Delete: `src/services/exerciseCatalog.ts`,
  `src/services/exerciseCatalog.test.ts`, `src/services/foodCatalog.ts`
- Modify: `src/api/social.ts` (via le sei funzioni di catalogo e i loro tipi)

**Interfaces:**
- Consumes: `src/api/catalog.ts` (task 2/3), `setExerciseCatalogUid`,
  `setFoodCatalogUid` (task 1).
- Produces:
  ```ts
  export function submitExerciseToCatalog(localId: string, input: ExerciseProposal): Promise<void>
  export function amendExerciseSubmission(row: ExerciseRow, input: ExerciseProposal): Promise<void>
  export function withdrawExerciseSubmission(row: ExerciseRow): Promise<void>
  export function submitFoodToCatalog(localId: string, input: FoodInput): Promise<void>
  export function amendFoodSubmission(row: FoodRow, input: FoodInput): Promise<void>
  export function withdrawFoodSubmission(row: FoodRow): Promise<void>
  ```
  con `interface ExerciseProposal { name: string; muscleGroup: string;
  secondaryMuscles: string[]; equipment: string[] }`. Nessuna solleva.

- [ ] **Step 1: Scrivi i test, che ancora falliscono**

In coda a `src/services/catalogSync.test.ts`:

```ts
describe("proporre e correggere una propria voce", () => {
  const proposta = {
    name: "Spinte sopra la testa",
    muscleGroup: "spalle",
    secondaryMuscles: ["tricipiti"],
    equipment: ["manubri"],
  };

  it("propone e salva l'uid che il server risponde", async () => {
    const id = await createExercise({ ...proposta });
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-della-proposta" } });

    await submitExerciseToCatalog(id, proposta);

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        path: "/catalog/exercises",
        body: {
          name: "Spinte sopra la testa",
          muscleGroup: "spalle",
          secondaryMuscles: "tricipiti",
          equipment: "manubri",
        },
      }),
    );
    expect((await getExercise(id))?.catalog_uid).toBe("uuid-della-proposta");
  });

  /**
   * Il server risponde `{ ok: true }` senza `data` quando il nome combacia
   * con una voce che qualcuno ha tolto dal catalogo: non ha creato niente, e
   * non c'e' nessun uid da salvare. Non e' un errore.
   */
  it("una risposta senza uid non scrive niente e non solleva", async () => {
    const id = await createExercise({ ...proposta });
    mockApiRequest.mockResolvedValue({ ok: true });

    await submitExerciseToCatalog(id, proposta);

    expect((await getExercise(id))?.catalog_uid).toBeNull();
  });

  /**
   * Il difetto chiuso qui: prima si ritrovava la voce cercando il nome
   * PRECEDENTE fra le voci pubblicate, e una proposta in attesa non e' fra
   * quelle - quindi ogni correzione depositava una seconda proposta.
   */
  it("corregge la propria proposta per uid, senza cercarla per nome", async () => {
    const id = await createExercise({
      ...proposta,
      catalogUid: "uuid-della-proposta",
    });
    const riga = await getExercise(id);
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-della-proposta" } });

    await amendExerciseSubmission(riga!, { ...proposta, name: "Military press" });

    expect(mockApiRequest).toHaveBeenCalledTimes(1);
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "patch",
        path: "/catalog/exercises/uuid-della-proposta",
      }),
    );
  });

  /** Senza uid non c'e' niente da correggere: si propone come nuova. */
  it("una riga senza uid diventa una proposta nuova", async () => {
    const id = await createExercise({ ...proposta });
    const riga = await getExercise(id);
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-nuovo" } });

    await amendExerciseSubmission(riga!, proposta);

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "post" }),
    );
    expect((await getExercise(id))?.catalog_uid).toBe("uuid-nuovo");
  });

  it("ritira la propria proposta per uid", async () => {
    const id = await createExercise({
      ...proposta,
      catalogUid: "uuid-della-proposta",
    });
    const riga = await getExercise(id);
    mockApiRequest.mockResolvedValue({ ok: true });

    await withdrawExerciseSubmission(riga!);

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "delete",
        path: "/catalog/exercises/uuid-della-proposta",
      }),
    );
  });

  it("senza uid non chiede niente al server", async () => {
    const id = await createExercise({ ...proposta });
    const riga = await getExercise(id);

    await withdrawExerciseSubmission(riga!);

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("senza account non propone niente", async () => {
    useAccountStore.setState({ token: null, profile: null });
    const id = await createExercise({ ...proposta });

    await submitExerciseToCatalog(id, proposta);

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  /**
   * La voce e' gia' salvata sul telefono quando questa parte: se il catalogo
   * non risponde, l'utente non deve vedere niente di rotto.
   */
  it("un 403 su una voce gia' pubblicata non solleva", async () => {
    const id = await createExercise({
      ...proposta,
      catalogUid: "uuid-della-proposta",
    });
    const riga = await getExercise(id);
    mockApiRequest.mockRejectedValue(new Error("403"));

    await expect(
      amendExerciseSubmission(riga!, proposta),
    ).resolves.toBeUndefined();
  });

  it("gli alimenti seguono le stesse tre regole", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
    });
    mockApiRequest.mockResolvedValue({ data: { uid: "uuid-riso" } });

    await submitFoodToCatalog(id, { name: "Riso", nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 } });
    expect((await getFood(id))?.catalog_uid).toBe("uuid-riso");

    const riga = await getFood(id);
    mockApiRequest.mockClear();
    mockApiRequest.mockResolvedValue({ ok: true });
    await withdrawFoodSubmission(riga!);
    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "delete",
        path: "/catalog/foods/uuid-riso",
      }),
    );
  });
});
```

- [ ] **Step 2: Lanciali e verifica che falliscano**

Run: `npm test -- src/services/catalogSync.test.ts`
Expected: FAIL, `submitExerciseToCatalog is not a function`.

- [ ] **Step 3: Scrivi le sei entrate**

In coda a `src/services/catalogSync.ts`:

```ts
/**
 * Quel che di una voce si propone al catalogo.
 *
 * E' il minimo che serve a riconoscerla: nome, gruppo, muscoli, attrezzi. Le
 * note, il livello di antipatia e le istruzioni restano sul telefono - sono
 * giudizi personali su un esercizio, non la sua descrizione. Le istruzioni
 * arrivano al catalogo dal gestionale, che e' il posto dove si scrivono per
 * una voce che serve a tutti.
 */
export interface ExerciseProposal {
  name: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  equipment: string[];
}

const toSubmission = (input: ExerciseProposal): catalog.ExerciseSubmission => ({
  name: input.name,
  muscleGroup: input.muscleGroup,
  secondaryMuscles: input.secondaryMuscles.join(","),
  equipment: input.equipment.join(","),
});

/**
 * Propone un esercizio al catalogo, e si tiene l'uid che il server risponde.
 *
 * L'uid e' il pezzo che mancava: senza, la correzione successiva doveva
 * ritrovare la voce cercandone il nome fra quelle **pubblicate** - e una
 * proposta in attesa non e' fra quelle, quindi depositava una seconda
 * proposta ogni volta.
 *
 * Non solleva e non blocca: l'esercizio e' gia' salvato sul telefono quando
 * questa parte, e senza rete o senza account resta comunque utilizzabile.
 */
export async function submitExerciseToCatalog(
  localId: string,
  input: ExerciseProposal,
): Promise<void> {
  try {
    if (!attivo()) return;
    const esito = await catalog.submitExercise(toSubmission(input));
    // `null` quando il server non ha creato niente: il nome combacia con una
    // voce tolta dal catalogo. Non e' un errore, e non c'e' uid da salvare.
    if (esito) await setExerciseCatalogUid(localId, esito.uid);
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] esercizio non proposto", error);
    }
  }
}

/**
 * Corregge la propria proposta.
 *
 * Senza uid non c'e' niente da correggere e si propone come nuova: e' la
 * riga di chi ha creato l'esercizio senza rete, o prima di questa versione.
 *
 * Il server rifiuta con 403 una voce che non e' propria o che e' gia'
 * pubblicata, ed e' previsto: da pubblicata in poi la voce e' nell'app di
 * tutti e correggerla la cambierebbe a chiunque. La copia dell'autore resta
 * sul telefono, dove nessuno gliela tocca.
 */
export async function amendExerciseSubmission(
  row: ExerciseRow,
  input: ExerciseProposal,
): Promise<void> {
  try {
    if (!attivo()) return;
    if (row.catalog_uid === null) {
      await submitExerciseToCatalog(row.id, input);
      return;
    }
    await catalog.amendExercise(row.catalog_uid, toSubmission(input));
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] esercizio non corretto in catalogo", error);
    }
  }
}

/** Ritira la propria proposta, se ne ha una. */
export async function withdrawExerciseSubmission(
  row: ExerciseRow,
): Promise<void> {
  try {
    if (!attivo()) return;
    if (row.catalog_uid === null) return;
    await catalog.withdrawExercise(row.catalog_uid);
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] esercizio non ritirato", error);
    }
  }
}

const toFoodSubmission = (input: FoodInput): catalog.FoodSubmission => ({
  name: input.name,
  brand: input.brand ?? null,
  kcal: input.nutrients.kcal,
  protein: input.nutrients.protein,
  carbs: input.nutrients.carbs,
  sugars: input.nutrients.sugars,
  fat: input.nutrients.fat,
  saturatedFat: input.nutrients.saturatedFat,
  fiber: input.nutrients.fiber,
  salt: input.nutrients.salt,
  isLiquid: input.isLiquid ?? false,
  defaultServingG: input.defaultServingG ?? null,
  servingLabel: input.servingLabel ?? null,
});

/** Come `submitExerciseToCatalog`. `barcode` e `off_id` non escono: sono di qui. */
export async function submitFoodToCatalog(
  localId: string,
  input: FoodInput,
): Promise<void> {
  try {
    if (!attivo()) return;
    const esito = await catalog.submitFood(toFoodSubmission(input));
    if (esito) await setFoodCatalogUid(localId, esito.uid);
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] alimento non proposto", error);
    }
  }
}

/** Come `amendExerciseSubmission`. */
export async function amendFoodSubmission(
  row: FoodRow,
  input: FoodInput,
): Promise<void> {
  try {
    if (!attivo()) return;
    if (row.catalog_uid === null) {
      await submitFoodToCatalog(row.id, input);
      return;
    }
    await catalog.amendFood(row.catalog_uid, toFoodSubmission(input));
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] alimento non corretto in catalogo", error);
    }
  }
}

/** Come `withdrawExerciseSubmission`. */
export async function withdrawFoodSubmission(row: FoodRow): Promise<void> {
  try {
    if (!attivo()) return;
    if (row.catalog_uid === null) return;
    await catalog.withdrawFood(row.catalog_uid);
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] alimento non ritirato", error);
    }
  }
}
```

Gli import del modulo si estendono con `setFoodCatalogUid`, `type FoodRow`,
`type FoodInput` (`@/src/types/nutrition`) e `type ExerciseRow`
(`@/src/types/gym`).

- [ ] **Step 4: Lancia i test**

Run: `npm test -- src/services/catalogSync.test.ts`
Expected: PASS.

- [ ] **Step 5: `ExerciseFormSheet` propone per uid**

In `src/containers/gym/ExerciseFormSheet.tsx` sostituisci l'import di
`publishToCatalog`/`updatePublishedExercise` con `submitExerciseToCatalog` e
`amendExerciseSubmission` da `@/src/services/catalogSync`, e dentro `salva`:

```ts
      if (editing) {
        await updateExercise(editing.id, { /* invariato */ });
        // Per uid, e non piu' col nome di prima: una proposta in attesa non
        // e' fra le voci pubblicate, quindi cercarla per nome ne depositava
        // una seconda a ogni correzione.
        void amendExerciseSubmission(editing, {
          name: nome,
          muscleGroup,
          secondaryMuscles: secondary,
          equipment,
        });
      } else {
        const nuovoId = await createExercise({ /* invariato */ });

        // Il catalogo e' un di piu' e non blocca: l'esercizio e' gia' salvato
        // qui, e senza rete resta comunque utilizzabile.
        void submitExerciseToCatalog(nuovoId, {
          name: nome,
          muscleGroup,
          secondaryMuscles: secondary,
          equipment,
        });
      }
```

`createExercise` torna gia' l'id: prima non veniva raccolto perche' non
serviva a nessuno, ora serve a sapere su quale riga scrivere l'uid.

- [ ] **Step 6: `ExerciseDetailScreen` ritira per uid**

Sostituisci l'import di `unpublishExercise` con `withdrawExerciseSubmission`
da `@/src/services/catalogSync` e la riga dentro `onDelete`:

```ts
    // Ritira anche la propria proposta, se ce n'era una: la riga porta l'uid,
    // quindi non c'e' niente da cercare per nome.
    void withdrawExerciseSubmission(exercise);
```

L'ordine resta questo: `deleteExercise` **prima**, il ritiro dopo. La riga
locale e' quel che conta, e il catalogo e' un di piu'.

- [ ] **Step 7: `FoodFormScreen` propone, corregge e ritira per uid**

Sostituisci gli import di `publishFood`/`updatePublishedFood`/`unpublishFood`
con `submitFoodToCatalog`, `amendFoodSubmission`, `withdrawFoodSubmission` da
`@/src/services/catalogSync`. In `onSubmit`:

```ts
    if (id) {
      await updateFood(id, input);
      /*
       * Per uid, non col nome di prima. Il commento che c'era diceva che il
       * nome precedente serviva a ritrovare la voce: era vero finche' la voce
       * si cercava per nome, ed era anche il motivo per cui non la ritrovava
       * mai - una proposta in attesa non compare fra le voci pubblicate.
       */
      if (initial) void amendFoodSubmission(initial, input);
    } else {
      const nuovoId = await createFood({ ...input, barcode });
      void submitFoodToCatalog(nuovoId, input);
    }
```

e in `onDelete`:

```ts
  const onDelete = async () => {
    if (!id) return;
    await deleteFood(id);
    // Ritira anche la propria proposta, se ce n'era una.
    if (initial) void withdrawFoodSubmission(initial);
    setConfirmDelete(false);
    showToast.success({ title: t("foods.deleted") });
    goBack();
  };
```

`initial` e' la `FoodRow` che la schermata ha gia' caricato per riempire i
campi: porta `catalog_uid`, quindi la variabile `nomePrecedente` non serve
piu' e va via.

- [ ] **Step 8: Togli i due servizi vecchi e le sei funzioni di `social.ts`**

```bash
git rm src/services/exerciseCatalog.ts src/services/exerciseCatalog.test.ts \
  src/services/foodCatalog.ts
```

In `src/api/social.ts` togli `searchCatalogExercises`, `addCatalogExercise`,
`updateCatalogExercise`, `deleteCatalogExercise`, `searchCatalogFoods`,
`addCatalogFood`, `updateCatalogFood`, `deleteCatalogFood` e i tipi che
restano senza chiamanti (`CatalogExercise`, `CatalogFood`, `CatalogPage`,
`CatalogExerciseInput`, `CatalogFoodInput`). **Prima di togliere ciascuno**:
`grep -rn "<nome>" src/` per accertarsi che nessuno lo importi ancora - se
qualcuno lo fa, quel chiamante e' un pezzo di questo task che manca.

- [ ] **Step 9: I tre cancelli**

Run: `npm run typecheck` && `npm run lint` && `npm test`
Expected: PASS. Il typecheck e' il controllo vero di questo passo: se un
import di `exerciseCatalog` o `foodCatalog` e' rimasto in giro, lo dice.

- [ ] **Step 10: Commit**

```bash
git add -A src/services src/api/social.ts src/containers/gym/ExerciseFormSheet.tsx \
  src/navigation/screens/ExerciseDetailScreen.tsx \
  src/navigation/screens/FoodFormScreen.tsx
git commit -m "$(cat <<'EOF'
fix(catalogo): una propria proposta si corregge per uid, non cercandola per nome

`exerciseCatalog.ts` e `foodCatalog.ts` confluiscono in `catalogSync.ts`:
`publishToCatalog` diventa `submitExerciseToCatalog`, `updatePublishedExercise`
`amendExerciseSubmission`, `unpublishExercise` `withdrawExerciseSubmission`, e
i tre gemelli per gli alimenti. La proposta salva in colonna l'uid che il
server risponde, e da li' in poi la voce si indirizza direttamente.

Il difetto chiuso e' distinto da quello del pull. `miaInCatalogo` cercava il
nome PRECEDENTE fra le voci di `/api/exercises`, che dalla Fase 1 filtra
`status = 'published'`: una proposta in attesa non e' li' dentro, quindi ogni
correzione fatta prima dell'approvazione depositava una SECONDA proposta per la
stessa cosa. E dopo una rinomina dal pannello, il nome vecchio non la ritrovava
piu' comunque.

Le sei funzioni di catalogo di `social.ts` e i loro tipi vanno via: nessuno le
chiama piu'. Le rotte corrispondenti restano vive sul server per i telefoni
con la build di ieri.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 10: le tassonomie in tabella

`MUSCLE_GROUPS` ed `EQUIPMENT` smettono di essere l'elenco autorevole e
diventano il **seme** di due tabelle locali, che dal task 11 il server
riscrive. Le etichette del seme sono quelle di `gym.muscle.*` e
`gym.equipment.*` di `it.json` e `en.json`, e l'ordine e' quello di
`TaxonomySeeder` sul server: le due parti devono nascere identiche, o il primo
pull riordinerebbe l'elenco senza motivo.

**Files:**
- Create: `src/db/migrations/020_taxonomies.ts`
- Create: `src/db/queries/taxonomies.ts`
- Create: `src/db/queries/taxonomies.test.ts`
- Modify: `src/db/migrations/index.ts`
- Modify: `src/services/sync.ts` (`LOCAL_ONLY_TABLES`)
- Modify: `src/services/backup.ts` (`BACKUP_TABLES`)

**Interfaces:**
- Produces:
  ```ts
  // src/db/queries/taxonomies.ts
  export type TaxonomyKind = "muscle_groups" | "equipment_types";
  export interface TaxonomyRow {
    slug: string;
    label_it: string;
    label_en: string;
    sort: number;
    deleted_at: string | null;
  }
  export function listTaxonomy(kind: TaxonomyKind): Promise<TaxonomyRow[]>
  export function listAllTaxonomy(kind: TaxonomyKind): Promise<TaxonomyRow[]>
  export function replaceTaxonomy(kind: TaxonomyKind, rows: TaxonomyRow[]): Promise<void>
  ```

- [ ] **Step 1: Scrivi la migrazione 020**

`src/db/migrations/020_taxonomies.ts`. I ventitre' `INSERT` sono scritti per
esteso: sono il seme, e generarli da un array in TypeScript vorrebbe dire una
migrazione che dipende da una costante che questo stesso lavoro rende non piu'
autorevole.

```ts
import type { Migration } from "@/src/db/migrations/types";

/**
 * I gruppi muscolari e l'attrezzatura, come righe invece che come union.
 *
 * Fin qui erano `MUSCLE_GROUPS` ed `EQUIPMENT` in `src/types/gym.ts`, cioe'
 * un elenco chiuso dal compilatore: aggiungere un gruppo voleva dire un
 * rilascio dell'app. Dalla Fase 1 del gestionale sono tabelle sul server, e un
 * amministratore ne aggiunge uno dal pannello; qui arrivano col pull, e le
 * costanti restano soltanto come SEME di questa migrazione.
 *
 * LO SLUG E' LA CHIAVE E NON CAMBIA MAI. E' quel che sta in colonna su
 * `exercises.muscle_group` e dentro i JSON di `equipment` e
 * `secondary_muscles`: rinominare "Femorali" in "Ischiocrurali" cambia
 * `label_it`, non lo slug, o ogni esercizio che lo nomina resterebbe orfano.
 *
 * DUE COLONNE DI ETICHETTA E NON UNA CHIAVE i18n: un gruppo aggiunto dal
 * pannello non ha una chiave in `it.json` per definizione, e arriva con la
 * propria etichetta gia' scritta da chi l'ha creato. Le chiavi `gym.muscle.*`
 * restano come ricaduta per i ventitre' che ci sono oggi.
 *
 * `deleted_at` e non una riga tolta: sul telefono ci sono esercizi che
 * nominano quello slug, e togliere la riga li lascerebbe senza etichetta - chi
 * la cerca penserebbe a un difetto dell'app. E' la stessa scelta di `hidden`
 * sui tipi di pasto: chi OFFRE UNA SCELTA legge i vivi, chi DISEGNA QUEL CHE
 * C'E' GIA' legge tutti.
 *
 * L'ordine dei `sort` e le etichette sono gli stessi di
 * `backend/database/seeders/TaxonomySeeder.php`: le due parti devono nascere
 * identiche, o il primo pull riordinerebbe l'elenco senza che sia cambiato
 * niente.
 */
export const migration020: Migration = {
  version: 20,
  name: "taxonomies",
  up: `
CREATE TABLE muscle_groups (
  slug TEXT PRIMARY KEY,
  label_it TEXT NOT NULL,
  label_en TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE TABLE equipment_types (
  slug TEXT PRIMARY KEY,
  label_it TEXT NOT NULL,
  label_en TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

INSERT INTO muscle_groups (slug, label_it, label_en, sort) VALUES
  ('petto', 'Petto', 'Chest', 10),
  ('schiena', 'Schiena', 'Back', 20),
  ('spalle', 'Spalle', 'Shoulders', 30),
  ('bicipiti', 'Bicipiti', 'Biceps', 40),
  ('tricipiti', 'Tricipiti', 'Triceps', 50),
  ('avambracci', 'Avambracci', 'Forearms', 60),
  ('addome', 'Addome', 'Abs', 70),
  ('quadricipiti', 'Quadricipiti', 'Quads', 80),
  ('femorali', 'Femorali', 'Hamstrings', 90),
  ('glutei', 'Glutei', 'Glutes', 100),
  ('polpacci', 'Polpacci', 'Calves', 110),
  ('full_body', 'Full body', 'Full body', 120);

INSERT INTO equipment_types (slug, label_it, label_en, sort) VALUES
  ('corpo_libero', 'Corpo libero', 'Bodyweight', 10),
  ('bilanciere', 'Bilanciere', 'Barbell', 20),
  ('manubri', 'Manubri', 'Dumbbells', 30),
  ('kettlebell', 'Kettlebell', 'Kettlebell', 40),
  ('cavi', 'Cavi', 'Cables', 50),
  ('macchina', 'Macchina', 'Machine', 60),
  ('panca', 'Panca', 'Bench', 70),
  ('sbarra', 'Sbarra', 'Pull-up bar', 80),
  ('elastici', 'Elastici', 'Resistance bands', 90),
  ('trx', 'TRX', 'TRX', 100),
  ('cardio', 'Cardio', 'Cardio', 110);
`,
};
```

- [ ] **Step 2: Registrala e dichiara le due tabelle**

In `src/db/migrations/index.ts`, l'import e la voce in `MIGRATIONS`.

In `src/services/sync.ts`, dentro `LOCAL_ONLY_TABLES`:

```ts
  /*
   * Le tassonomie sono la copia locale di un elenco che il server pubblica
   * per tutti: si ricostruiscono col pull, e mandarle al server vorrebbe dire
   * rispedirgli quel che ha appena mandato lui. Non sono dati dell'utente -
   * quel che l'utente decide sull'attrezzatura sta in `user_equipment`, che
   * invece viaggia.
   */
  muscle_groups: "copia locale del catalogo comune, si ricostruisce dal server",
  equipment_types: "copia locale del catalogo comune, si ricostruisce dal server",
```

In `src/services/backup.ts`, dentro `BACKUP_TABLES`, nel blocco "senza
dipendenze":

```ts
  "muscle_groups",
  "equipment_types",
```

`backup.test.ts` pretende che `BACKUP_TABLES` sia **esattamente** l'elenco
delle tabelle dello schema: se manca, il test lo dice. Le due tabelle entrano
nel backup anche se si ricostruiscono dal server, perche' un ripristino su un
telefono senza rete deve poter disegnare le etichette.

- [ ] **Step 3: Scrivi i test delle query**

`src/db/queries/taxonomies.test.ts`:

```ts
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  listAllTaxonomy,
  listTaxonomy,
  replaceTaxonomy,
} from "@/src/db/queries/taxonomies";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/src/types/gym";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("il seme della migrazione 020", () => {
  /**
   * Il seme e le costanti devono coincidere: le costanti restano il minimo
   * garantito - quello che `keys.test.ts` controlla contro i18n - e un gruppo
   * aggiunto alle costanti senza aggiungerlo alla migrazione sarebbe un
   * gruppo che il compilatore conosce e il database no.
   */
  it("semina gli stessi slug delle costanti", async () => {
    const muscoli = await listTaxonomy("muscle_groups");
    expect(muscoli.map((r) => r.slug).sort()).toEqual(
      [...MUSCLE_GROUPS].sort(),
    );

    const attrezzi = await listTaxonomy("equipment_types");
    expect(attrezzi.map((r) => r.slug).sort()).toEqual([...EQUIPMENT].sort());
  });

  it("li ordina per `sort` e non alfabeticamente", async () => {
    const muscoli = await listTaxonomy("muscle_groups");
    expect(muscoli[0].slug).toBe("petto");
    expect(muscoli.at(-1)?.slug).toBe("full_body");
  });

  it("porta le etichette nelle due lingue", async () => {
    const [petto] = await listTaxonomy("muscle_groups");
    expect(petto.label_it).toBe("Petto");
    expect(petto.label_en).toBe("Chest");
  });
});

describe("replaceTaxonomy", () => {
  it("aggiorna un'etichetta e aggiunge uno slug nuovo", async () => {
    await replaceTaxonomy("muscle_groups", [
      { slug: "femorali", label_it: "Ischiocrurali", label_en: "Hamstrings", sort: 90, deleted_at: null },
      { slug: "trapezi", label_it: "Trapezi", label_en: "Traps", sort: 130, deleted_at: null },
    ]);

    const righe = await listTaxonomy("muscle_groups");
    expect(righe.find((r) => r.slug === "femorali")?.label_it).toBe(
      "Ischiocrurali",
    );
    expect(righe.find((r) => r.slug === "trapezi")?.label_en).toBe("Traps");
    // Gli altri undici restano: il server manda un elenco, non una verita'
    // esclusiva su quel che deve esistere in locale.
    expect(righe).toHaveLength(13);
  });

  /**
   * Uno slug cancellato dal pannello resta in tabella con la sua data: gli
   * esercizi che lo nominano devono continuare ad avere un'etichetta.
   */
  it("una riga cancellata esce da `listTaxonomy` e resta in `listAllTaxonomy`", async () => {
    await replaceTaxonomy("muscle_groups", [
      { slug: "avambracci", label_it: "Avambracci", label_en: "Forearms", sort: 60, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);

    const vivi = await listTaxonomy("muscle_groups");
    const tutti = await listAllTaxonomy("muscle_groups");

    expect(vivi.map((r) => r.slug)).not.toContain("avambracci");
    expect(tutti.map((r) => r.slug)).toContain("avambracci");
    expect(tutti.find((r) => r.slug === "avambracci")?.label_it).toBe(
      "Avambracci",
    );
  });

  /** Ripristinata dal pannello, torna in elenco. */
  it("una riga ripristinata torna fra i vivi", async () => {
    await replaceTaxonomy("muscle_groups", [
      { slug: "avambracci", label_it: "Avambracci", label_en: "Forearms", sort: 60, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);
    await replaceTaxonomy("muscle_groups", [
      { slug: "avambracci", label_it: "Avambracci", label_en: "Forearms", sort: 60, deleted_at: null },
    ]);

    expect(
      (await listTaxonomy("muscle_groups")).map((r) => r.slug),
    ).toContain("avambracci");
  });

  it("un elenco vuoto non cancella niente", async () => {
    await replaceTaxonomy("muscle_groups", []);

    expect(await listTaxonomy("muscle_groups")).toHaveLength(12);
  });
});
```

- [ ] **Step 4: Lanciali e verifica che falliscano**

Run: `npm test -- src/db/queries/taxonomies.test.ts`
Expected: FAIL, `Cannot find module '@/src/db/queries/taxonomies'`.

- [ ] **Step 5: Scrivi le query**

`src/db/queries/taxonomies.ts`:

```ts
import { getDb } from "@/src/db/index";

/**
 * I gruppi muscolari e l'attrezzatura, copia locale di quel che il server
 * pubblica per tutti.
 *
 * DUE LETTURE E NON UNA, ed e' la stessa distinzione dei tipi di pasto:
 * `listTaxonomy` esclude i cancellati ed e' la lettura di chi OFFRE UNA
 * SCELTA - il selettore del gruppo muscolare, i chip dell'attrezzatura;
 * `listAllTaxonomy` li comprende ed e' la lettura di chi DISEGNA QUEL CHE C'E'
 * GIA' - l'etichetta di un esercizio che nomina quello slug in colonna.
 *
 * Chiunque aggiunga una lettura deve scegliere, e la domanda e' sempre la
 * stessa: sto offrendo una scelta o sto disegnando quel che c'e' gia'?
 */

/** Il nome della tabella, che e' anche il tipo di tassonomia. */
export type TaxonomyKind = "muscle_groups" | "equipment_types";

export interface TaxonomyRow {
  slug: string;
  label_it: string;
  label_en: string;
  sort: number;
  deleted_at: string | null;
}

/*
 * Il nome della tabella si interpola nella query, quindi non puo' venire da
 * fuori: `TaxonomyKind` e' un'unione di due letterali e il compilatore non
 * lascia passare altro. Un identificatore SQL non si puo' legare con un
 * parametro, e questa e' la ragione per cui il tipo e' cosi' stretto.
 */

/** Gli slug che si possono offrire in una scelta: i cancellati non ci sono. */
export async function listTaxonomy(
  kind: TaxonomyKind,
): Promise<TaxonomyRow[]> {
  const db = await getDb();
  return db.getAllAsync<TaxonomyRow>(
    `SELECT * FROM ${kind} WHERE deleted_at IS NULL ORDER BY sort, slug`,
  );
}

/** Tutti, cancellati compresi: serve a disegnare l'etichetta di quel che c'e'. */
export async function listAllTaxonomy(
  kind: TaxonomyKind,
): Promise<TaxonomyRow[]> {
  const db = await getDb();
  return db.getAllAsync<TaxonomyRow>(
    `SELECT * FROM ${kind} ORDER BY sort, slug`,
  );
}

/**
 * Scrive quel che il server ha mandato.
 *
 * E' un upsert per slug e NON una riscrittura in blocco: cancellare e
 * reinserire lascerebbe, fra le due operazioni, un istante in cui nessuno
 * slug esiste - e una schermata che leggesse li' in mezzo disegnerebbe un
 * elenco vuoto. Ed e' anche il motivo per cui un elenco vuoto non cancella
 * niente: una risposta vuota e' una risposta che non dice niente, non un
 * ordine di svuotare la tabella.
 *
 * `deleted_at` si scrive sempre, anche a null: e' cosi' che una riga
 * ripristinata dal pannello torna in elenco.
 */
export async function replaceTaxonomy(
  kind: TaxonomyKind,
  rows: TaxonomyRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        `INSERT INTO ${kind} (slug, label_it, label_en, sort, deleted_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           label_it = excluded.label_it,
           label_en = excluded.label_en,
           sort = excluded.sort,
           deleted_at = excluded.deleted_at`,
        [row.slug, row.label_it, row.label_en, row.sort, row.deleted_at],
      );
    }
  });
}
```

- [ ] **Step 6: Lancia tutto**

Run: `npm test -- src/db/queries/taxonomies.test.ts src/services/sync.test.ts src/services/backup.test.ts src/db/migrations/migrations.test.ts`
Expected: PASS. I tre test che guardano gli elenchi contro `sqlite_master`
sono il controllo vero di questo passo.

Run: `npm run typecheck` && `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/migrations/020_taxonomies.ts src/db/migrations/index.ts \
  src/db/queries/taxonomies.ts src/db/queries/taxonomies.test.ts \
  src/services/sync.ts src/services/backup.ts
git commit -m "$(cat <<'EOF'
feat(catalogo): gruppi muscolari e attrezzatura come tabelle locali

Migrazione 020: `muscle_groups` e `equipment_types` con slug come chiave,
etichetta in italiano e in inglese, ordine e `deleted_at`. Seminate dalle
costanti di `src/types/gym.ts`, con le etichette di `gym.muscle.*` e
`gym.equipment.*` e gli stessi `sort` di `TaxonomySeeder` sul server: le due
parti nascono identiche, o il primo pull riordinerebbe l'elenco senza che sia
cambiato niente.

Due letture e non una, la stessa distinzione dei tipi di pasto:
`listTaxonomy` esclude i cancellati ed e' la lettura di chi offre una scelta,
`listAllTaxonomy` li comprende ed e' la lettura di chi disegna quel che c'e'
gia'. Uno slug cancellato dal pannello resta in tabella, perche' sul telefono
ci sono esercizi che lo nominano in colonna.

`replaceTaxonomy` e' un upsert e non una riscrittura in blocco: cancellare e
reinserire lascerebbe un istante in cui nessuno slug esiste. Un elenco vuoto
non cancella niente - una risposta vuota non dice niente, non ordina di
svuotare la tabella.

Le due tabelle sono in `LOCAL_ONLY_TABLES` con il motivo (copia locale di un
elenco pubblicato per tutti) e in `BACKUP_TABLES`, che il test pretende
identico allo schema.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 11: le tassonomie in memoria, e i due tipi che diventano `string`

Quel che il compilatore smette di garantire va garantito altrove: il metro
diventa la tabella, non l'union.

**Files:**
- Create: `src/domain/taxonomy.ts`
- Create: `src/domain/taxonomy.test.ts`
- Create: `src/stores/taxonomyStore.ts`
- Modify: `src/types/gym.ts`
- Modify: `src/services/catalogSync.ts` (il pull delle tassonomie)
- Modify: `src/services/catalogSync.test.ts`
- Modify: `src/App.tsx` (l'idratazione all'avvio)

**Interfaces:**
- Consumes: `listAllTaxonomy`, `replaceTaxonomy`, `TaxonomyRow` (task 10),
  `fetchTaxonomies` (task 2), `i18n` (`src/i18n`).
- Produces:
  ```ts
  // src/domain/taxonomy.ts
  export function taxonomyLabel(
    rows: TaxonomyRow[], slug: string, language: string, fallback: (slug: string) => string,
  ): string
  export function knownSlugs(rows: TaxonomyRow[]): Set<string>

  // src/stores/taxonomyStore.ts
  export interface TaxonomyState {
    muscleGroups: TaxonomyRow[];   // tutti, cancellati compresi
    equipment: TaxonomyRow[];
    liveMuscleGroups: TaxonomyRow[]; // quel che si puo' offrire in una scelta
    liveEquipment: TaxonomyRow[];
    muscleLabel: (slug: string) => string;
    equipmentLabel: (slug: string) => string;
    hydrate: () => Promise<void>;
  }
  export const useTaxonomyStore: UseBoundStore<StoreApi<TaxonomyState>>;

  // src/services/catalogSync.ts
  export function pullTaxonomies(): Promise<void>
  ```

- [ ] **Step 1: I due tipi diventano `string`**

In `src/types/gym.ts`, sopra `MUSCLE_GROUPS`:

```ts
/**
 * I gruppi muscolari: il SEME della migrazione 020, non piu' l'elenco
 * autorevole.
 *
 * L'elenco vero e' `muscle_groups` in SQLite, che il pull del catalogo
 * riscrive: un gruppo aggiunto dal pannello arriva senza un rilascio
 * dell'app, e un'union TypeScript non puo' rappresentarlo. Queste costanti
 * restano per tre cose e nessun'altra: seminare la tabella, dare a
 * `keys.test.ts` il minimo garantito da confrontare con i18n, e dire quali
 * slug hanno un'etichetta di ricaduta in `gym.muscle.*`.
 *
 * Chi filtra un valore che arriva da fuori NON usa piu' queste: il metro e'
 * la tassonomia (`knownSlugs` in `src/domain/taxonomy.ts`).
 */
export const MUSCLE_GROUPS = [ /* invariato */ ] as const;

/**
 * Uno slug di gruppo muscolare.
 *
 * Era un'union dei dodici valori qui sopra. Adesso e' `string`, perche'
 * l'elenco vive in una tabella che il server riscrive: il compilatore non
 * puo' piu' garantirlo, e il controllo si fa a runtime contro la tassonomia.
 */
export type MuscleGroup = string;
```

Lo stesso trattamento per `EQUIPMENT` / `Equipment`, con il rimando
(`/** Come MUSCLE_GROUPS: seme, non elenco autorevole. */`).

`ALWAYS_AVAILABLE_EQUIPMENT` resta com'e': `corpo_libero` non e' cancellabile
sul server ed e' l'unico slug su cui il codice fa un'affermazione propria.

- [ ] **Step 2: Lancia il typecheck e guarda cosa si rompe**

Run: `npm run typecheck`
Expected: PASS, o pochissimi errori. Allargare un'union a `string` non rompe
chi la consuma; rompe chi ci fa un `switch` esaustivo o indicizza un
`Record<MuscleGroup, X>`. Se compare un errore del genere, si sistema **qui**,
prendendo una ricaduta neutra per lo slug che non si conosce - un gruppo nuovo
si vede grigio, non fa sparire la schermata. `grep -rn "Record<MuscleGroup\|Record<Equipment" src/`
dice subito se ce ne sono.

- [ ] **Step 3: Scrivi la funzione pura e i suoi test**

`src/domain/taxonomy.ts`:

```ts
import type { TaxonomyRow } from "@/src/db/queries/taxonomies";

/**
 * L'etichetta di uno slug, nella lingua chiesta.
 *
 * Tre gradini, in quest'ordine e per ragioni diverse:
 *
 * 1. LA RIGA DELLA TASSONOMIA. E' il caso normale, e l'unico che funziona per
 *    un gruppo aggiunto dal pannello: arriva con la propria etichetta gia'
 *    scritta da chi l'ha creato, ed e' il motivo per cui la tabella ha due
 *    colonne di etichetta e non una chiave i18n.
 * 2. LA CHIAVE i18n, per i ventitre' slug del seme. Serve solo se la tabella
 *    non e' ancora stata letta - all'avvio, prima dell'idratazione - e non e'
 *    ridondanza: senza, quella frazione di secondo mostrerebbe degli slug.
 * 3. LO SLUG. Uno slug crudo e' brutto; `[missing "en.gym.muscle.trapezi"]`
 *    e' un difetto a schermo.
 *
 * `language` si passa e non si legge da `i18n` qui dentro: `src/domain/` non
 * conosce React ne' i18n, e questo e' il modulo che si puo' provare in jest
 * senza montare niente.
 */
export function taxonomyLabel(
  rows: TaxonomyRow[],
  slug: string,
  language: string,
  fallback: (slug: string) => string,
): string {
  const riga = rows.find((r) => r.slug === slug);
  if (riga) return language === "it" ? riga.label_it : riga.label_en;

  const dai18n = fallback(slug);
  // i18n restituisce `[missing "..."]` invece di sollevare: e' testo, e a
  // schermo sembra un difetto dell'app. Meglio lo slug.
  return dai18n.includes("missing") ? slug : dai18n;
}

/**
 * Gli slug che la tassonomia conosce, CANCELLATI COMPRESI.
 *
 * Serve a filtrare quel che arriva dal catalogo, e li' un gruppo cancellato
 * dal pannello e' ancora uno slug noto: gli esercizi che lo nominano non
 * diventano sbagliati perche' non si offre piu' in una scelta.
 */
export const knownSlugs = (rows: TaxonomyRow[]): Set<string> =>
  new Set(rows.map((r) => r.slug));
```

`src/domain/taxonomy.test.ts`:

```ts
import { knownSlugs, taxonomyLabel } from "@/src/domain/taxonomy";
import type { TaxonomyRow } from "@/src/db/queries/taxonomies";

const riga = (over: Partial<TaxonomyRow> = {}): TaxonomyRow => ({
  slug: "petto",
  label_it: "Petto",
  label_en: "Chest",
  sort: 10,
  deleted_at: null,
  ...over,
});

describe("taxonomyLabel", () => {
  it("prende l'etichetta della riga, nella lingua chiesta", () => {
    const righe = [riga()];
    expect(taxonomyLabel(righe, "petto", "it", () => "!")).toBe("Petto");
    expect(taxonomyLabel(righe, "petto", "en", () => "!")).toBe("Chest");
  });

  /** Prima dell'idratazione la tabella non e' ancora stata letta. */
  it("ricade su i18n quando la riga non c'e'", () => {
    expect(taxonomyLabel([], "petto", "it", () => "Petto")).toBe("Petto");
  });

  /**
   * Uno slug aggiunto dal pannello non ha una chiave i18n per definizione, e
   * `[missing "en.gym.muscle.trapezi"]` a schermo sembra un difetto dell'app.
   */
  it("ricade sullo slug quando nemmeno i18n lo conosce", () => {
    expect(
      taxonomyLabel([], "trapezi", "en", () => '[missing "en.gym.muscle.trapezi"]'),
    ).toBe("trapezi");
  });

  it("un gruppo cancellato ha comunque la sua etichetta", () => {
    const righe = [riga({ deleted_at: "2026-09-08T09:00:00+00:00" })];
    expect(taxonomyLabel(righe, "petto", "it", () => "!")).toBe("Petto");
  });
});

describe("knownSlugs", () => {
  /**
   * I cancellati sono noti: un esercizio che nomina quello slug non diventa
   * sbagliato perche' il gruppo non si offre piu' in una scelta.
   */
  it("comprende i cancellati", () => {
    const righe = [riga(), riga({ slug: "avambracci", deleted_at: "2026-09-08T09:00:00+00:00" })];
    expect(knownSlugs(righe).has("avambracci")).toBe(true);
    expect(knownSlugs(righe).has("branchie")).toBe(false);
  });
});
```

Run: `npm test -- src/domain/taxonomy.test.ts`
Expected: prima FAIL (modulo assente), poi PASS.

- [ ] **Step 4: Scrivi lo store**

`src/stores/taxonomyStore.ts`:

```ts
import {
  listAllTaxonomy,
  type TaxonomyRow,
} from "@/src/db/queries/taxonomies";
import { taxonomyLabel } from "@/src/domain/taxonomy";
import { i18n } from "@/src/i18n";
import { logger } from "@/src/utils/logger";
import { create } from "zustand";

/**
 * Le tassonomie in memoria, cosi' che un'etichetta non costi una query.
 *
 * Non e' persistito: la persistenza e' la tabella SQLite, e questo store ne
 * e' la copia in RAM. `hydrate()` la rilegge - all'avvio e dopo ogni pull del
 * catalogo.
 *
 * I DUE RISOLUTORI SI RICOSTRUISCONO A OGNI `hydrate`, e non e' uno spreco:
 * e' quel che rende reattivi i componenti. Un componente che seleziona
 * `muscleLabel` si ridisegna quando la funzione cambia identita', cioe'
 * quando le tassonomie sono cambiate. Se leggessero `get()` senza essere
 * ricreate, un gruppo rinominato dal pannello resterebbe scritto col nome
 * vecchio fino al riavvio.
 *
 * La lingua la leggono al momento della chiamata da `i18n.locale` e non la
 * catturano: al cambio lingua il navigatore si rimonta (vedi CLAUDE.md
 * § Lingua), quindi ogni etichetta si ricalcola comunque.
 */
export interface TaxonomyState {
  /** Tutti, cancellati compresi: per disegnare quel che c'e' gia'. */
  muscleGroups: TaxonomyRow[];
  equipment: TaxonomyRow[];
  /** Solo i vivi: per chi offre una scelta. */
  liveMuscleGroups: TaxonomyRow[];
  liveEquipment: TaxonomyRow[];
  muscleLabel: (slug: string) => string;
  equipmentLabel: (slug: string) => string;
  hydrate: () => Promise<void>;
}

const risolutore =
  (rows: TaxonomyRow[], prefisso: string) =>
  (slug: string): string =>
    taxonomyLabel(rows, slug, i18n.locale, (s) => i18n.t(`${prefisso}.${s}`));

export const useTaxonomyStore = create<TaxonomyState>()((set) => ({
  muscleGroups: [],
  equipment: [],
  liveMuscleGroups: [],
  liveEquipment: [],
  /*
   * Prima dell'idratazione i risolutori ricadono su i18n, che per i
   * ventitre' slug del seme risponde giusto: una schermata aperta nella
   * frazione di secondo prima di `hydrate` non mostra degli slug.
   */
  muscleLabel: risolutore([], "gym.muscle"),
  equipmentLabel: risolutore([], "gym.equipment"),

  hydrate: async () => {
    try {
      const muscoli = await listAllTaxonomy("muscle_groups");
      const attrezzi = await listAllTaxonomy("equipment_types");
      set({
        muscleGroups: muscoli,
        equipment: attrezzi,
        liveMuscleGroups: muscoli.filter((r) => r.deleted_at === null),
        liveEquipment: attrezzi.filter((r) => r.deleted_at === null),
        muscleLabel: risolutore(muscoli, "gym.muscle"),
        equipmentLabel: risolutore(attrezzi, "gym.equipment"),
      });
    } catch (error) {
      // Le costanti del seme sono ancora la ricaduta di i18n: la palestra si
      // disegna comunque, con le etichette dei ventitre' slug che c'erano.
      logger.warn("[catalogo] tassonomie non lette", error);
    }
  },
}));
```

- [ ] **Step 5: Scrivi il test del pull delle tassonomie**

In coda a `src/services/catalogSync.test.ts`:

```ts
describe("pullTaxonomies", () => {
  it("scrive quel che il server manda e ridrata lo store", async () => {
    mockApiRequest.mockResolvedValue({
      muscleGroups: [
        { slug: "femorali", labelIt: "Ischiocrurali", labelEn: "Hamstrings", sort: 90, deletedAt: null },
        { slug: "trapezi", labelIt: "Trapezi", labelEn: "Traps", sort: 130, deletedAt: null },
      ],
      equipment: [
        { slug: "cavi", labelIt: "Cavi", labelEn: "Cables", sort: 50, deletedAt: "2026-09-08T09:00:00+00:00" },
      ],
    });

    await pullTaxonomies();

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: "get", path: "/catalog/taxonomies" }),
    );

    const stato = useTaxonomyStore.getState();
    expect(stato.muscleLabel("femorali")).toBe("Ischiocrurali");
    expect(stato.muscleLabel("trapezi")).toBe("Trapezi");
    // Cancellato: non si offre in una scelta, ma l'etichetta ce l'ha ancora.
    expect(stato.liveEquipment.map((r) => r.slug)).not.toContain("cavi");
    expect(stato.equipmentLabel("cavi")).toBe("Cavi");
  });

  it("un errore di rete non solleva e lascia in piedi le etichette di prima", async () => {
    await useTaxonomyStore.getState().hydrate();
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    await expect(pullTaxonomies()).resolves.toBeUndefined();
    expect(useTaxonomyStore.getState().muscleLabel("petto")).toBe("Petto");
  });
});
```

Il test va inserito dopo aver aggiunto `pullTaxonomies` e
`useTaxonomyStore` agli import, e `i18n.locale = "it"` in un `beforeEach` del
`describe` se il locale di default del test non e' l'italiano.

- [ ] **Step 6: Aggiungi `pullTaxonomies` a `catalogSync.ts`**

```ts
/**
 * Le tassonomie, intere a ogni giro.
 *
 * Ventitre' righe: un cursore non comprerebbe niente. Escono anche le
 * cancellate, con la loro data, perche' sul telefono ci sono esercizi che
 * nominano quello slug in colonna.
 *
 * Ridrata lo store subito dopo: senza, le etichette nuove resterebbero in
 * tabella e a schermo si vedrebbero quelle vecchie fino al riavvio.
 */
export async function pullTaxonomies(): Promise<void> {
  try {
    if (!attivo()) return;

    const { muscleGroups, equipment } = await catalog.fetchTaxonomies();
    await replaceTaxonomy("muscle_groups", muscleGroups.map(toTaxonomyRow));
    await replaceTaxonomy("equipment_types", equipment.map(toTaxonomyRow));
    await useTaxonomyStore.getState().hydrate();
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] tassonomie non aggiornate", error);
    }
  }
}
```

con la conversione, sopra:

```ts
const toTaxonomyRow = (entry: catalog.TaxonomyEntry): TaxonomyRow => ({
  slug: entry.slug,
  label_it: entry.labelIt,
  label_en: entry.labelEn,
  sort: entry.sort,
  deleted_at: entry.deletedAt,
});
```

e `syncCatalog` che le pesca **prima** dei due cataloghi:

```ts
  /*
   * Le tassonomie per prime, e non e' indifferente: il filtro di `applyExercise`
   * misura gli slug che arrivano contro quel che la tassonomia conosce, e
   * leggendole dopo un gruppo nuovo verrebbe buttato per un giro intero.
   */
  await pullTaxonomies();
  const esercizi = await pullExercises();
  const alimenti = await pullFoods();
```

**Questa riga rompe i due test di `syncCatalog` scritti nel task 7**, e va
sistemata qui: usano `mockResolvedValueOnce` in sequenza, e ora la prima
chiamata e' quella delle tassonomie. Si aggiunge in testa alla catena un
`.mockResolvedValueOnce({ muscleGroups: [], equipment: [] })` - un elenco
vuoto non cancella niente (task 10), quindi il resto del test non cambia - e
`toHaveBeenCalledTimes(2)` diventa `3`. Non si toglie `pullTaxonomies` da
`syncCatalog` per far passare i test: l'ordine e' quello per una ragione
scritta due righe sopra.

I test della finestra (task 8) contano le chiamate e non le confrontano con un
numero fisso, quindi passano comunque - ma `pagina([])` come risposta alle
tassonomie non porta `muscleGroups`, e `pullTaxonomies` incassa l'errore e
scrive un warn. Si dia anche a loro una risposta della forma giusta, o quel
warn resta a sporcare l'output dei test per sempre e prima o poi qualcuno lo
inseguira' come se fosse un difetto.

- [ ] **Step 7: Idrata all'avvio**

In `src/App.tsx`, dentro il gate d'avvio, subito dopo `relabelSeededRows()`:

```ts
        // Le etichette dei gruppi muscolari e dell'attrezzatura, dalla
        // tabella locale: prima che una schermata di palestra si disegni, o
        // ricadrebbe su i18n per il primo fotogramma.
        await useTaxonomyStore.getState().hydrate();
```

E' dentro il gate e non dopo: sono due `SELECT` su ventitre' righe, e il
prezzo e' invisibile contro il rischio di un elenco che si ridisegna appena
montato.

- [ ] **Step 8: I tre cancelli**

Run: `npm run typecheck` && `npm run lint` && `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/domain/taxonomy.ts src/domain/taxonomy.test.ts \
  src/stores/taxonomyStore.ts src/types/gym.ts \
  src/services/catalogSync.ts src/services/catalogSync.test.ts src/App.tsx
git commit -m "$(cat <<'EOF'
feat(catalogo): le tassonomie arrivano dal server, e i due tipi diventano string

`MuscleGroup` ed `Equipment` erano union di dodici e undici valori: un gruppo
aggiunto dal pannello non poteva esistere senza un rilascio dell'app. Ora sono
`string`, l'elenco autorevole e' la tabella locale che `pullTaxonomies`
riscrive, e le costanti restano per tre cose - seminare la migrazione 020,
dare a `keys.test.ts` il minimo garantito, e dire quali slug hanno
un'etichetta di ricaduta in i18n.

L'etichetta viene dalla riga e non da una chiave i18n, ed e' il motivo per cui
la tabella ha due colonne di etichetta: un gruppo creato dal pannello arriva
con la propria etichetta gia' scritta, e una chiave i18n per definizione non
ce l'ha. `taxonomyLabel` ha tre gradini - la riga, la chiave i18n per i
ventitre' del seme, lo slug - e l'ultimo esiste perche' `[missing
"en.gym.muscle.trapezi"]` a schermo sembra un difetto dell'app.

I due risolutori si ricostruiscono a ogni `hydrate`, e non e' uno spreco: e'
quel che rende reattivi i componenti che li selezionano. Leggendo `get()`
senza essere ricreati, un gruppo rinominato dal pannello resterebbe scritto
col nome vecchio fino al riavvio.

`syncCatalog` pesca le tassonomie prima dei due cataloghi: il filtro degli
slug misura contro quel che la tassonomia conosce, e leggendole dopo un gruppo
nuovo verrebbe buttato per un giro intero.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 12: le etichette e i selettori leggono la tassonomia

Diciassette punti chiamano `t(\`gym.muscle.${x}\`)` o
`t(\`gym.equipment.${x}\`)`, e cinque costruiscono un selettore iterando le
costanti. Tutti passano dallo store. E' un cambio meccanico ripetuto, quindi
qui c'e' **la regola** piu' un esempio lavorato, non diciassette blocchi
quasi identici: copiarli invece di applicare la regola e' il modo di
sbagliarne uno.

**La regola, in tre righe:**

1. `t(\`gym.muscle.${x}\`)` diventa `muscleLabel(x)`, con
   `const muscleLabel = useTaxonomyStore((s) => s.muscleLabel);` fra gli hook
   del componente. Idem `equipmentLabel`.
2. Un elenco da **offrire in una scelta** viene da
   `useTaxonomyStore((s) => s.liveMuscleGroups)` (o `liveEquipment`) e si
   itera sulle righe, usando `riga.slug` dove prima c'era la costante.
3. Fuori da React (`src/ai/`, i servizi) si legge
   `useTaxonomyStore.getState()`. Nessun hook: quei moduli girano anche in
   jest senza albero.

**Files:**
- Modify: `src/navigation/screens/ExerciseDetailScreen.tsx` (134, 136, 143)
- Modify: `src/navigation/screens/EquipmentScreen.tsx` (80, piu' l'elenco)
- Modify: `src/navigation/screens/GenerateRoutineScreen.tsx` (239)
- Modify: `src/containers/gym/AlternativesSheet.tsx` (149, 151)
- Modify: `src/containers/gym/BlockEditor.tsx` (179)
- Modify: `src/containers/gym/ExercisePickerSheet.tsx` (114, 170, 172)
- Modify: `src/containers/gym/ExerciseListItem.tsx` (57, 59)
- Modify: `src/containers/gym/ExerciseFormSheet.tsx` (216, 236, 249, 293, 303, 315)
- Modify: `src/db/queries/exercises.ts` (`listAvailableEquipment`)
- Modify: `src/db/queries/exercises.test.ts`
- Modify: `src/services/catalogSync.ts` (il filtro degli slug)
- Modify: `src/i18n/keys.test.ts` (il commento che dichiara cosa controlla)

**Interfaces:**
- Consumes: `useTaxonomyStore` (task 11), `knownSlugs`
  (`src/domain/taxonomy.ts`), `listTaxonomy` (task 10).

- [ ] **Step 1: L'esempio lavorato, su `ExerciseListItem`**

Prima:

```tsx
          {t(`gym.muscle.${exercise.muscle_group}`)}
          {equipment.length > 0
            ? ` · ${equipment.map((e) => t(`gym.equipment.${e}`)).join(", ")}`
            : ""}
```

Dopo, con i due hook fra gli altri del componente:

```tsx
  const muscleLabel = useTaxonomyStore((s) => s.muscleLabel);
  const equipmentLabel = useTaxonomyStore((s) => s.equipmentLabel);
```

```tsx
          {muscleLabel(exercise.muscle_group)}
          {equipment.length > 0
            ? ` · ${equipment.map(equipmentLabel).join(", ")}`
            : ""}
```

Nessun `t` di quelle due famiglie resta nel JSX. La ricaduta su i18n **non
sparisce**: la fa `taxonomyLabel` dentro lo store, che e' il posto giusto -
un componente non deve sapere che esiste una ricaduta.

- [ ] **Step 2: Applica la regola ai sette file di elenco/etichetta**

`ExerciseDetailScreen`, `AlternativesSheet`, `BlockEditor`,
`ExercisePickerSheet` (riga 170, 172), `GenerateRoutineScreen`,
`ExerciseFormSheet` (riga 293, 303, 315), `EquipmentScreen` (riga 80).

Poi verifica che non ne sia rimasto nessuno:

Run: `grep -rn 'gym\.muscle\.\|gym\.equipment\.' src/ | grep -v locales/ | grep -v keys.test | grep -v taxonomyStore`
Expected: nessuna riga. Se ne resta una, e' un punto che questo passo ha
saltato.

- [ ] **Step 3: I selettori iterano la tassonomia**

`ExerciseFormSheet` (righe 216, 236, 249) e `ExercisePickerSheet` (riga 114)
iterano `MUSCLE_GROUPS` / `EQUIPMENT`. Diventano:

```tsx
  const gruppi = useTaxonomyStore((s) => s.liveMuscleGroups);
  const attrezzi = useTaxonomyStore((s) => s.liveEquipment);
```

```tsx
            {gruppi.map((riga) => (
              <Chip
                key={riga.slug}
                label={muscleLabel(riga.slug)}
                /* ...il resto invariato, con riga.slug dove c'era il valore */
              />
            ))}
```

`liveMuscleGroups` e non `muscleGroups`, ed e' la distinzione che conta: qui
si **offre una scelta**, e un gruppo che un amministratore ha cancellato non
va offerto. Le etichette invece passano dai risolutori, che guardano tutti -
un esercizio che nomina un gruppo cancellato deve continuare a mostrarne il
nome.

`EquipmentScreen` disegna i chip dell'attrezzatura da spuntare: anche quello
e' offrire una scelta, quindi `liveEquipment`. Il testo "Il corpo libero c'e'
sempre" resta vero: `corpo_libero` non e' cancellabile sul server.

- [ ] **Step 4: `listAvailableEquipment` legge la tabella**

Scrivi prima il test, in `src/db/queries/exercises.test.ts`:

```ts
describe("listAvailableEquipment con la tassonomia", () => {
  /**
   * L'elenco e' per ECCEZIONE e non per dichiarazione: un attrezzo mai
   * toccato conta come disponibile. Su un telefono appena installato il
   * risultato e' quindi l'attrezzatura completa.
   */
  it("torna tutti gli attrezzi vivi, meno quelli tolti a mano", async () => {
    await setEquipmentAvailability("cavi", false);

    const disponibili = await listAvailableEquipment();

    expect(disponibili).not.toContain("cavi");
    expect(disponibili).toContain("bilanciere");
    expect(disponibili).toHaveLength(10);
  });

  /**
   * Un attrezzo cancellato dal pannello non si offre piu': non e' una scelta
   * che si possa fare, e proporlo genererebbe schede con un attrezzo che il
   * catalogo non conosce piu'.
   */
  it("non offre un attrezzo cancellato dalla tassonomia", async () => {
    await replaceTaxonomy("equipment_types", [
      { slug: "trx", label_it: "TRX", label_en: "TRX", sort: 100, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);

    expect(await listAvailableEquipment()).not.toContain("trx");
  });

  /** Uno slug nuovo arriva senza un rilascio dell'app. */
  it("offre uno slug che il pannello ha aggiunto", async () => {
    await replaceTaxonomy("equipment_types", [
      { slug: "anelli", label_it: "Anelli", label_en: "Rings", sort: 120, deleted_at: null },
    ]);

    expect(await listAvailableEquipment()).toContain("anelli");
  });
});
```

Poi l'implementazione, in `src/db/queries/exercises.ts`:

```ts
/**
 * L'attrezzatura che si puo' usare: tutta quella che la tassonomia conosce,
 * tranne quella tolta a mano.
 *
 * E' un elenco per eccezione e non per dichiarazione: un attrezzo mai toccato
 * conta come disponibile. Il contrario - partire da zero e chiedere di
 * spuntare quel che si ha - lasciava i chip tutti spenti al primo avvio, e
 * senza uno stato attivo visibile sembravano non rispondere al tocco.
 *
 * L'elenco di partenza era la costante `EQUIPMENT`, e adesso e' la tabella:
 * un attrezzo aggiunto dal pannello diventa disponibile senza un rilascio
 * dell'app, e uno cancellato smette di essere offerto. I cancellati si
 * escludono perche' qui si OFFRE UNA SCELTA - le etichette, che disegnano
 * quel che c'e' gia', li comprendono.
 */
export async function listAvailableEquipment(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ slug: string }>(
    `SELECT slug FROM equipment_types
      WHERE deleted_at IS NULL
        AND slug NOT IN (
          SELECT name FROM user_equipment
           WHERE available = 0 AND deleted_at IS NULL
        )
      ORDER BY sort, slug`,
  );
  return rows.map((r) => r.slug);
}
```

L'import di `EQUIPMENT` in `exercises.ts` va via se non lo usa piu' nessun
altro punto del file.

- [ ] **Step 5: Il filtro del pull cambia fonte**

In `src/services/catalogSync.ts`, `isMuscleGroup`, `parseMuscles` e
`parseEquipment` smettono di misurare contro le costanti:

```ts
/**
 * Gli slug che la tassonomia conosce, cancellati compresi.
 *
 * Il metro era `MUSCLE_GROUPS` / `EQUIPMENT`, cioe' quel che questa versione
 * dell'app aveva compilato dentro: un gruppo aggiunto dal pannello veniva
 * buttato per sempre. Ora e' quel che il server dichiara, e il controllo non
 * sparisce - cambia fonte. Quel che nemmeno la tassonomia conosce si butta
 * come prima: il catalogo lo scrivono anche altri telefoni, e una stringa
 * sconosciuta in colonna girerebbe per l'app come se fosse un valore vero.
 *
 * I cancellati contano come noti: un esercizio che nomina un gruppo tolto dal
 * pannello non diventa sbagliato, e la sua etichetta c'e' ancora.
 */
const muscoliNoti = (): Set<string> =>
  knownSlugs(useTaxonomyStore.getState().muscleGroups);

const attrezziNoti = (): Set<string> =>
  knownSlugs(useTaxonomyStore.getState().equipment);

const parseSlugs = (value: string | null | undefined, noti: Set<string>): string[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => noti.has(v));
```

`applyExercise` usa `parseSlugs(voce.secondaryMuscles, muscoliNoti())`,
`parseSlugs(voce.equipment, attrezziNoti())`, e la guardia sul gruppo
principale diventa `muscoliNoti().has(voce.muscleGroup)`.

I test del task 6 che verificano lo scarto (`branchie`, `astronave`)
continuano a valere: `pullTaxonomies` non gira in quei test, ma
`useTaxonomyStore` e' idratato dalla migrazione 020 - se non lo e', si aggiunge
`await useTaxonomyStore.getState().hydrate();` al `beforeEach` di
`catalogSync.test.ts`, che e' la stessa cosa che fa `App.tsx` all'avvio.

- [ ] **Step 6: `keys.test.ts` dichiara cosa sta controllando**

Il test resta com'e' - le costanti sono ancora il minimo garantito - ma il
commento sopra va aggiornato, o dice una cosa che non e' piu' vera:

```ts
  /**
   * Le chiavi costruite a runtime da un elenco chiuso: `t(\`gym.muscle.${x}\`)`.
   *
   * `MUSCLE_GROUPS` ed `EQUIPMENT` non sono piu' l'elenco autorevole - lo e'
   * la tassonomia sul server, e un gruppo aggiunto dal pannello non ha una
   * chiave i18n per definizione. Restano il MINIMO GARANTITO: i ventitre'
   * slug che l'app semina devono avere la loro etichetta di ricaduta in tutte
   * e due le lingue, perche' sono quelli che si vedono prima che il primo
   * pull abbia risposto. Del resto se ne occupa `label_it`/`label_en`.
   */
```

- [ ] **Step 7: I tre cancelli, piu' una lettura a occhio**

Run: `npm run typecheck` && `npm run lint` && `npm test`
Expected: PASS.

Da guardare a schermo, perche' nessun test lo copre: **Palestra > Esercizi**
(le righe dicono il gruppo e gli attrezzi, non degli slug), **il modulo di un
esercizio** (i tre selettori sono pieni), **Profilo > Palestra >
Attrezzatura** (undici chip, `corpo_libero` compreso), e **Genera scheda**
(l'attrezzatura in sola lettura non e' vuota).

- [ ] **Step 8: Commit**

```bash
git add src/navigation/screens/ExerciseDetailScreen.tsx \
  src/navigation/screens/EquipmentScreen.tsx \
  src/navigation/screens/GenerateRoutineScreen.tsx \
  src/containers/gym src/db/queries/exercises.ts \
  src/db/queries/exercises.test.ts src/services/catalogSync.ts \
  src/i18n/keys.test.ts
git commit -m "$(cat <<'EOF'
feat(catalogo): etichette e selettori leggono la tassonomia, non le costanti

I diciassette `t(gym.muscle.*)` / `t(gym.equipment.*)` passano dai due
risolutori dello store, e i cinque selettori iterano `liveMuscleGroups` /
`liveEquipment` invece delle costanti. La ricaduta su i18n non sparisce: la fa
`taxonomyLabel` dentro lo store, che e' il posto giusto - un componente non
deve sapere che esiste una ricaduta.

La distinzione fra le due letture e' quella dei tipi di pasto, e vale a ogni
punto: chi OFFRE UNA SCELTA legge i vivi, chi DISEGNA QUEL CHE C'E' GIA' legge
tutti. Un gruppo cancellato dal pannello non va offerto in un selettore, ma un
esercizio che lo nomina deve continuare a mostrarne il nome.

`listAvailableEquipment` parte dalla tabella e non da `EQUIPMENT`: un attrezzo
aggiunto dal pannello diventa disponibile senza un rilascio dell'app. Resta un
elenco per eccezione - tutto tranne quel che si e' tolto a mano - quindi su un
telefono appena installato il risultato non cambia.

Il filtro del pull misura contro la tassonomia e non contro le costanti: il
controllo non sparisce, cambia fonte, e un gruppo aggiunto dal pannello non
viene piu' buttato per sempre.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 13: le due stringhe che promettono una cosa che non succede piu'

`TODO.md` § 5.1, ed e' il punto piu' visibile che la Fase 1 ha lasciato
aperto: e' l'unico che un utente legge.

Il testo sopra il campo del nome dice che quel che si crea "entra nell'elenco
di tutti gli iscritti". Era vero fino al 6 settembre 2026. Da quando una voce
nasce `pending` e aspetta l'approvazione di un amministratore e' falso, e lo
e' due volte: non entra subito, e **non si corregge "quando vuoi"** - dopo
l'approvazione il server risponde 403, perche' da li' in poi la voce e'
nell'app di tutti.

**Files:**
- Modify: `src/i18n/locales/it.json` (`foods.catalog_notice`,
  `gym.catalog_notice`)
- Modify: `src/i18n/locales/en.json` (le stesse due)

- [ ] **Step 1: Riscrivi le quattro stringhe**

`it.json`:

```
"foods.catalog_notice": "Questo alimento viene proposto al catalogo comune: entra nell'elenco di tutti gli iscritti solo se un amministratore lo approva. Finché è in attesa puoi correggerlo o ritirarlo. Il catalogo non dice a nessuno chi ha scritto una voce."
"gym.catalog_notice":   "Questo esercizio viene proposto al catalogo comune: entra nell'elenco di tutti gli iscritti solo se un amministratore lo approva. Finché è in attesa puoi correggerlo o ritirarlo. Il catalogo non dice a nessuno chi ha scritto una voce."
```

`en.json`:

```
"foods.catalog_notice": "This food is submitted to the shared catalog: it reaches every member's list only once an administrator approves it. While it is pending you can edit or withdraw it. The catalog never tells anyone who wrote an entry."
"gym.catalog_notice":   "This exercise is submitted to the shared catalog: it reaches every member's list only once an administrator approves it. While it is pending you can edit or withdraw it. The catalog never tells anyone who wrote an entry."
```

Tre cose che il testo nuovo dice e il vecchio no, e nessuna e' cosmetica:

- **"viene proposto"** invece di "entra": e' la moderazione, ed e' il fatto.
- **"finché è in attesa"** invece di "quando vuoi": dopo l'approvazione il
  server rifiuta con 403, e il testo vecchio prometteva una cosa che l'utente
  avrebbe scoperto non funzionare senza capire perche'.
- **"ritirarlo"** invece di "toglierlo": si ritira una proposta, si toglie una
  cosa che c'e'. La parola dice a che punto e' la voce.

Quel che il testo **continua** a dire, e va tenuto: che il catalogo non dice a
nessuno chi ha scritto una voce. E' vero e resta vero - `created_by` non esce
da nessuna risposta verso un utente qualunque - ed e' la ragione per cui il
testo sta sopra il campo del nome e non sotto il bottone Salva: va letto
prima di scrivere.

Nessun codice cambia: le chiavi sono le stesse e i due componenti le leggono
gia' (`FoodFormScreen:224`, `ExerciseFormSheet:270`), sotto la condizione
`condiviso` - senza account non compare, perche' senza account non esce
niente.

- [ ] **Step 2: Verifica**

Run: `npm test -- src/i18n/keys.test.ts` && `npm run typecheck`
Expected: PASS. Se una delle due lingue e' rimasta indietro, `keys.test.ts` lo
dice: confronta le due nei due versi.

Da guardare a schermo: **il modulo di un alimento** e **il foglio di un
esercizio**, con un account attivo. Senza account il testo non c'e', ed e'
giusto.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/it.json src/i18n/locales/en.json
git commit -m "$(cat <<'EOF'
fix(i18n): l'app smette di promettere che una voce nuova entra subito in catalogo

`foods.catalog_notice` e `gym.catalog_notice` dicevano che quel che si crea
"entra nell'elenco di tutti gli iscritti" e che si puo' correggere "quando
vuoi". Era vero fino al 6 settembre 2026, ed era falso da quando una voce
nasce proposta e aspetta l'approvazione di un amministratore: non entra
subito, e dopo l'approvazione il server rifiuta la correzione con 403 perche'
da li' in poi la voce e' nell'app di tutti.

Il testo nuovo dice "viene proposto", "finche' e' in attesa" e "ritirarlo": si
ritira una proposta, si toglie una cosa che c'e', e la parola dice a che punto
e' la voce. Resta la frase sul fatto che il catalogo non dice a nessuno chi ha
scritto una voce, che e' vera e non e' cambiata.

Nessun codice cambia: le chiavi sono le stesse. `TODO.md` § 5.1.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

### Task 14: la documentazione dice quel che il codice fa

Tre punti del `CLAUDE.md` sono diventati falsi con questa fase, e uno di loro
avverte contro esattamente la cosa che il task 1 ha fatto: chi lo legge senza
il seguito conclude che `catalog_uid` e' un errore.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `TODO.md`
- Modify: `.superpowers/sdd/2026-09-07-gestionale-fase-1-server/RIPRENDI-QUI.md`

- [ ] **Step 1: `CLAUDE.md` § La ricerca di un alimento**

Il paragrafo dice che la voce remota si ritrova dal nome normalizzato perche'
un id del server in colonna "su un secondo dispositivo o dopo un cambio di
account punterebbe alla riga di un altro catalogo", e chiude dicendo che
adottare `uid` e' lavoro della Fase 3. Va riscritto al passato, con la
distinzione che rende `uid` diverso da un id:

> **La voce remota si ritrova dal `catalog_uid`**, dall'8 settembre 2026.
> Prima era il nome normalizzato, e il § L'unica cosa che esce verso i non
> amici spiega cosa costava.
>
> L'avvertenza contro il tenere in colonna un id del server **resta valida e
> non riguarda questa colonna**, ed e' una distinzione da tenere: un
> autoincrement su un secondo dispositivo punta alla riga di un altro
> catalogo, mentre `uid` e' una stringa stabile assegnata alla voce, il server
> e' uno solo, e la stessa voce ha lo stesso `uid` per chiunque. Un `uid` che
> dall'altra parte non esiste non risolve e basta, e la ricaduta sul nome lo
> ripesca al primo pull.

- [ ] **Step 2: `CLAUDE.md` § L'unica cosa che esce verso i non amici**

Le due frasi che dicono "Lato app la voce remota si ritrova dal nome
normalizzato, ed e' ancora vero oggi" e il rimando alla Fase 3 vanno
sostituite:

> **Lato app l'identita' e' `catalog_uid`** (migrazione 019), e il pull e'
> incrementale: `src/services/catalogSync.ts` legge `/api/catalog/*` dal
> proprio cursore e riallinea le righe che ha gia' invece di inserire solo
> quel che manca. Il nome normalizzato e' la ricaduta di un giro solo, per le
> righe installate prima della 019: agganciata per nome, la riga riceve
> l'`uid` e dal giro dopo si aggancia per quello.
>
> Il catalogo scrive **solo i campi di catalogo** e **solo sulle righe che
> sono sue** - `is_custom = 0` per un esercizio, `source = 'seed'` per un
> alimento. `notes`, `dislike_level`, `is_banned`, `usage_count`,
> `is_favorite`, `barcode` e `off_id` non li scrive mai: sono giudizi
> personali, stato d'uso e identita', non la descrizione di una voce. Una
> voce tolta dal catalogo non si cancella, diventa dell'utente.

- [ ] **Step 3: `CLAUDE.md` § Il catalogo degli esercizi**

La frase "**Aggiornare il seed non raggiunge chi ce l'ha gia'**" resta vera
per `applyExerciseSeeds`, ma il paragrafo che segue dice che la via del pull
incrementale arrivera' "da quando l'app consuma `/api/catalog/exercises`
(Fase 3 del gestionale)". Quel giorno e' arrivato: si scrive al presente, e si
dice che correggere il testo di un esercizio gia' installato **non** vuole
piu' dire una migrazione - lo fa il pull, su una riga `is_custom = 0`.

- [ ] **Step 4: `CLAUDE.md`, i pezzi nuovi**

Tre aggiunte, ognuna dove il lettore la cerca:

- In **§ Local-first**, l'elenco del layer `src/db/`: la riga di
  `queries/taxonomies.ts` con la distinzione fra le due letture.
- In **§ Sincronizzazione**, dopo la regola 5: le due tabelle nuove sono in
  `LOCAL_ONLY_TABLES` perche' sono la copia locale di un elenco pubblicato per
  tutti, e mandarle al server vorrebbe dire rispedirgli quel che ha appena
  mandato lui.
- Una sezione nuova **§ Il catalogo comune, dal telefono**, con le tre regole
  del piano, la finestra di un'ora, il perche' `cursor` e non `next`, e il
  perche' le foto di catalogo hanno una cartella loro. Va dopo § Il catalogo
  degli esercizi, che e' dove sta il contesto.
- In **§ Convenzioni non negoziabili**: "**Un'etichetta di gruppo muscolare o
  di attrezzatura viene dallo store, non da `t()`**" con il rimando, e la
  domanda da farsi (offro una scelta o disegno quel che c'e' gia'?).

- [ ] **Step 5: `TODO.md`**

Spunta le quattro voci di § 5.3 e la voce di § 5.1, con la data (8 settembre
2026) e il rimando al piano, nello stesso stile delle altre voci chiuse. E
aggiungi, sotto § 5, la voce che questa fase **non** ha fatto e che va
dichiarata invece di sparire:

- **L'interruttore IA lato app.** `users.ai_enabled` esce da `GET /api/me`
  dalla Fase 1 e il pannello lo comanda dalla Fase 2, ma l'app non lo legge:
  `accountStore` non lo tiene e `AssistantButton` si monta comunque. E' fuori
  dal perimetro della Fase 3 per scelta, e oggi sarebbe comunque **un
  cartello e non una serratura** - la chiave Gemini sta nel bundle e chi
  ripacchettizza l'APK lo riaccende. Diventa una serratura col proxy AI
  (§ 3.1), e quel giorno il controllo e' una riga nel server: e' li' che va
  fatto, non qui.

- [ ] **Step 6: `RIPRENDI-QUI.md`**

Il file racconta lo stato dopo la Fase 2 e va portato a dopo la Fase 3: le tre
fasi sono complete, il § "Cosa fare per prima" e il § "Il debito piu' visibile"
sono chiusi e vanno riscritti al passato con la data, e il § "Cosa manca"
resta con la sola voce dell'interruttore IA piu' l'avviso di deploy del § 5.4,
che nessun test puo' dire e che questa fase non ha toccato.

- [ ] **Step 7: Verifica**

Run: `npm test` && `npm run typecheck` && `npm run lint`
Expected: PASS. Poi, da `backend/`: `php artisan test`.

E una lettura a occhio del `CLAUDE.md`, cercando quel che potrebbe essere
rimasto indietro:

Run: `grep -n "nome normalizzato\|Fase 3 del gestionale\|entra nell'elenco" CLAUDE.md`
Expected: nessuna occorrenza che parli dell'aggancio di una voce di catalogo o
di lavoro futuro della Fase 3. Quelle che restano devono parlare d'altro - la
deduplica in ingresso sul server usa ancora `name_norm`, e li' e' giusto.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md TODO.md \
  .superpowers/sdd/2026-09-07-gestionale-fase-1-server/RIPRENDI-QUI.md
git commit -m "$(cat <<'EOF'
docs: il catalogo si aggancia per uid, e la documentazione lo dice

Tre punti del CLAUDE.md erano diventati falsi con la Fase 3, e uno di loro
avvertiva contro esattamente la cosa che la migrazione 019 ha fatto: chi lo
leggeva senza il seguito concludeva che `catalog_uid` fosse un errore. Ora la
distinzione e' scritta: l'avvertenza vale per un autoincrement del server, non
per una stringa stabile che la stessa voce porta per chiunque.

§ La ricerca di un alimento e § L'unica cosa che esce verso i non amici
passano al presente sul pull incrementale e sulle tre regole
(identita' per uid, solo i campi di catalogo sulle righe che sono sue, una
voce tolta cambia padrone). § Il catalogo degli esercizi non dice piu' che
correggere un testo gia' installato vuole una migrazione. E c'e' una sezione
nuova sul catalogo visto dal telefono: la finestra di un'ora, il perche'
`cursor` e non `next`, il perche' le foto di catalogo hanno una cartella loro.

`TODO.md` chiude § 5.1 e § 5.3 e dichiara la voce che la Fase 3 NON ha fatto:
l'interruttore IA lato app, che oggi sarebbe un cartello e non una serratura -
la chiave Gemini sta nel bundle - e che diventa una riga nel proxy il giorno
del § 3.1.

Claude-Session: https://claude.ai/code/session_01WY56M6SthumeYsNu5H19bw
EOF
)"
```

---

## Quel che questa fase lascia fuori, dichiarato

- **L'interruttore IA lato app.** `users.ai_enabled` c'e' sul server e nel
  pannello; l'app non lo legge. Fuori perimetro per scelta (vedi il task 14,
  step 5): oggi sarebbe un cartello e non una serratura, e diventa una riga nel
  proxy AI il giorno del `TODO.md` § 3.1.
- **`SANCTUM_STATEFUL_DOMAINS` in produzione** (`TODO.md` § 5.4): e' un
  avviso di deploy, nessun test lo puo' intercettare, e questa fase non tocca
  il pannello.
- **Dire all'autore che la sua proposta e' stata rifiutata.**
  `review_note` si scrive dalla Fase 1 e non c'e' ancora niente che gliela
  mostri. Era fuori perimetro nella spec e resta fuori: serve un posto
  nell'app dove si vedono le proprie proposte, che non esiste.
- **Vedere le proposte altrui prima dell'approvazione.** Dichiarato "un
  secondo momento" nella spec.
- **La pubblicazione via `git push` e il deploy.** Nessun task di questo piano
  esce dalla macchina.

## Self-review

**Copertura della spec.** § La propagazione all'app: task 6, 7, 8 (finestra e
inneschi), 5 (foto). § Le migrazioni dell'app: task 1 (019), 10 (020,
`LOCAL_ONLY_TABLES`). § Le tassonomie dinamiche: task 10, 11, 12 - compresi i
tre corollari (il filtro cambia fonte, l'etichetta viene dalla riga,
`keys.test.ts` continua sulle costanti del seme dichiarandolo). § Cosa cambia
nell'app esistente: task 9 (i due servizi si fondono, `publishToCatalog`
diventa `submitExerciseToCatalog`), 11 (`src/types/gym.ts`), 1 (`catalog_uid` in
lettura e scrittura), 10 (`sync.ts`), 13 (le due stringhe), 14 (`CLAUDE.md`).
§ Test > App: i nove casi elencati nella spec hanno un test ciascuno nei task
6, 7, 8, 10, 12.

**Fuori dalla spec, e perche'.** I task 3 e 4 toccano il server: la spec
dichiarava `PATCH /api/catalog/exercises/{uid}` e la Fase 1 ha implementato il
binding per id, e il pull non ha modo di dichiarare la propria posizione su
una pagina non piena. Senza i due innesti il lato app non si chiude, e sono
additivi - nessuna rotta esistente cambia semantica.

**Colori e icone per gruppo muscolare** (§ Le tassonomie dinamiche, ultimo
punto): non esistono. `grep -rn "muscle" src/styles.ts src/domain/*.ts` non
trova niente, e non c'e' nessun `Record<MuscleGroup, ...>` da dotare di una
ricaduta neutra. Il task 11, step 2 lo verifica di nuovo prima di dichiararlo,
perche' e' una verifica che costa un comando.

**Lo "swipe" della spec** e' un bottone. § La propagazione all'app dice "a
richiesta con lo swipe in Esercizi e in Alimenti"; Esercizi ha gia' un bottone
`CloudDownload` nell'intestazione, e Alimenti prende lo stesso (task 8).
Coerenza con quel che c'e' invece di un secondo modo di chiedere la stessa
cosa in due schermate gemelle.

---

### Task 15: l'interruttore AI arriva sul telefono

**Aggiunto il 9 settembre 2026, su richiesta dell'utente.** Era dichiarato
fuori perimetro quando il piano e' stato scritto ("voce separata, futura") e
rientra a piano in corso. Il § Global Constraints vale anche qui.

Il pannello comanda `users.ai_enabled` dalla Fase 1 e l'app non lo legge.
Verificato prima di scrivere: `GET /api/me` restituisce **gia'** `aiEnabled`
(`backend/app/Http/Controllers/Api/ProfileController.php:32`), la colonna
esiste con `default(true)`, e `grep aiEnabled src/` non trova niente. **Nessuna
modifica al backend.**

**Le due decisioni sono dell'utente, non del piano:**

1. **Senza account l'AI e' SPENTA.** Non "la domanda non si pone": spenta.
2. **Tutto resta VISIBILE come adesso.** Al click, invece di aprire la
   funzione, si **naviga alla pagina dei piani di abbonamento**. Non un
   comando spento con una spiegazione: un percorso di conversione. L'AI
   diventa una funzione premium in futuro, e questo task prepara la struttura.

**E' UN CARTELLO, NON UNA SERRATURA.** La chiave Gemini sta nel bundle
(§ AI di `CLAUDE.md`), l'app chiama Gemini diretta, e non c'e' nessun server
nel percorso che possa imporre qualcosa: si aggira ripacchettizzando l'APK.
Chi implementa questo task non sta scrivendo un controllo d'accesso, sta
scrivendo UX e preparazione. La serratura arriva quando le chiamate AI
passeranno dal backend (`TODO.md` § 3.1), che e' l'unico posto dove puo'
vivere.

#### Il difetto che questo task porterebbe dentro se scritto ingenuamente

`accountStore.profile` **non e' persistito**: solo il token sta in SecureStore,
e il profilo si rifa' da `social.fetchMyProfile()` dentro `restore()`. Quindi
**offline `profile` e' `null`**.

Un cancello scritto come "c'e' un account E `aiEnabled`" risulterebbe quindi
**spento senza rete anche a chi ha diritto**: in palestra senza campo il
microfono porterebbe alla pagina dei piani a un utente che paga. E' esattamente
il difetto che la regola local-first esiste per impedire - "il telefono resta
la fonte di verita', senza rete si mangia comunque".

**Quindi l'ultimo valore noto si persiste.** Va in `LOCAL_ONLY_SETTINGS`
(`src/services/syncMarkers.ts`) e **non** fra le impostazioni sincronizzate: di
quel fatto l'autorita' e' il **server**, e sincronizzarlo lo farebbe rimbalzare
fra due copie che non decidono. Stessa forma dei segnaposto del catalogo.
Si riscrive a ogni `/api/me` riuscito; senza token non si legge affatto,
perche' senza account la risposta e' "spenta" a prescindere.

**Files:**
- Modify: `src/api/social.ts` (`MyProfile` prende `aiEnabled`)
- Modify: `src/services/syncMarkers.ts` (`AI_ENABLED`, in `LOCAL_ONLY_SETTINGS`)
- Create: `src/domain/aiAccess.ts` + `src/domain/aiAccess.test.ts`
- Modify: `src/stores/accountStore.ts`
- Create: `src/navigation/screens/PlansScreen.tsx`
- Modify: `src/navigation/index.tsx`
- Modify: i cinque punti d'ingresso (sotto)
- Modify: `src/i18n/locales/it.json`, `en.json`

**Interfaces:**
- Produces: `aiAvailable(): boolean` - la risposta unica. `readAiEnabled()` /
  `writeAiEnabled(v)` sui segnaposto.
- Consumes: `MyProfile.aiEnabled`, `useAccountStore`.

#### I cinque punti d'ingresso, verificati col grep e non supposti

`TodayScreen.tsx` (il microfono, `AssistantButton`) · `PhotoEstimateSheet.tsx`
(la stima da foto) · `GenerateRoutineScreen.tsx` (la generazione scheda) ·
`SessionScreen.tsx` e `AlternativesSheet.tsx` ("proponi alternativa").

Da verificare in apertura: lo scanner dell'etichetta di `FoodFormScreen` passa
da un nome che il grep non ha preso? Se si', e' il sesto. Dichiaralo nel
report.

**Una decisione che l'implementer deve prendere e dichiarare:** il cancello sta
in un posto solo (un componente che avvolge, o un hook che ogni punto chiama)
oppure e' ripetuto cinque volte? Cinque copie di una condizione sono cinque
occasioni di divergere, ed e' la ragione per cui `aiAvailable()` esiste come
funzione pura in `domain/`. La navigazione alla pagina dei piani invece **non**
puo' stare in `domain/`: quello e' React.

- [ ] **Step 1: Il test di `aiAvailable`, prima del codice**

`src/domain/aiAccess.test.ts` - funzione pura, nessun React, nessun DB:

```ts
describe("aiAvailable", () => {
  it("senza account e' spenta", () => {
    expect(aiAvailable({ token: null, aiEnabled: null })).toBe(false);
  });

  it("senza account resta spenta anche con un ultimo valore noto acceso", () => {
    // Il valore noto vale per l'account che l'ha scritto: uscito
    // dall'account, non parla piu' di nessuno.
    expect(aiAvailable({ token: null, aiEnabled: true })).toBe(false);
  });

  it("con account e diritto e' accesa", () => {
    expect(aiAvailable({ token: "t", aiEnabled: true })).toBe(true);
  });

  it("con account e senza diritto e' spenta", () => {
    expect(aiAvailable({ token: "t", aiEnabled: false })).toBe(false);
  });

  it("con account e valore ancora ignoto e' ACCESA", () => {
    // Offline al primo avvio dopo l'accesso: `null` vuol dire "non lo so
    // ancora", e negare il diritto per ignoranza lo negherebbe a chi paga.
    // Il cartello non e' una serratura: sbagliare in favore dell'utente qui
    // non apre niente che il server non conceda.
    expect(aiAvailable({ token: "t", aiEnabled: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Lancialo e guardalo fallire**

Run: `npx jest src/domain/aiAccess.test.ts`
Expected: FAIL, `aiAvailable is not a function`.

- [ ] **Step 3: `aiAccess.ts`**

```ts
/**
 * Se l'AI si puo' usare su questo telefono, adesso.
 *
 * Funzione pura e in un posto solo di proposito: la condizione la leggono
 * cinque punti d'ingresso, e cinque copie sono cinque occasioni di divergere.
 *
 * `aiEnabled` e' l'ULTIMO VALORE NOTO, non la verita' del momento: il profilo
 * non e' persistito e offline non c'e'. `null` vuol dire "non lo so ancora", e
 * si decide in favore dell'utente - negare il diritto per ignoranza lo
 * negherebbe a chi paga, e questo cancello non e' una serratura (§ AI): non
 * apre niente che il server non conceda comunque.
 */
export function aiAvailable(stato: {
  token: string | null;
  aiEnabled: boolean | null;
}): boolean {
  if (!stato.token) return false;
  return stato.aiEnabled !== false;
}
```

- [ ] **Step 4: Verde**

Run: `npx jest src/domain/aiAccess.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Il segnaposto**

`AI_ENABLED = "ai.enabled"` in `syncMarkers.ts`, **dentro
`LOCAL_ONLY_SETTINGS`** con il motivo scritto accanto (l'autorita' e' il
server, sincronizzarlo lo farebbe rimbalzare). `sync.test.ts` confronta gli
elenchi: senza la dichiarazione fallisce.

Piu' `readAiEnabled(): Promise<boolean | null>` e `writeAiEnabled(v: boolean)`.
`readAiEnabled` torna `null` quando la riga non c'e', e **non lancia**.

- [ ] **Step 6: `MyProfile` e lo store**

`aiEnabled: boolean` in `MyProfile`. In `accountStore`, ogni volta che un
profilo arriva (`restore`, `signIn`, `refresh`) si chiama `writeAiEnabled`;
all'idratazione si legge il segnaposto in stato. `signOut` **non cancella** il
segnaposto: lo cancella il prossimo accesso scrivendoci sopra, e nel frattempo
`aiAvailable` torna comunque `false` perche' il token non c'e'.

Test da scrivere: dopo un `/api/me` con `aiEnabled: false` il segnaposto
contiene `false`; un `restore` senza rete lascia in piedi l'ultimo valore noto
invece di azzerarlo.

- [ ] **Step 7: `PlansScreen`**

La pagina dei piani. **Oggi e' un segnaposto onesto**, non un finto listino:
dice che le funzioni AI diventeranno parte di un abbonamento, cosa comprendono
(assistente vocale, stima da foto, lettura etichetta, generazione scheda) e che
per ora non sono acquistabili. **Nessun prezzo inventato, nessun bottone che
non fa niente**: un prezzo falso e' peggio di un prezzo assente, e questo
schermo lo vedra' un utente vero.

Chiavi in **entrambe** le lingue, `plans.*`. Un `HeroPanel` al massimo, righe
in `ListGroup`, `TouchableOpacity` con `activeOpacity={0.6}`, token da
`@/src/styles`. Registrata in `RootStack`.

- [ ] **Step 8: I cinque punti d'ingresso**

Ognuno: se `aiAvailable()` e' falso, **naviga a `Plans`** invece di fare quel
che faceva. L'elemento resta visibile e non si disabilita - e' la decisione
dell'utente, ed e' anche la ragione per cui non serve uno stato "spento" nella
grafica.

- [ ] **Step 9: I tre cancelli**

Run: `npm run typecheck` && `npm test` && `npm run lint`
Expected: typecheck 0, suite verde, lint 0 errori e **11 warning** (i noti).

Da guardare a schermo, con e senza account: il microfono su Oggi, la stima da
foto, la generazione scheda, "proponi alternativa".

- [ ] **Step 10: Commit**

Messaggio in **inglese**, corpo esaustivo, senza trailer di co-autore, con la
riga `Claude-Session:` in fondo.
