import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import {
  addFoodEntry,
  addFreeEntry,
  addRecipeEntry,
  copyDay,
  createMealType,
  deleteEntry,
  deleteMealType,
  getDayDiary,
  listMealTypes,
  renameMealType,
  updateEntryQuantity,
} from "@/src/db/queries/diary";
import { createFood, getFood, updateFood } from "@/src/db/queries/foods";
import { createRecipe } from "@/src/db/queries/recipes";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

const DATE = "2026-08-28";
let db: LocalDatabase;
let riceId: string;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  riceId = await createFood({
    name: "Riso",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 358, protein: 7, carbs: 79, fat: 0.6 },
  });
});

afterEach(() => __setDbForTesting(null));

describe("addFoodEntry", () => {
  it("crea il pasto se non esiste e vi aggiunge la riga", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    const diary = await getDayDiary(DATE);
    expect(diary.meals).toHaveLength(1);
    expect(diary.meals[0].entries).toHaveLength(1);
    expect(diary.totals.kcal).toBeCloseTo(358);
  });

  it("riusa il pasto esistente dello stesso tipo e giorno", async () => {
    for (const grams of [100, 50]) {
      await addFoodEntry({
        date: DATE,
        mealTypeId: MEAL_TYPE_IDS.lunch,
        foodId: riceId,
        quantityG: grams,
      });
    }

    const diary = await getDayDiary(DATE);
    expect(diary.meals).toHaveLength(1);
    expect(diary.meals[0].entries).toHaveLength(2);
    expect(diary.totals.kcal).toBeCloseTo(358 * 1.5);
  });

  it("congela i macro al momento dell'inserimento", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    // L'alimento viene corretto DOPO: lo storico non deve cambiare.
    await updateFood(riceId, {
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 1000 },
    });

    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358);
  });

  it("incrementa il contatore d'uso dell'alimento", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    expect((await getFood(riceId))?.usage_count).toBe(1);
  });

  it("registra da dove arriva la riga", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
      createdVia: "voice",
    });
    const diary = await getDayDiary(DATE);
    expect(diary.meals[0].entries[0].created_via).toBe("voice");
  });

  it("rifiuta un alimento inesistente invece di scrivere una riga vuota", async () => {
    await expect(
      addFoodEntry({
        date: DATE,
        mealTypeId: MEAL_TYPE_IDS.lunch,
        foodId: "non-esiste",
        quantityG: 100,
      }),
    ).rejects.toThrow();
  });
});

describe("addRecipeEntry", () => {
  it("registra i valori a porzione moltiplicati per le porzioni", async () => {
    const recipeId = await createRecipe({
      name: "Riso semplice",
      servings: 2,
      items: [{ foodId: riceId, quantityG: 200 }],
    });

    await addRecipeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      recipeId,
      servings: 1,
    });

    // 200 g di riso = 716 kcal totali, 358 a porzione.
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358);
  });

  it("scala con le porzioni", async () => {
    const recipeId = await createRecipe({
      name: "Riso semplice",
      servings: 2,
      items: [{ foodId: riceId, quantityG: 200 }],
    });
    await addRecipeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      recipeId,
      servings: 2,
    });
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(716);
  });
});

describe("addFreeEntry", () => {
  it("registra una voce libera con i valori indicati", async () => {
    await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Margherita al ristorante",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 850, protein: 35, carbs: 90, fat: 30 },
      isEstimated: true,
    });

    const entry = (await getDayDiary(DATE)).meals[0].entries[0];
    expect(entry.label).toBe("Margherita al ristorante");
    expect(entry.is_estimated).toBe(1);
    expect(entry.source_kind).toBe("free");
  });
});

describe("updateEntryQuantity", () => {
  it("ricalcola lo snapshot dai valori attuali dell'alimento", async () => {
    const entryId = await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    await updateEntryQuantity(entryId, 250);
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358 * 2.5);
  });

  it("su una voce libera scala proporzionalmente lo snapshot", async () => {
    const entryId = await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Piatto stimato",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 500 },
    });

    // Una voce libera parte da quantità 1: raddoppiarla raddoppia i valori.
    await updateEntryQuantity(entryId, 2);
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(1000);
  });

  it("con quantità zero o negativa non scrive nulla", async () => {
    const entryId = await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await expect(updateEntryQuantity(entryId, 0)).rejects.toThrow();
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358);
  });
});

describe("deleteEntry", () => {
  it("toglie la riga dai totali", async () => {
    const entryId = await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await deleteEntry(entryId);
    expect((await getDayDiary(DATE)).totals.kcal).toBe(0);
  });

  it("un pasto rimasto senza righe sparisce dal giorno", async () => {
    const entryId = await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await deleteEntry(entryId);
    expect((await getDayDiary(DATE)).meals).toHaveLength(0);
  });
});

describe("getDayDiary", () => {
  it("su un giorno vuoto ritorna zero pasti e totali a zero", async () => {
    const diary = await getDayDiary("2026-01-01");
    expect(diary.meals).toEqual([]);
    expect(diary.totals).toEqual(EMPTY_NUTRIENTS);
  });

  it("ordina i pasti secondo l'ordine dei tipi, non di inserimento", async () => {
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.dinner, foodId: riceId, quantityG: 10 });
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.breakfast, foodId: riceId, quantityG: 10 });

    const diary = await getDayDiary(DATE);
    expect(diary.meals.map((m) => m.type.name)).toEqual(["colazione", "cena"]);
  });

  it("non mescola giorni diversi", async () => {
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.lunch, foodId: riceId, quantityG: 100 });
    expect((await getDayDiary("2026-08-29")).totals.kcal).toBe(0);
  });

  it("i totali del pasto sommano solo le sue righe", async () => {
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.lunch, foodId: riceId, quantityG: 100 });
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.dinner, foodId: riceId, quantityG: 200 });

    const diary = await getDayDiary(DATE);
    const lunch = diary.meals.find((m) => m.type.id === MEAL_TYPE_IDS.lunch);
    expect(lunch?.totals.kcal).toBeCloseTo(358);
    expect(diary.totals.kcal).toBeCloseTo(358 * 3);
  });
});

describe("copyDay", () => {
  it("duplica tutte le righe sul giorno di destinazione", async () => {
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.lunch, foodId: riceId, quantityG: 100 });
    await copyDay(DATE, "2026-08-29");

    expect((await getDayDiary("2026-08-29")).totals.kcal).toBeCloseTo(358);
    // L'originale resta intatto.
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358);
  });

  it("conserva gli snapshot invece di ricalcolarli", async () => {
    await addFoodEntry({ date: DATE, mealTypeId: MEAL_TYPE_IDS.lunch, foodId: riceId, quantityG: 100 });
    await updateFood(riceId, {
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 1000 },
    });
    await copyDay(DATE, "2026-08-29");

    expect((await getDayDiary("2026-08-29")).totals.kcal).toBeCloseTo(358);
  });

  it("copiare un giorno vuoto non crea nulla", async () => {
    await copyDay("2026-01-01", "2026-01-02");
    expect((await getDayDiary("2026-01-02")).meals).toHaveLength(0);
  });
});

describe("tipi di pasto", () => {
  it("elenca i cinque di default in ordine", async () => {
    const types = await listMealTypes();
    expect(types.map((t) => t.name)).toEqual([
      "colazione",
      "brunch",
      "pranzo",
      "snack",
      "cena",
    ]);
  });

  it("un tipo custom si aggiunge in fondo", async () => {
    await createMealType("spuntino notturno");
    const types = await listMealTypes();
    expect(types[types.length - 1].name).toBe("spuntino notturno");
    expect(types[types.length - 1].is_custom).toBe(1);
  });

  it("si può rinominare", async () => {
    const id = await createMealType("pre workout");
    await renameMealType(id, "pre-allenamento");
    const types = await listMealTypes();
    expect(types.map((t) => t.name)).toContain("pre-allenamento");
  });

  it("si può cancellare un tipo custom", async () => {
    const id = await createMealType("da buttare");
    await deleteMealType(id);
    expect((await listMealTypes()).map((t) => t.name)).not.toContain("da buttare");
  });

  it("i tipi di default non sono cancellabili", async () => {
    await expect(deleteMealType(MEAL_TYPE_IDS.lunch)).rejects.toThrow();
    expect((await listMealTypes()).map((t) => t.name)).toContain("pranzo");
  });
});
