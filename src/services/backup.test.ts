import { collectChanges } from "@/src/services/sync";
import { CURSOR_KEY, PUSHED_KEY } from "@/src/services/syncMarkers";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting, getDb } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { addFoodEntry, getDayDiary } from "@/src/db/queries/diary";
import {
  createExercise,
  listAvailableEquipment,
} from "@/src/db/queries/exercises";
import { createFood, deleteFood, searchFoods } from "@/src/db/queries/foods";
import { addPlanEntry, listPlanEntries } from "@/src/db/queries/mealPlan";
import {
  listAllTaxonomy,
  replaceTaxonomy,
} from "@/src/db/queries/taxonomies";
import { SEED_EQUIPMENT_TYPES } from "@/src/db/seed/taxonomies";
import {
  createRoutine,
  listRoutineDays,
  listRoutines,
  logSet,
  recentSessions,
  startSession,
} from "@/src/db/queries/workouts";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { getSteps, setSteps } from "@/src/db/queries/tracking";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { useTaxonomyStore } from "@/src/stores/taxonomyStore";
import {
  BACKUP_FORMAT_VERSION,
  BackupFormatError,
  buildBackup,
  parseBackup,
  restoreBackup,
  BACKUP_TABLES,
  type BackupPayload,
} from "@/src/services/backup";

const seedData = async () => {
  const foodId = await createFood({
    name: "Riso",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 358, carbs: 79 },
  });
  await addFoodEntry({
    date: "2026-08-28",
    mealTypeId: MEAL_TYPE_IDS.lunch,
    foodId,
    quantityG: 100,
  });
  await setSteps("2026-08-28", 9000);
};

const freshDb = async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
};

beforeEach(freshDb);
afterEach(() => __setDbForTesting(null));

describe("buildBackup", () => {
  it("include la versione di formato e quella di schema", async () => {
    const backup = await buildBackup();
    expect(backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.schemaVersion).toBeGreaterThan(0);
    expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("include tutte le tabelle dati", async () => {
    await seedData();
    const backup = await buildBackup();

    expect(Object.keys(backup.tables)).toEqual(
      expect.arrayContaining([
        "foods",
        "recipes",
        "recipe_items",
        "meal_types",
        "meals",
        "meal_entries",
        "profile",
        "targets",
        "weight_logs",
        "step_logs",
        "settings",
      ]),
    );
    expect(backup.tables.meal_entries).toHaveLength(1);
  });

  it("include anche le righe cancellate logicamente", async () => {
    // Un backup deve essere fedele, non ripulito.
    const id = await createFood({ name: "Cancellato", nutrients: EMPTY_NUTRIENTS });
    await deleteFood(id);

    const backup = await buildBackup();
    const foods = backup.tables.foods as { id: string; deleted_at: string | null }[];
    const row = foods.find((f) => f.id === id);
    expect(row).toBeDefined();
    expect(row?.deleted_at).not.toBeNull();
  });
});

describe("restoreBackup", () => {
  it("ripristina i dati su un database vuoto", async () => {
    await seedData();
    const backup = await buildBackup();

    await freshDb();
    expect((await getDayDiary("2026-08-28")).totals.kcal).toBe(0);

    await restoreBackup(backup);
    expect((await getDayDiary("2026-08-28")).totals.kcal).toBeCloseTo(358);
    expect((await getSteps("2026-08-28"))?.steps).toBe(9000);
  });

  it("sostituisce i dati esistenti invece di fonderli", async () => {
    await seedData();
    const backup = await buildBackup();

    await freshDb();
    await createFood({ name: "Da sovrascrivere", nutrients: EMPTY_NUTRIENTS });
    await restoreBackup(backup);

    const names = (await searchFoods("")).map((f) => f.name);
    expect(names).not.toContain("Da sovrascrivere");
    expect(names).toContain("Riso");
  });

  it("è reversibile: esporta, ripristina, riesporta dà lo stesso contenuto", async () => {
    await seedData();
    const first = await buildBackup();

    await freshDb();
    await restoreBackup(first);
    const second = await buildBackup();

    expect(second.tables).toEqual(first.tables);
  });

  it("un ripristino non lascia duplicati dei tipi di pasto di seed", async () => {
    await seedData();
    const backup = await buildBackup();

    await freshDb();
    await restoreBackup(backup);

    const types = backup.tables.meal_types as unknown[];
    const restored = await buildBackup();
    expect((restored.tables.meal_types as unknown[]).length).toBe(types.length);
  });
});

describe("parseBackup", () => {
  it("accetta un backup valido", async () => {
    await seedData();
    const json = JSON.stringify(await buildBackup());
    expect(parseBackup(json).formatVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it("rifiuta JSON non valido", () => {
    expect(() => parseBackup("non json")).toThrow(BackupFormatError);
  });

  it("rifiuta un formato più recente di quello supportato", () => {
    const json = JSON.stringify({
      formatVersion: BACKUP_FORMAT_VERSION + 1,
      exportedAt: "2026-08-28T00:00:00.000Z",
      schemaVersion: 3,
      tables: {},
    });
    expect(() => parseBackup(json)).toThrow(BackupFormatError);
  });

  it("rifiuta un oggetto senza tables", () => {
    const json = JSON.stringify({
      formatVersion: 1,
      exportedAt: "x",
      schemaVersion: 3,
    });
    expect(() => parseBackup(json)).toThrow(BackupFormatError);
  });

  it("rifiuta un file che non è un oggetto", () => {
    expect(() => parseBackup("[1,2,3]")).toThrow(BackupFormatError);
  });
});

describe("copertura del backup", () => {
  /**
   * Il difetto che questo test blocca: il backup esportava undici tabelle su
   * ventisette. Chi ripristinava si ritrovava il diario e perdeva palestra,
   * misure, acqua, digiuni, piano pasti, traguardi e promemoria - senza che
   * niente glielo dicesse, perche' il ripristino riusciva.
   */
  it("copre ogni tabella dello schema", async () => {
    const database = await getDb();
    const tables = await database.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );
    const inSchema = tables.map((t) => t.name).sort();
    const inBackup = [...BACKUP_TABLES].sort();
    expect(inBackup).toEqual(inSchema);
  });

  /**
   * L'ordine non e' cosmetico: si cancella al contrario, quindi un figlio
   * elencato prima del padre fa fallire il ripristino con una violazione di
   * foreign key. Bastava una riga di piano pasti perche' non si potesse piu'
   * ripristinare niente.
   */
  it("elenca ogni padre prima dei suoi figli", () => {
    const dependencies: Record<string, string[]> = {
      recipe_items: ["foods", "recipes"],
      meals: ["meal_types"],
      meal_entries: ["foods", "meals", "recipes"],
      meal_plan_entries: ["foods", "meal_types", "recipes"],
      routine_days: ["routines"],
      routine_blocks: ["routine_days"],
      block_exercises: ["exercises", "routine_blocks"],
      workout_sessions: ["routine_days"],
      session_sets: ["exercises", "workout_sessions"],
    };

    for (const [child, parents] of Object.entries(dependencies)) {
      const childAt = BACKUP_TABLES.indexOf(child as never);
      expect(childAt).toBeGreaterThanOrEqual(0);
      for (const parent of parents) {
        expect(BACKUP_TABLES.indexOf(parent as never)).toBeLessThan(childAt);
      }
    }
  });
});

describe("giro completo con i dati della palestra", () => {
  /**
   * Il difetto che questo test blocca su due fronti: le tabelle della palestra
   * non erano nel dump, e una riga di piano pasti faceva fallire il ripristino
   * con una violazione di foreign key perche' `foods` veniva svuotata mentre
   * `meal_plan_entries` la referenziava ancora.
   */
  it("riporta indietro scheda, sessione e piano pasti", async () => {
    const exerciseId = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
    });
    const routineId = await createRoutine({
      name: "Full body",
      days: [
        {
          name: "Giorno A",
          blocks: [
            {
              kind: "single",
              restSeconds: 90,
              exercises: [{ exerciseId, targetSets: 3, targetReps: "8" }],
            },
          ],
        },
      ],
    });
    const sessionId = await startSession({ date: "2026-08-28" });
    await logSet({ sessionId, exerciseId, setIndex: 0, reps: 8, weight: 60 });

    const foodId = await createFood({
      name: "Riso",
      brand: null,
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 130 },
      isLiquid: false,
      defaultServingG: null,
      servingLabel: null,
      imageUri: null,
    });
    await addPlanEntry({
      date: "2026-08-29",
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId,
      quantityG: 100,
    });

    const payload = await buildBackup();
    await freshDb();
    // Il ripristino non deve sollevare: e' il punto in cui falliva.
    await restoreBackup(payload);

    expect((await listRoutines()).map((r) => r.name)).toEqual(["Full body"]);
    const days = await listRoutineDays(routineId);
    expect(days.map((d) => d.name)).toEqual(["Giorno A"]);
    expect((await recentSessions())[0].workingSets).toBe(1);
    expect(await listPlanEntries("2026-08-29", "2026-08-29")).toHaveLength(1);
  });
});

describe("ripristino e sincronizzazione", () => {
  /**
   * Il difetto: `settings` sta nel backup, e i segnaposto della
   * sincronizzazione stanno in `settings`. Ripristinando si rimettevano quelli
   * del giorno dell'export, che dicono "tutto fino a quella data e' gia' stato
   * mandato". Le righe ripristinate sono tutte piu' vecchie di quella data,
   * quindi non partivano MAI: il server restava com'era e rimandava giu' la
   * propria versione. Chi ripristina un backup si ritrovava un miscuglio fra i
   * dati ripristinati e quelli che il ripristino doveva sostituire.
   */
  it("dopo un ripristino i segnaposto sono azzerati", async () => {
    await seedData();
    // I segnaposto esistono PRIMA dell'export, quindi finiscono nel file: e'
    // il caso vero, un backup preso da un telefono che si sincronizzava.
    await setSetting(CURSOR_KEY, "406");
    await setSetting(PUSHED_KEY, "2099-01-01T00:00:00.000Z");
    const backup = buildBackupFixture(await buildBackup());

    await restoreBackup(backup);

    expect(await getSetting(CURSOR_KEY)).toBeNull();
    expect(await getSetting(PUSHED_KEY)).toBeNull();
  });

  it("dopo un ripristino tutto e' di nuovo da mandare al server", async () => {
    await seedData();
    // Il file porta con se' "ho gia' mandato tutto fino al 2099".
    await setSetting(PUSHED_KEY, "2099-01-01T00:00:00.000Z");
    const backup = buildBackupFixture(await buildBackup());

    await restoreBackup(backup);

    const changes = await collectChanges(await getSetting(PUSHED_KEY));
    expect(changes.some((c) => c.table === "foods")).toBe(true);
  });
});

describe("ripristino e tassonomia", () => {
  /**
   * Il difetto: un backup preso prima della migrazione 020 non contiene ne'
   * `muscle_groups` ne' `equipment_types`. Il ripristino le svuota comunque
   * (sono in `BACKUP_TABLES`) e reinserisce `payload.tables[table] ?? []`,
   * cioe' niente - `runMigrations` non le riscrive perche' lo schema e' gia'
   * all'ultima versione. Senza un seme che ripara dopo il ripristino le due
   * tabelle restano vuote per sempre, e da quando i selettori e
   * `listAvailableEquipment` leggono la tabella invece delle costanti, questo
   * spegne la palestra su un telefono senza account - senza un pull che la
   * ripari.
   */
  it("un backup senza tassonomia lascia le tabelle riseminate e lo store idratato", async () => {
    const payload: BackupPayload = {
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: "2026-08-01T00:00:00.000Z",
      schemaVersion: 19,
      tables: {},
    };

    await restoreBackup(payload);

    expect(await listAvailableEquipment()).toHaveLength(
      SEED_EQUIPMENT_TYPES.length,
    );
    // Non solo la tabella: lo store in memoria deve riflettere il ripristino
    // subito, senza aspettare un riavvio - altrimenti etichette e selettori
    // restano sulle righe di prima del ripristino.
    expect(useTaxonomyStore.getState().liveEquipment.length).toBe(
      SEED_EQUIPMENT_TYPES.length,
    );
  });

  /**
   * Un backup che PORTA la tassonomia (preso dopo la 020) non deve perdere
   * quello che contiene: il seme si applica solo a quel che manca.
   */
  it("un backup con la propria tassonomia non viene sovrascritto dal seme", async () => {
    await replaceTaxonomy("equipment_types", [
      { slug: "anelli", label_it: "Anelli", label_en: "Rings", sort: 120, deleted_at: null },
    ]);
    const payload = await buildBackup();

    await freshDb();
    await restoreBackup(payload);

    expect(await listAllTaxonomy("equipment_types")).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: "anelli" })]),
    );
  });
});

/** Il backup passa da JSON prima di tornare indietro, come nell'uso vero. */
const buildBackupFixture = (payload: unknown) =>
  parseBackup(JSON.stringify(payload));
