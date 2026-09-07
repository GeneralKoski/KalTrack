import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting, getDb } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { listAllMealTypes, renameMealType } from "@/src/db/queries/diary";
import { listReminders } from "@/src/db/queries/reminders";
import { i18n } from "@/src/i18n";
import { relabelSeededRows } from "@/src/services/seedLabels";

const originale = i18n.locale;

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => {
  i18n.locale = originale;
});

const nameOf = async (id: string): Promise<string | undefined> =>
  (await listAllMealTypes()).find((type) => type.id === id)?.name;

describe("i nomi seminati seguono la lingua", () => {
  it("traduce i pasti predefiniti", async () => {
    expect(await nameOf(MEAL_TYPE_IDS.dinner)).toBe("Cena");

    i18n.locale = "en";
    await relabelSeededRows();
    expect(await nameOf(MEAL_TYPE_IDS.dinner)).toBe("Dinner");
    expect(await nameOf(MEAL_TYPE_IDS.breakfast)).toBe("Breakfast");

    i18n.locale = "it";
    await relabelSeededRows();
    expect(await nameOf(MEAL_TYPE_IDS.dinner)).toBe("Cena");
  });

  /**
   * La regola che non si rompe: cambiare lingua non è un'occasione per
   * riscrivere quel che l'utente ha scritto (`CLAUDE.md` § I pasti che si
   * possono usare).
   */
  it("non tocca un pasto rinominato a mano", async () => {
    await renameMealType(MEAL_TYPE_IDS.dinner, "Post workout");

    i18n.locale = "en";
    await relabelSeededRows();

    expect(await nameOf(MEAL_TYPE_IDS.dinner)).toBe("Post workout");
  });

  it("traduce il promemoria dell'acqua, se è ancora quello di serie", async () => {
    // `listReminders` crea il promemoria predefinito su una tabella vuota.
    const [reminder] = await listReminders();
    expect(reminder.label).toBe("Bevi un bicchiere d'acqua");

    i18n.locale = "en";
    await relabelSeededRows();
    expect((await listReminders())[0].label).toBe("Drink a glass of water");
  });

  it("non tocca un promemoria che l'utente ha rinominato", async () => {
    await listReminders();
    const db = await getDb();
    await db.runAsync("UPDATE reminders SET label = ? WHERE kind = 'water'", [
      "Bevi due litri",
    ]);

    i18n.locale = "en";
    await relabelSeededRows();

    expect((await listReminders())[0].label).toBe("Bevi due litri");
  });

  it("su una lingua che non conosciamo ripiega sull'inglese", async () => {
    i18n.locale = "de";
    await relabelSeededRows();
    expect(await nameOf(MEAL_TYPE_IDS.lunch)).toBe("Lunch");
  });
});
