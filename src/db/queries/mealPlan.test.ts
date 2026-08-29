import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { getDayDiary } from "@/src/db/queries/diary";
import { createFood } from "@/src/db/queries/foods";
import {
  addPlanEntry,
  applyPlanToDiary,
  copyPlanWeek,
  deletePlanEntry,
  isPlanApplied,
  listPlan,
  listPlanEntries,
  planToShoppingList,
} from "@/src/db/queries/mealPlan";
import { createRecipe } from "@/src/db/queries/recipes";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";

const MONDAY = "2026-08-31";
const TUESDAY = "2026-09-01";
const NEXT_MONDAY = "2026-09-07";

let db: LocalDatabase;
let pastaId: string;
let tomatoId: string;
let cheeseId: string;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);

  pastaId = await createFood({
    name: "Pasta",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 350, carbs: 72 },
  });
  tomatoId = await createFood({
    name: "Pomodoro",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 20, carbs: 4 },
  });
  cheeseId = await createFood({
    name: "Formaggio",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 400, protein: 25, fat: 33 },
  });
});

afterEach(() => __setDbForTesting(null));

describe("addPlanEntry / listPlan / deletePlanEntry", () => {
  it("rifiuta una voce senza ricetta, alimento né nome", async () => {
    await expect(
      addPlanEntry({ date: MONDAY, mealTypeId: MEAL_TYPE_IDS.lunch }),
    ).rejects.toThrow();
  });

  it("legge solo l'intervallo richiesto e salta le voci cancellate", async () => {
    const id = await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: pastaId,
      quantityG: 100,
    });
    await addPlanEntry({
      date: TUESDAY,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      foodId: tomatoId,
      quantityG: 200,
    });
    await addPlanEntry({
      date: NEXT_MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: pastaId,
      quantityG: 50,
    });

    expect(await listPlan(MONDAY, TUESDAY)).toHaveLength(2);

    await deletePlanEntry(id);
    const remaining = await listPlan(MONDAY, TUESDAY);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].food_id).toBe(tomatoId);
  });
});

describe("listPlanEntries", () => {
  it("risolve nome e calorie previste di un alimento", async () => {
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: pastaId,
      quantityG: 200,
    });

    const [entry] = await listPlanEntries(MONDAY, MONDAY);
    expect(entry.name).toBe("Pasta");
    expect(entry.kcal).toBeCloseTo(700);
  });

  it("lascia le calorie a null per una voce col solo nome", async () => {
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Cena fuori",
    });

    const [entry] = await listPlanEntries(MONDAY, MONDAY);
    expect(entry.name).toBe("Cena fuori");
    expect(entry.kcal).toBeNull();
  });
});

describe("copyPlanWeek", () => {
  it("ricopia i giorni mantenendo l'offset dall'inizio settimana", async () => {
    await addPlanEntry({
      date: TUESDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: pastaId,
      quantityG: 120,
    });

    const copied = await copyPlanWeek(MONDAY, NEXT_MONDAY);
    expect(copied).toBe(1);

    const target = await listPlan(NEXT_MONDAY, "2026-09-13");
    expect(target).toHaveLength(1);
    // Martedì della settimana di partenza -> martedì di quella di arrivo.
    expect(target[0].date).toBe("2026-09-08");
    expect(target[0].quantity_g).toBe(120);
  });

  it("sostituisce il piano della settimana di destinazione invece di sommarsi", async () => {
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: pastaId,
      quantityG: 100,
    });
    await addPlanEntry({
      date: NEXT_MONDAY,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      foodId: cheeseId,
      quantityG: 50,
    });

    await copyPlanWeek(MONDAY, NEXT_MONDAY);

    const target = await listPlan(NEXT_MONDAY, "2026-09-13");
    expect(target).toHaveLength(1);
    expect(target[0].food_id).toBe(pastaId);
  });
});

describe("planToShoppingList", () => {
  it("espande una ricetta nei suoi ingredienti, scalati sulle porzioni", async () => {
    // 4 porzioni: 400 g di pasta e 200 g di pomodoro in tutto.
    const recipeId = await createRecipe({
      name: "Pasta al pomodoro",
      servings: 4,
      items: [
        { foodId: pastaId, quantityG: 400 },
        { foodId: tomatoId, quantityG: 200 },
      ],
    });
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      recipeId,
      servings: 2,
    });

    const list = await planToShoppingList(MONDAY, MONDAY);
    expect(list.map((i) => i.name)).toEqual(["Pasta", "Pomodoro"]);
    expect(list.find((i) => i.foodId === pastaId)?.grams).toBeCloseTo(200);
    expect(list.find((i) => i.foodId === tomatoId)?.grams).toBeCloseTo(100);
  });

  it("somma una volta sola l'ingrediente condiviso da due ricette", async () => {
    const first = await createRecipe({
      name: "Pasta al pomodoro",
      servings: 1,
      items: [
        { foodId: pastaId, quantityG: 100 },
        { foodId: tomatoId, quantityG: 150 },
      ],
    });
    const second = await createRecipe({
      name: "Pasta al formaggio",
      servings: 1,
      items: [
        { foodId: pastaId, quantityG: 80 },
        { foodId: cheeseId, quantityG: 40 },
      ],
    });

    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      recipeId: first,
      servings: 1,
    });
    await addPlanEntry({
      date: TUESDAY,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      recipeId: second,
      servings: 1,
    });

    const list = await planToShoppingList(MONDAY, TUESDAY);
    expect(list).toHaveLength(3);
    expect(list.find((i) => i.foodId === pastaId)?.grams).toBeCloseTo(180);
  });

  it("somma alla lista anche gli alimenti messi a piano da soli", async () => {
    const recipeId = await createRecipe({
      name: "Insalata",
      servings: 1,
      items: [{ foodId: tomatoId, quantityG: 100 }],
    });
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      recipeId,
      servings: 1,
    });
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.snack,
      foodId: tomatoId,
      quantityG: 50,
    });

    const list = await planToShoppingList(MONDAY, MONDAY);
    expect(list).toHaveLength(1);
    expect(list[0].grams).toBeCloseTo(150);
  });

  it("scende nelle ricette annidate scalando le porzioni", async () => {
    const sauce = await createRecipe({
      name: "Sugo",
      servings: 2,
      items: [{ foodId: tomatoId, quantityG: 300 }],
    });
    const dish = await createRecipe({
      name: "Pasta col sugo",
      servings: 2,
      items: [
        { foodId: pastaId, quantityG: 200 },
        { childRecipeId: sauce, servings: 2 },
      ],
    });
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      recipeId: dish,
      servings: 1,
    });

    const list = await planToShoppingList(MONDAY, MONDAY);
    expect(list.find((i) => i.foodId === pastaId)?.grams).toBeCloseTo(100);
    // Mezza ricetta -> 1 porzione di sugo su 2 -> metà dei 300 g di pomodoro.
    expect(list.find((i) => i.foodId === tomatoId)?.grams).toBeCloseTo(150);
  });

  it("ignora le voci col solo nome: non c'è niente da comprare", async () => {
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Pizza fuori",
    });

    expect(await planToShoppingList(MONDAY, MONDAY)).toEqual([]);
  });
});

describe("applyPlanToDiary", () => {
  it("crea le voci di diario senza svuotare il piano", async () => {
    const recipeId = await createRecipe({
      name: "Insalata",
      servings: 1,
      items: [{ foodId: tomatoId, quantityG: 100 }],
    });
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: pastaId,
      quantityG: 100,
    });
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      recipeId,
      servings: 1,
    });

    const result = await applyPlanToDiary(MONDAY);
    expect(result).toEqual({ created: 2, skipped: 0, alreadyApplied: false });

    const diary = await getDayDiary(MONDAY);
    expect(diary.meals).toHaveLength(2);
    expect(diary.totals.kcal).toBeCloseTo(350 + 20);

    // Il piano resta: serve a confrontare intenzione e realtà.
    expect(await listPlan(MONDAY, MONDAY)).toHaveLength(2);
  });

  it("non duplica se chiamata due volte sullo stesso giorno", async () => {
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: pastaId,
      quantityG: 100,
    });

    await applyPlanToDiary(MONDAY);
    const second = await applyPlanToDiary(MONDAY);

    expect(second).toEqual({ created: 0, skipped: 0, alreadyApplied: true });
    const diary = await getDayDiary(MONDAY);
    expect(diary.meals[0].entries).toHaveLength(1);
    expect(await isPlanApplied(MONDAY)).toBe(true);
  });

  it("lascia fuori le voci col solo nome invece di dar loro zero calorie", async () => {
    await addPlanEntry({
      date: MONDAY,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Cena fuori",
    });

    const result = await applyPlanToDiary(MONDAY);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect((await getDayDiary(MONDAY)).meals).toHaveLength(0);
  });

  it("il flag è per giorno: applicare lunedì non blocca martedì", async () => {
    for (const date of [MONDAY, TUESDAY]) {
      await addPlanEntry({
        date,
        mealTypeId: MEAL_TYPE_IDS.lunch,
        foodId: pastaId,
        quantityG: 100,
      });
    }

    await applyPlanToDiary(MONDAY);
    expect(await isPlanApplied(TUESDAY)).toBe(false);
    expect((await applyPlanToDiary(TUESDAY)).created).toBe(1);
  });
});
