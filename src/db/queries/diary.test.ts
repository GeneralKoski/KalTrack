import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import {
  addFoodEntry,
  addFreeEntry,
  addRecipeEntry,
  copyDay,
  createMealType,
  dailyKcalRange,
  deleteEntry,
  deleteMealType,
  getDayDiary,
  getEntryComposition,
  listAllMealTypes,
  listMealTypes,
  materializeComposition,
  renameMealType,
  setMealTypeHidden,
  saveEntryComposition,
  updateEntryQuantity,
  updateFreeEntry,
} from "@/src/db/queries/diary";
import { createFood, getFood, updateFood } from "@/src/db/queries/foods";
import {
  createRecipe,
  deleteRecipe,
  updateRecipe,
} from "@/src/db/queries/recipes";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { setComponentGrams } from "@/src/domain/entryComposition";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";

const DATE = "2026-08-28";
let db: LocalDatabase;
let riceId: string;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  riceId = await createFood({
    name: "Riso",
    nutrients: {
      ...EMPTY_NUTRIENTS,
      kcal: 358,
      protein: 7,
      carbs: 79,
      fat: 0.6,
    },
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
      nutrients: {
        ...EMPTY_NUTRIENTS,
        kcal: 850,
        protein: 35,
        carbs: 90,
        fat: 30,
      },
      isEstimated: true,
    });

    const entry = (await getDayDiary(DATE)).meals[0].entries[0];
    expect(entry.label).toBe("Margherita al ristorante");
    expect(entry.is_estimated).toBe(1);
    expect(entry.source_kind).toBe("free");
  });
});

describe("updateFreeEntry", () => {
  it("riscrive nome e valori assoluti", async () => {
    const entryId = await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Margherita al ristorante",
      nutrients: {
        ...EMPTY_NUTRIENTS,
        kcal: 850,
        protein: 35,
        carbs: 90,
        fat: 30,
      },
    });

    await updateFreeEntry(entryId, {
      label: "Margherita XL",
      nutrients: {
        ...EMPTY_NUTRIENTS,
        kcal: 1000,
        protein: 40,
        carbs: 100,
        fat: 35,
      },
    });

    const entry = (await getDayDiary(DATE)).meals[0].entries[0];
    expect(entry.label).toBe("Margherita XL");
    expect(entry.kcal).toBeCloseTo(1000);
    expect(entry.protein).toBeCloseTo(40);
    expect(entry.carbs).toBeCloseTo(100);
    expect(entry.fat).toBeCloseTo(35);
  });

  it("scrive updated_at - la tabella e' sincronizzata", async () => {
    const entryId = await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Piatto",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 500 },
    });
    const before = (await getDayDiary(DATE)).meals[0].entries[0].updated_at;

    await new Promise((r) => setTimeout(r, 5));
    await updateFreeEntry(entryId, {
      label: "Piatto",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 600 },
    });

    const after = (await getDayDiary(DATE)).meals[0].entries[0].updated_at;
    expect(after).not.toBe(before);
  });

  it("non tocca la quantita': resta 1", async () => {
    const entryId = await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Piatto",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 500 },
    });

    await updateFreeEntry(entryId, {
      label: "Piatto corretto",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 700 },
    });

    const entry = (await getDayDiary(DATE)).meals[0].entries[0];
    expect(entry.quantity_g).toBe(1);
    expect(entry.servings).toBeNull();
  });

  it("non scrive su una voce cancellata", async () => {
    const entryId = await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Piatto",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 500 },
    });
    await deleteEntry(entryId);

    await updateFreeEntry(entryId, {
      label: "Non dovrebbe scriversi",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 999 },
    });

    // getDayDiary filtra i cancellati: si legge la riga grezza per vedere se
    // l'UPDATE l'ha comunque toccata.
    const row = await db.getFirstAsync<{ label: string | null; kcal: number }>(
      "SELECT label, kcal FROM meal_entries WHERE id = ?",
      [entryId],
    );
    expect(row?.label).toBe("Piatto");
    expect(row?.kcal).toBe(500);
  });

  /**
   * Finding della review di fase 4: `updateFreeEntry` non tocca
   * `is_estimated` correttamente, e nessun test lo impediva - aggiungendo
   * `is_estimated = 1` alla SET la suite restava verde. Stesso principio del
   * pin gemello su `addFreeEntry` in TodayScreen.test.tsx ("il flag
   * is_estimated", entrambi i versi): un test su un verso solo passerebbe
   * anche se qualcuno inchiodasse il flag a un valore fisso.
   */
  it("una voce scritta a mano resta non stimata dopo la modifica", async () => {
    const entryId = await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Piatto",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 500 },
      isEstimated: false,
    });

    await updateFreeEntry(entryId, {
      label: "Piatto corretto",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 700 },
    });

    const entry = (await getDayDiary(DATE)).meals[0].entries[0];
    expect(entry.is_estimated).toBe(0);
  });

  it("una voce che viene da una stima resta stimata dopo la modifica", async () => {
    const entryId = await addFreeEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Cotoletta",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 400 },
      isEstimated: true,
    });

    await updateFreeEntry(entryId, {
      label: "Cotoletta corretta",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 450 },
    });

    const entry = (await getDayDiary(DATE)).meals[0].entries[0];
    expect(entry.is_estimated).toBe(1);
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
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      foodId: riceId,
      quantityG: 10,
    });
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.breakfast,
      foodId: riceId,
      quantityG: 10,
    });

    const diary = await getDayDiary(DATE);
    expect(diary.meals.map((m) => m.type.name)).toEqual(["Colazione", "Cena"]);
  });

  it("non mescola giorni diversi", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    expect((await getDayDiary("2026-08-29")).totals.kcal).toBe(0);
  });

  it("i totali del pasto sommano solo le sue righe", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      foodId: riceId,
      quantityG: 200,
    });

    const diary = await getDayDiary(DATE);
    const lunch = diary.meals.find((m) => m.type.id === MEAL_TYPE_IDS.lunch);
    expect(lunch?.totals.kcal).toBeCloseTo(358);
    expect(diary.totals.kcal).toBeCloseTo(358 * 3);
  });
});

describe("copyDay", () => {
  it("duplica tutte le righe sul giorno di destinazione", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await copyDay(DATE, "2026-08-29");

    expect((await getDayDiary("2026-08-29")).totals.kcal).toBeCloseTo(358);
    // L'originale resta intatto.
    expect((await getDayDiary(DATE)).totals.kcal).toBeCloseTo(358);
  });

  it("conserva gli snapshot invece di ricalcolarli", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
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
      "Colazione",
      "Brunch",
      "Pranzo",
      "Snack",
      "Cena",
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
    expect((await listMealTypes()).map((t) => t.name)).not.toContain(
      "da buttare",
    );
  });

  it("si può cancellare anche un tipo di default", async () => {
    await deleteMealType(MEAL_TYPE_IDS.brunch);
    expect((await listAllMealTypes()).map((t) => t.name)).not.toContain(
      "Brunch",
    );
  });

  it("l'ultimo pasto attivo non si cancella", async () => {
    const types = await listAllMealTypes();
    for (const type of types.slice(1)) await deleteMealType(type.id);
    await expect(deleteMealType(types[0].id)).rejects.toThrow();
  });

  // Cancellare un pasto e' una scelta su cosa si offre da qui in avanti: quel
  // che si e' mangiato resta scritto, col suo nome.
  it("cancellare un tipo non tocca lo storico", async () => {
    const foodId = await createFood({
      name: "Cornetto",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 300 },
    });
    await addFoodEntry({
      date: "2026-01-06",
      mealTypeId: MEAL_TYPE_IDS.brunch,
      foodId,
      quantityG: 100,
    });
    await deleteMealType(MEAL_TYPE_IDS.brunch);

    const day = await getDayDiary("2026-01-06");
    expect(day.meals.map((m) => m.type.name)).toContain("Brunch");
    expect(day.totals.kcal).toBeGreaterThan(0);
  });

  it("un tipo nascosto non si offre piu', ma resta fra tutti", async () => {
    await setMealTypeHidden(MEAL_TYPE_IDS.brunch, true);
    expect((await listMealTypes()).map((t) => t.name)).not.toContain("Brunch");
    expect((await listAllMealTypes()).map((t) => t.name)).toContain("Brunch");
  });

  it("si riaccende", async () => {
    await setMealTypeHidden(MEAL_TYPE_IDS.brunch, true);
    await setMealTypeHidden(MEAL_TYPE_IDS.brunch, false);
    expect((await listMealTypes()).map((t) => t.name)).toContain("Brunch");
  });

  // Senza un pasto acceso il foglio Aggiungi non ha una destinazione, e la
  // schermata delle impostazioni non avrebbe piu' niente da riaccendere.
  it("l'ultimo pasto acceso non si spegne", async () => {
    const types = await listAllMealTypes();
    for (const type of types.slice(1)) {
      await setMealTypeHidden(type.id, true);
    }
    await expect(setMealTypeHidden(types[0].id, true)).rejects.toThrow();
    expect(await listMealTypes()).toHaveLength(1);
  });

  // Spegnere un pasto e' una scelta su cosa si offre, non una cancellazione:
  // i pasti gia' registrati restano nel diario e nei totali del giorno.
  it("nascondere un tipo non tocca lo storico", async () => {
    const foodId = await createFood({
      name: "Uovo",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 155 },
    });
    await addFoodEntry({
      date: "2026-01-05",
      mealTypeId: MEAL_TYPE_IDS.brunch,
      foodId,
      quantityG: 100,
    });
    await setMealTypeHidden(MEAL_TYPE_IDS.brunch, true);

    const day = await getDayDiary("2026-01-05");
    expect(day.meals.map((m) => m.type.name)).toContain("Brunch");
    expect(day.totals.kcal).toBeGreaterThan(0);
  });
});

/** Ricetta da due porzioni con 140 g di zucchine, e una voce da una porzione. */
async function setupCrepes(): Promise<{
  entryId: string;
  recipeId: string;
  foodId: string;
}> {
  const foodId = await createFood({
    name: "Zucchine",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 17 },
  });
  const recipeId = await createRecipe({
    name: "Crepes",
    servings: 2,
    items: [{ foodId, quantityG: 140 }],
  });
  const entryId = await addRecipeEntry({
    date: DATE,
    mealTypeId: MEAL_TYPE_IDS.lunch,
    recipeId,
    servings: 1,
  });
  return { entryId, recipeId, foodId };
}

/** Azzera la colonna: e' lo stato di una voce scritta prima della migrazione 10. */
async function forgetComposition(entryId: string): Promise<void> {
  await db.runAsync("UPDATE meal_entries SET components = NULL WHERE id = ?", [
    entryId,
  ]);
}

const kcalOf = async (entryId: string): Promise<number> => {
  const row = await db.getFirstAsync<{ kcal: number }>(
    "SELECT kcal FROM meal_entries WHERE id = ?",
    [entryId],
  );
  return row?.kcal ?? 0;
};

describe("composizione di una voce", () => {
  it("una voce da ricetta nasce con la composizione della ricetta", async () => {
    const { entryId } = await setupCrepes();

    const composizione = await getEntryComposition(entryId);

    expect(composizione?.edited).toBe(false);
    expect(composizione?.items).toHaveLength(1);
    expect(composizione?.items[0].label).toBe("Zucchine");
    // Una delle due porzioni: meta' dei 140 g.
    expect(composizione?.items[0].quantityG).toBeCloseTo(70);
  });

  it("salvare una composizione ricalcola i valori della voce", async () => {
    const { entryId } = await setupCrepes();
    const composizione = await getEntryComposition(entryId);
    if (!composizione) throw new Error("composizione attesa");

    await saveEntryComposition(
      entryId,
      setComponentGrams(composizione, 0, 200),
    );

    // 200 g a 17 kcal/100 g.
    expect(await kcalOf(entryId)).toBeCloseTo(34);
  });

  /*
   * Il difetto che questo lavoro chiude: prima le porzioni rileggevano la
   * ricetta viva, quindi modificare la ricetta e poi toccare le porzioni di una
   * voce vecchia la aggiornava ai valori nuovi, contraddicendo la fotografia.
   */
  it("cambiare le porzioni non rilegge la ricetta", async () => {
    const { entryId, recipeId, foodId } = await setupCrepes();

    await updateRecipe(recipeId, {
      name: "Crepes",
      servings: 2,
      items: [{ foodId, quantityG: 999 }],
    });

    await updateEntryQuantity(entryId, 2);

    const composizione = await getEntryComposition(entryId);
    // I 70 g raddoppiati, non i 999 della ricetta cambiata.
    expect(composizione?.items[0].quantityG).toBeCloseTo(140);
  });

  it("cambiare le porzioni non marca la voce come modificata", async () => {
    const { entryId } = await setupCrepes();

    await updateEntryQuantity(entryId, 2);

    expect((await getEntryComposition(entryId))?.edited).toBe(false);
  });

  it("una voce senza composizione la materializza dalla ricetta", async () => {
    const { entryId } = await setupCrepes();
    await forgetComposition(entryId);

    const composizione = await materializeComposition(entryId);

    expect(composizione?.items).toHaveLength(1);
    // E la scrive, cosi' la volta dopo non si ricostruisce da capo.
    expect(await getEntryComposition(entryId)).not.toBeNull();
  });

  it("se la ricetta non esiste piu' la materializzazione torna null", async () => {
    const { entryId, recipeId } = await setupCrepes();
    await deleteRecipe(recipeId);
    await forgetComposition(entryId);

    await expect(materializeComposition(entryId)).resolves.toBeNull();
  });

  it("una voce da alimento non ha composizione", async () => {
    const entryId = await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    await expect(getEntryComposition(entryId)).resolves.toBeNull();
    await expect(materializeComposition(entryId)).resolves.toBeNull();
  });
});

/*
 * `dailyKcalRange` e' la sorgente della schermata di resoconto delle
 * calorie (Task 8, Fase 4): la sua media si divide per i giorni che questa
 * query restituisce, quindi il contratto "un giorno senza pasti non compare"
 * e' quello che tiene corretta quella media - non era coperto da nessun test
 * prima di questo lavoro, pur avendo gia' tre chiamanti.
 */
describe("dailyKcalRange", () => {
  it("somma le calorie di piu' pasti nello stesso giorno", async () => {
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      foodId: riceId,
      quantityG: 50,
    });

    const giorni = await dailyKcalRange(DATE, DATE);

    expect(giorni).toHaveLength(1);
    expect(giorni[0].date).toBe(DATE);
    expect(giorni[0].kcal).toBeCloseTo(358 * 1.5);
  });

  it("un giorno senza pasti non compare, anche se e' nell'intervallo", async () => {
    const senzaPasti = "2026-08-29";
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    const giorni = await dailyKcalRange(DATE, senzaPasti);

    expect(giorni.map((g) => g.date)).toEqual([DATE]);
  });

  it("un giorno le cui uniche voci sono state cancellate sparisce dal risultato", async () => {
    const entryId = await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await deleteEntry(entryId);

    expect(await dailyKcalRange(DATE, DATE)).toEqual([]);
  });

  it("torna in ordine cronologico, non nell'ordine in cui i pasti sono stati scritti", async () => {
    const dopo = "2026-08-30";
    await addFoodEntry({
      date: dopo,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });
    await addFoodEntry({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: riceId,
      quantityG: 100,
    });

    const giorni = await dailyKcalRange(DATE, dopo);

    expect(giorni.map((g) => g.date)).toEqual([DATE, dopo]);
  });
});
