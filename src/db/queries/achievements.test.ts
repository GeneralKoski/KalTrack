import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import {
  collectStats,
  listUnlocked,
  syncAchievements,
} from "@/src/db/queries/achievements";
import { addFoodEntry } from "@/src/db/queries/diary";
import { createExercise } from "@/src/db/queries/exercises";
import { createFood } from "@/src/db/queries/foods";
import { setSteps, setWeight } from "@/src/db/queries/tracking";
import { logSet, startSession } from "@/src/db/queries/workouts";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;
let foodId: string;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  foodId = await createFood({
    name: "Riso",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
  });
});

afterEach(() => __setDbForTesting(null));

const logMeal = (date: string) =>
  addFoodEntry({
    date,
    mealTypeId: MEAL_TYPE_IDS.lunch,
    foodId,
    quantityG: 100,
  });

describe("collectStats", () => {
  it("su un database vuoto è tutto a zero", async () => {
    const stats = await collectStats();
    expect(stats.loggedDays).toBe(0);
    expect(stats.totalSteps).toBe(0);
    expect(stats.bestWeightKg).toBeNull();
  });

  it("conta i giorni con almeno un pasto, non le voci", async () => {
    await logMeal("2026-08-28");
    await logMeal("2026-08-28");
    await logMeal("2026-08-29");

    expect((await collectStats()).loggedDays).toBe(2);
  });

  it("somma i passi e trova il giorno migliore", async () => {
    await setSteps("2026-08-27", 8000);
    await setSteps("2026-08-28", 15200);

    const stats = await collectStats();
    expect(stats.totalSteps).toBe(23200);
    expect(stats.bestDaySteps).toBe(15200);
  });

  it("il peso migliore è il più basso registrato", async () => {
    await setWeight("2026-08-20", 82);
    await setWeight("2026-08-28", 78.4);
    expect((await collectStats()).bestWeightKg).toBe(78.4);
  });

  it("conta i giorni di allenamento, non le serie", async () => {
    const exerciseId = await createExercise({
      name: "Panca",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
    });
    const session = await startSession({ date: "2026-08-28" });
    await logSet({ sessionId: session, exerciseId, setIndex: 0, reps: 10, weight: 60 });
    await logSet({ sessionId: session, exerciseId, setIndex: 1, reps: 10, weight: 60 });

    expect((await collectStats()).workoutDays).toBe(1);
  });
});

describe("syncAchievements", () => {
  it("sblocca e salva i traguardi raggiunti", async () => {
    await setSteps("2026-08-28", 15200);
    const unlocked = await syncAchievements();

    expect(unlocked.map((u) => u.code)).toContain("day_steps_10k");
    expect(unlocked.map((u) => u.code)).toContain("day_steps_15k");
    expect((await listUnlocked()).length).toBe(unlocked.length);
  });

  it("una seconda esecuzione non sblocca di nuovo", async () => {
    await setSteps("2026-08-28", 15200);
    await syncAchievements();
    expect(await syncAchievements()).toEqual([]);
  });

  it("registra il valore che ha fatto scattare il traguardo", async () => {
    await setSteps("2026-08-28", 15200);
    await syncAchievements();

    const rows = await listUnlocked();
    const steps = rows.find((r) => r.code === "day_steps_15k");
    expect(steps?.value).toBe(15200);
  });

  it("è sicura da chiamare a ogni avvio", async () => {
    // Nessun traguardo raggiunto: non deve scrivere niente né fallire.
    expect(await syncAchievements()).toEqual([]);
    expect(await listUnlocked()).toEqual([]);
  });
});
