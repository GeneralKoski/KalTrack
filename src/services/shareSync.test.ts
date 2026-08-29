import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { addFreeEntry } from "@/src/db/queries/diary";
import { setSteps, setWeight } from "@/src/db/queries/tracking";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { buildSharedDays } from "@/src/services/shareSync";

const DATE = "2026-08-29";

const allOff = {
  calories: false,
  steps: false,
  weight: false,
  workouts: false,
};

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);

  await addFreeEntry({
    date: DATE,
    mealTypeId: MEAL_TYPE_IDS.lunch,
    label: "Pizza",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 800, protein: 30 },
  });
  await setSteps(DATE, 9450);
  await setWeight(DATE, 78.5);
});

afterEach(() => __setDbForTesting(null));

const dayFor = async (shares: Partial<typeof allOff>) => {
  const days = await buildSharedDays(
    { ...allOff, ...shares },
    { today: DATE, days: 1 },
  );
  return days[0];
};

describe("cosa parte dal telefono", () => {
  /**
   * La regola centrale: il filtro sta QUI, prima della rete. Un dato che non
   * deve essere visto non deve nemmeno partire. Il server ha il suo controllo,
   * ma questa e' la prima difesa e non deve dipendere dall'altra.
   */
  it("non manda niente di quel che non e' condiviso", async () => {
    const day = await dayFor({});

    expect(day.kcal).toBeNull();
    expect(day.steps).toBeNull();
    expect(day.weightKg).toBeNull();
    expect(day.workouts).toBeNull();
  });

  it("manda solo il campo acceso", async () => {
    const day = await dayFor({ steps: true });

    expect(day.steps).toBe(9450);
    expect(day.kcal).toBeNull();
    expect(day.weightKg).toBeNull();
  });

  it("manda le calorie come totale del giorno, non le voci", async () => {
    const day = await dayFor({ calories: true });

    expect(day.kcal).toBe(800);
    // Il diario non parte: qui c'e' un numero, non "Pizza".
    expect(JSON.stringify(day)).not.toContain("Pizza");
  });

  it("manda il peso quando e' condiviso", async () => {
    const day = await dayFor({ weight: true });
    expect(day.weightKg).toBe(78.5);
  });

  /**
   * Non registrato resta null anche quando la condivisione e' accesa: uno zero
   * direbbe "ha camminato zero passi", che e' un fatto diverso.
   */
  it("lascia null il giorno senza dati, anche se condiviso", async () => {
    const days = await buildSharedDays(
      { ...allOff, steps: true, weight: true },
      { today: "2026-08-30", days: 1 },
    );

    expect(days[0].date).toBe("2026-08-30");
    expect(days[0].steps).toBeNull();
    expect(days[0].weightKg).toBeNull();
  });

  it("copre la finestra di giorni richiesta, dalla piu' vecchia", async () => {
    const days = await buildSharedDays(allOff, { today: DATE, days: 3 });

    expect(days.map((d) => d.date)).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });
});
