import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { addFreeEntry } from "@/src/db/queries/diary";
import { earliestRecordedDate } from "@/src/db/queries/history";
import { setSteps, setWeight } from "@/src/db/queries/tracking";
import { startSession } from "@/src/db/queries/workouts";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("earliestRecordedDate", () => {
  it("e' null quando non c'e' ancora niente", async () => {
    expect(await earliestRecordedDate()).toBeNull();
  });

  /**
   * Il primo giorno puo' arrivare da una qualunque delle quattro tabelle: chi
   * pesa senza mangiare ha comunque uno storico da pubblicare.
   */
  it("prende il piu' vecchio fra pasti, passi, peso e allenamenti", async () => {
    await addFreeEntry({
      date: "2026-05-10",
      mealTypeId: MEAL_TYPE_IDS.lunch,
      label: "Pizza",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 800 },
    });
    await setSteps("2026-04-02", 9000);
    await setWeight("2026-03-01", 78);
    await startSession({ date: "2026-06-20" });

    expect(await earliestRecordedDate()).toBe("2026-03-01");
  });

  it("guarda una tabella sola quando le altre sono vuote", async () => {
    await setSteps("2026-04-02", 9000);
    expect(await earliestRecordedDate()).toBe("2026-04-02");
  });
});
