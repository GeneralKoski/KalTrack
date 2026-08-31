import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import { getFood, incrementFoodUsage } from "@/src/db/queries/foods";
import {
  buildRecipeTree,
  getRecipe,
  incrementRecipeUsage,
} from "@/src/db/queries/recipes";
import {
  compositionNutrients,
  flattenRecipe,
  parseComposition,
  rescaleComposition,
  serializeComposition,
  type EntryComposition,
} from "@/src/domain/entryComposition";
import {
  EMPTY_NUTRIENTS,
  recipePerServing,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
} from "@/src/domain/nutrition";
import {
  entryNutrients,
  foodNutrients,
  type EntryCreatedVia,
  type MealEntryRow,
  type MealRow,
  type MealTypeRow,
} from "@/src/types/nutrition";

export interface DiaryMeal {
  meal: MealRow;
  type: MealTypeRow;
  entries: MealEntryRow[];
  totals: Nutrients;
}

export interface DayDiary {
  date: string;
  meals: DiaryMeal[];
  totals: Nutrients;
}

/**
 * I nomi delle righe di un giorno, per id.
 *
 * Il nome non sta sulla riga - che porta solo lo snapshot dei macro - e va
 * risolto dall'alimento o dal pasto a cui punta. Vive qui perche' lo usano
 * sia la schermata di oggi sia il contesto dell'assistente: quando
 * l'assistente aveva la sua versione approssimata, ogni voce si chiamava col
 * nome del tipo di pasto e "togli il pane" non poteva funzionare.
 */
export async function entryDisplayNames(
  diary: DayDiary,
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const meal of diary.meals) {
    for (const entry of meal.entries) {
      if (entry.label) {
        names[entry.id] = entry.label;
      } else if (entry.food_id) {
        names[entry.id] = (await getFood(entry.food_id))?.name ?? "";
      } else if (entry.recipe_id) {
        names[entry.id] = (await getRecipe(entry.recipe_id))?.name ?? "";
      }
    }
  }
  return names;
}

/** Quantità di riferimento di una voce libera: non ha grammi, parte da 1. */
const FREE_ENTRY_BASE_QUANTITY = 1;

// ─── Tipi di pasto ───────────────────────────────────────────────────────────

export async function listMealTypes(): Promise<MealTypeRow[]> {
  const db = await getDb();
  return db.getAllAsync<MealTypeRow>(
    "SELECT * FROM meal_types WHERE deleted_at IS NULL ORDER BY sort ASC",
  );
}

export async function createMealType(name: string): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  const row = await db.getFirstAsync<{ maxSort: number | null }>(
    "SELECT MAX(sort) AS maxSort FROM meal_types",
  );
  await db.runAsync(
    `INSERT INTO meal_types (id, name, sort, is_custom, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [id, name, (row?.maxSort ?? 0) + 10, now, now],
  );
  return id;
}

export async function renameMealType(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE meal_types SET name = ?, updated_at = ? WHERE id = ?",
    [name, nowIso(), id],
  );
}

/**
 * Cancella un tipo di pasto custom. I cinque di default non sono cancellabili:
 * i loro id sono referenziati dal seed, dai test e (in Fase 2) dai tool vocali.
 */
export async function deleteMealType(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ is_custom: number }>(
    "SELECT is_custom FROM meal_types WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  if (!row) throw new Error(`Tipo di pasto ${id} inesistente`);
  if (row.is_custom !== 1) {
    throw new Error("I tipi di pasto predefiniti non si possono eliminare");
  }
  const now = nowIso();
  await db.runAsync(
    "UPDATE meal_types SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

// ─── Lettura del giorno ──────────────────────────────────────────────────────

/**
 * Il diario di un giorno: pasti nell'ordine dei loro tipi, ciascuno coi propri
 * totali, più il totale della giornata. È l'unico punto che aggrega un giorno:
 * nessuna schermata somma per conto proprio.
 *
 * I pasti senza righe vive non compaiono, così cancellare l'ultima riga di un
 * pasto lo fa sparire invece di lasciare un contenitore vuoto.
 */
export async function getDayDiary(date: string): Promise<DayDiary> {
  const db = await getDb();

  const meals = await db.getAllAsync<MealRow & { type_name: string }>(
    `SELECT m.* FROM meals m
     JOIN meal_types mt ON mt.id = m.meal_type_id
     WHERE m.date = ? AND m.deleted_at IS NULL
     ORDER BY mt.sort ASC`,
    [date],
  );
  if (meals.length === 0) {
    return { date, meals: [], totals: { ...EMPTY_NUTRIENTS } };
  }

  const types = await listMealTypes();
  const typeById = new Map(types.map((t) => [t.id, t]));

  const result: DiaryMeal[] = [];
  for (const meal of meals) {
    const type = typeById.get(meal.meal_type_id);
    if (!type) continue;

    const entries = await db.getAllAsync<MealEntryRow>(
      `SELECT * FROM meal_entries
       WHERE meal_id = ? AND deleted_at IS NULL
       ORDER BY sort ASC, created_at ASC`,
      [meal.id],
    );
    if (entries.length === 0) continue;

    result.push({
      meal,
      type,
      entries,
      totals: sumNutrients(entries.map(entryNutrients)),
    });
  }

  return {
    date,
    meals: result,
    totals: sumNutrients(result.map((m) => m.totals)),
  };
}

// ─── Scrittura ───────────────────────────────────────────────────────────────

/** Trova il pasto del giorno e del tipo dati, creandolo se non esiste. */
async function ensureMeal(date: string, mealTypeId: string): Promise<string> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM meals WHERE date = ? AND meal_type_id = ? AND deleted_at IS NULL",
    [date, mealTypeId],
  );
  if (existing) return existing.id;

  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO meals (id, date, meal_type_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, date, mealTypeId, now, now],
  );
  return id;
}

interface InsertEntryArgs {
  mealId: string;
  sourceKind: "food" | "recipe" | "free";
  foodId?: string | null;
  recipeId?: string | null;
  label?: string | null;
  quantityG?: number | null;
  servings?: number | null;
  nutrients: Nutrients;
  isEstimated?: boolean;
  confidence?: number | null;
  note?: string | null;
  photoUri?: string | null;
  createdVia?: EntryCreatedVia;
}

/**
 * Unica funzione di scrittura di una riga: riceve lo snapshot già calcolato,
 * così le tre `add*Entry` differiscono solo per come lo ottengono.
 */
async function insertEntry(args: InsertEntryArgs): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  const n = args.nutrients;

  const sortRow = await db.getFirstAsync<{ maxSort: number | null }>(
    "SELECT MAX(sort) AS maxSort FROM meal_entries WHERE meal_id = ?",
    [args.mealId],
  );

  await db.runAsync(
    `INSERT INTO meal_entries (
       id, meal_id, source_kind, food_id, recipe_id, label,
       quantity_g, servings,
       kcal, protein, carbs, sugars, fat, saturated_fat, fiber, salt,
       is_estimated, confidence, note, photo_uri, created_via, sort,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      args.mealId,
      args.sourceKind,
      args.foodId ?? null,
      args.recipeId ?? null,
      args.label ?? null,
      args.quantityG ?? null,
      args.servings ?? null,
      n.kcal,
      n.protein,
      n.carbs,
      n.sugars,
      n.fat,
      n.saturatedFat,
      n.fiber,
      n.salt,
      args.isEstimated ? 1 : 0,
      args.confidence ?? null,
      args.note ?? null,
      args.photoUri ?? null,
      args.createdVia ?? "manual",
      (sortRow?.maxSort ?? -1) + 1,
      now,
      now,
    ],
  );
  return id;
}

export async function addFoodEntry(args: {
  date: string;
  mealTypeId: string;
  foodId: string;
  quantityG: number;
  createdVia?: EntryCreatedVia;
}): Promise<string> {
  const food = await getFood(args.foodId);
  if (!food) throw new Error(`Alimento ${args.foodId} inesistente`);

  const mealId = await ensureMeal(args.date, args.mealTypeId);
  const id = await insertEntry({
    mealId,
    sourceKind: "food",
    foodId: food.id,
    quantityG: args.quantityG,
    nutrients: scaleNutrients(foodNutrients(food), args.quantityG),
    isEstimated: food.is_estimated === 1,
    createdVia: args.createdVia,
  });
  await incrementFoodUsage(food.id);
  return id;
}

export async function addRecipeEntry(args: {
  date: string;
  mealTypeId: string;
  recipeId: string;
  servings: number;
  createdVia?: EntryCreatedVia;
}): Promise<string> {
  const tree = await buildRecipeTree(args.recipeId);
  if (!tree) throw new Error(`Pasto ${args.recipeId} inesistente`);

  const perServing = recipePerServing(tree);
  const mealId = await ensureMeal(args.date, args.mealTypeId);
  const id = await insertEntry({
    mealId,
    sourceKind: "recipe",
    recipeId: args.recipeId,
    servings: args.servings,
    nutrients: scaleNutrients(perServing, args.servings * 100),
    createdVia: args.createdVia,
  });
  // La voce porta la propria composizione da subito: cosi' modificarla non
  // richiede di risalire alla ricetta, che nel frattempo puo' essere cambiata.
  await saveEntryComposition(id, {
    edited: false,
    items: flattenRecipe(tree, args.servings),
  });
  await incrementRecipeUsage(args.recipeId);
  return id;
}

export async function addFreeEntry(args: {
  date: string;
  mealTypeId: string;
  label: string;
  nutrients: Nutrients;
  isEstimated?: boolean;
  confidence?: number | null;
  note?: string | null;
  photoUri?: string | null;
  createdVia?: EntryCreatedVia;
}): Promise<string> {
  const mealId = await ensureMeal(args.date, args.mealTypeId);
  return insertEntry({
    mealId,
    sourceKind: "free",
    label: args.label,
    quantityG: FREE_ENTRY_BASE_QUANTITY,
    nutrients: args.nutrients,
    isEstimated: args.isEstimated,
    confidence: args.confidence,
    note: args.note,
    photoUri: args.photoUri,
    createdVia: args.createdVia,
  });
}

/**
 * Cambia la quantità di una riga e ne ricalcola lo snapshot.
 *
 * Per alimenti e pasti ricalcola dai valori ATTUALI: l'utente sta correggendo
 * quella riga adesso, quindi il dato fresco è quello giusto. Per una voce
 * libera non c'è nulla da rileggere, e lo snapshot si scala in proporzione.
 */
export async function updateEntryQuantity(
  entryId: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) throw new Error("La quantità deve essere positiva");

  const db = await getDb();
  const entry = await db.getFirstAsync<MealEntryRow>(
    "SELECT * FROM meal_entries WHERE id = ? AND deleted_at IS NULL",
    [entryId],
  );
  if (!entry) throw new Error(`Riga ${entryId} inesistente`);

  let nutrients: Nutrients;
  let quantityG: number | null = null;
  let servings: number | null = null;

  if (entry.food_id) {
    const food = await getFood(entry.food_id);
    if (!food) throw new Error("L'alimento della riga non esiste più");
    nutrients = scaleNutrients(foodNutrients(food), quantity);
    quantityG = quantity;
  } else if (entry.recipe_id) {
    const composition = parseComposition(entry.components);
    if (composition) {
      /*
       * La composizione della voce e' la verita', e si riscala quella.
       *
       * Prima si rileggeva la ricetta viva: chi modificava una ricetta e poi
       * toccava le porzioni di una voce di due settimane prima si ritrovava
       * quella voce aggiornata ai valori nuovi, contro la promessa che una riga
       * di diario e' una fotografia.
       */
      const previous = entry.servings || 1;
      await saveEntryComposition(
        entryId,
        rescaleComposition(composition, quantity / previous),
      );
      await db.runAsync(
        "UPDATE meal_entries SET servings = ?, updated_at = ? WHERE id = ?",
        [quantity, nowIso(), entryId],
      );
      return;
    }
    const tree = await buildRecipeTree(entry.recipe_id);
    if (!tree) throw new Error("Il pasto della riga non esiste più");
    nutrients = scaleNutrients(recipePerServing(tree), quantity * 100);
    servings = quantity;
  } else {
    const previous = entry.quantity_g || FREE_ENTRY_BASE_QUANTITY;
    nutrients = scaleNutrients(
      entryNutrients(entry),
      (quantity / previous) * 100,
    );
    quantityG = quantity;
  }

  await db.runAsync(
    `UPDATE meal_entries SET
       quantity_g = ?, servings = ?,
       kcal = ?, protein = ?, carbs = ?, sugars = ?, fat = ?,
       saturated_fat = ?, fiber = ?, salt = ?, updated_at = ?
     WHERE id = ?`,
    [
      quantityG,
      servings,
      nutrients.kcal,
      nutrients.protein,
      nutrients.carbs,
      nutrients.sugars,
      nutrients.fat,
      nutrients.saturatedFat,
      nutrients.fiber,
      nutrients.salt,
      nowIso(),
      entryId,
    ],
  );
}

/** La composizione della voce, o null se non ne ha una. */
export async function getEntryComposition(
  entryId: string,
): Promise<EntryComposition | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ components: string | null }>(
    "SELECT components FROM meal_entries WHERE id = ? AND deleted_at IS NULL",
    [entryId],
  );
  return parseComposition(row?.components ?? null);
}

/**
 * Scrive la composizione e ricalcola la fotografia della voce.
 *
 * I due vanno insieme: i valori della voce sono la somma dei suoi ingredienti,
 * e scrivere l'una senza l'altra lascerebbe il diario a mostrare i totali
 * vecchi sotto ingredienti nuovi.
 */
export async function saveEntryComposition(
  entryId: string,
  composition: EntryComposition,
): Promise<void> {
  const nutrients = compositionNutrients(composition);
  const db = await getDb();
  await db.runAsync(
    `UPDATE meal_entries SET components = ?, kcal = ?, protein = ?, carbs = ?,
       sugars = ?, fat = ?, saturated_fat = ?, fiber = ?, salt = ?,
       updated_at = ? WHERE id = ?`,
    [
      serializeComposition(composition),
      nutrients.kcal,
      nutrients.protein,
      nutrients.carbs,
      nutrients.sugars,
      nutrients.fat,
      nutrients.saturatedFat,
      nutrients.fiber,
      nutrients.salt,
      nowIso(),
      entryId,
    ],
  );
}

/**
 * Costruisce la composizione di una voce che non ne ha, leggendola dalla sua
 * ricetta, e la scrive.
 *
 * Serve alle voci nate prima della migrazione 10. Torna null quando non e'
 * possibile - la voce non viene da una ricetta, o la ricetta non esiste piu' -
 * e non e' un errore da mostrare: e' il limite di un dato che non c'e'.
 */
export async function materializeComposition(
  entryId: string,
): Promise<EntryComposition | null> {
  const existing = await getEntryComposition(entryId);
  if (existing) return existing;

  const db = await getDb();
  const entry = await db.getFirstAsync<MealEntryRow>(
    "SELECT * FROM meal_entries WHERE id = ? AND deleted_at IS NULL",
    [entryId],
  );
  if (!entry?.recipe_id) return null;

  const tree = await buildRecipeTree(entry.recipe_id);
  if (!tree) return null;

  const composition: EntryComposition = {
    edited: false,
    items: flattenRecipe(tree, entry.servings ?? 1),
  };
  await saveEntryComposition(entryId, composition);
  return composition;
}

export async function deleteEntry(entryId: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE meal_entries SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, entryId],
  );
}

/**
 * Copia le righe di un giorno su un altro, conservando gli snapshot invece di
 * ricalcolarli: "a cena come ieri" deve dare esattamente i valori di ieri.
 */
export async function copyDay(
  fromDate: string,
  toDate: string,
): Promise<void> {
  const source = await getDayDiary(fromDate);
  if (source.meals.length === 0) return;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const { type, entries } of source.meals) {
      const mealId = await ensureMeal(toDate, type.id);
      for (const entry of entries) {
        await insertEntry({
          mealId,
          sourceKind: entry.source_kind,
          foodId: entry.food_id,
          recipeId: entry.recipe_id,
          label: entry.label,
          quantityG: entry.quantity_g,
          servings: entry.servings,
          nutrients: entryNutrients(entry),
          isEstimated: entry.is_estimated === 1,
          confidence: entry.confidence,
          note: entry.note,
          photoUri: entry.photo_uri,
          createdVia: entry.created_via,
        });
      }
    }
  });
}

/** Il consumo di un giorno, per il calendario. */
export interface DayKcal {
  date: string;
  kcal: number;
  /** I macro servono a colorare l'anello, non solo a riempirlo. */
  protein: number;
  carbs: number;
  fat: number;
  /** Quante righe ci sono. Zero righe non e' "zero calorie". */
  entries: number;
}

/**
 * Le calorie di ogni giorno di un intervallo, in una query sola.
 *
 * Serve al calendario, che mostra un mese per volta: chiamare `getDayDiary`
 * trentuno volte vorrebbe dire trentuno viaggi nel database per disegnare
 * trentuno cerchietti.
 *
 * I giorni senza niente NON compaiono nel risultato, e chi legge deve
 * distinguerli da un giorno a zero calorie: un giorno vuoto e' un giorno in
 * cui non si e' scritto, non un digiuno.
 */
export async function dailyKcalRange(
  from: string,
  to: string,
): Promise<DayKcal[]> {
  const db = await getDb();
  return db.getAllAsync<DayKcal>(
    `SELECT m.date AS date,
            COALESCE(SUM(e.kcal), 0) AS kcal,
            COALESCE(SUM(e.protein), 0) AS protein,
            COALESCE(SUM(e.carbs), 0) AS carbs,
            COALESCE(SUM(e.fat), 0) AS fat,
            COUNT(e.id) AS entries
       FROM meals m
       JOIN meal_entries e ON e.meal_id = m.id AND e.deleted_at IS NULL
      WHERE m.date >= ? AND m.date <= ?
        AND m.deleted_at IS NULL
      GROUP BY m.date
      ORDER BY m.date`,
    [from, to],
  );
}
