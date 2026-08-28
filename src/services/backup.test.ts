import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { addFoodEntry, getDayDiary } from "@/src/db/queries/diary";
import { createFood, deleteFood, searchFoods } from "@/src/db/queries/foods";
import { getSteps, setSteps } from "@/src/db/queries/tracking";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import {
  BACKUP_FORMAT_VERSION,
  BackupFormatError,
  buildBackup,
  parseBackup,
  restoreBackup,
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
