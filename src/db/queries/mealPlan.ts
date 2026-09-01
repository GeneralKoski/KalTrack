import { newId, nowIso } from "@/src/db/ids";
import { getDb } from "@/src/db/index";
import { addFoodEntry, addRecipeEntry } from "@/src/db/queries/diary";
import { getFood } from "@/src/db/queries/foods";
import {
  MAX_RECIPE_DEPTH,
  buildRecipeTree,
  getRecipe,
  getRecipeItems,
} from "@/src/db/queries/recipes";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { addDays } from "@/src/domain/date";
import { recipePerServing } from "@/src/domain/nutrition";
import {
  buildShoppingList,
  type ShoppingItem,
} from "@/src/domain/shoppingList";

/**
 * Riga di meal_plan_entries. Il piano dice cosa si ha INTENZIONE di mangiare:
 * non porta lo snapshot dei macro come il diario, perché finché non lo si
 * mangia non c'è niente da congelare.
 */
export interface PlanEntryRow {
  id: string;
  date: string;
  meal_type_id: string;
  recipe_id: string | null;
  food_id: string | null;
  label: string | null;
  quantity_g: number | null;
  servings: number | null;
  sort: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Riga del piano risolta per la UI: nome leggibile e calorie previste. */
export interface PlanEntry {
  row: PlanEntryRow;
  name: string;
  /**
   * Null per le voci col solo nome: di un "pranzo fuori" non si sanno le
   * calorie, e scriverci zero falserebbe il totale del giorno.
   */
  kcal: number | null;
}

export interface ApplyPlanResult {
  created: number;
  /** Voci col solo nome: senza macro il diario non le può accogliere. */
  skipped: number;
  /** Il giorno era già stato trasferito: non si è scritto niente. */
  alreadyApplied: boolean;
}

/**
 * Il trasferimento piano → diario è segnato qui, un flag per giorno.
 *
 * Sta nelle impostazioni e non su meal_plan_entries di proposito: applicare un
 * giorno NON consuma il piano (resta lì da confrontare con quello che si è
 * mangiato davvero), quindi il fatto "questo giorno è già stato trasferito"
 * riguarda il giorno, non le sue righe, e sopravvive a righe aggiunte dopo.
 */
const APPLIED_PREFIX = "plan_applied:";

const SELECT_PLAN = `
  SELECT p.* FROM meal_plan_entries p
  JOIN meal_types mt ON mt.id = p.meal_type_id
  WHERE p.deleted_at IS NULL
`;

// ─── Lettura ─────────────────────────────────────────────────────────────────

/** Righe di piano dell'intervallo, in ordine di giorno, pasto e inserimento. */
export async function listPlan(
  fromDate: string,
  toDate: string,
): Promise<PlanEntryRow[]> {
  const db = await getDb();
  return db.getAllAsync<PlanEntryRow>(
    `${SELECT_PLAN} AND p.date >= ? AND p.date <= ?
     ORDER BY p.date ASC, mt.sort ASC, p.sort ASC`,
    [fromDate, toDate],
  );
}

/**
 * Come listPlan, ma con nome e calorie già risolti: alimenti e ricette si
 * leggono una volta sola anche se ricorrono in tutta la settimana.
 */
export async function listPlanEntries(
  fromDate: string,
  toDate: string,
): Promise<PlanEntry[]> {
  const rows = await listPlan(fromDate, toDate);
  const foods = new Map<string, { name: string; kcal100: number } | null>();
  const recipes = new Map<
    string,
    { name: string; kcalPerServing: number } | null
  >();
  const result: PlanEntry[] = [];

  for (const row of rows) {
    if (row.food_id) {
      if (!foods.has(row.food_id)) {
        const food = await getFood(row.food_id);
        foods.set(
          row.food_id,
          food ? { name: food.name, kcal100: food.kcal } : null,
        );
      }
      const food = foods.get(row.food_id) ?? null;
      if (!food) continue; // alimento cancellato: la voce non è più mostrabile
      result.push({
        row,
        name: food.name,
        kcal: (food.kcal100 * (row.quantity_g ?? 0)) / 100,
      });
    } else if (row.recipe_id) {
      if (!recipes.has(row.recipe_id)) {
        const [recipe, tree] = await Promise.all([
          getRecipe(row.recipe_id),
          buildRecipeTree(row.recipe_id),
        ]);
        recipes.set(
          row.recipe_id,
          recipe && tree
            ? { name: recipe.name, kcalPerServing: recipePerServing(tree).kcal }
            : null,
        );
      }
      const recipe = recipes.get(row.recipe_id) ?? null;
      if (!recipe) continue;
      result.push({
        row,
        name: recipe.name,
        kcal: recipe.kcalPerServing * (row.servings ?? 0),
      });
    } else {
      result.push({ row, name: row.label ?? "", kcal: null });
    }
  }

  return result;
}

// ─── Scrittura ───────────────────────────────────────────────────────────────

export interface AddPlanEntryArgs {
  date: string;
  mealTypeId: string;
  recipeId?: string | null;
  foodId?: string | null;
  label?: string | null;
  quantityG?: number | null;
  servings?: number | null;
}

export async function addPlanEntry(args: AddPlanEntryArgs): Promise<string> {
  if (!args.recipeId && !args.foodId && !args.label) {
    throw new Error(
      "Una voce di piano ha bisogno di una ricetta, un alimento o un nome",
    );
  }

  const db = await getDb();
  const id = newId();
  const now = nowIso();
  const sortRow = await db.getFirstAsync<{ maxSort: number | null }>(
    `SELECT MAX(sort) AS maxSort FROM meal_plan_entries
     WHERE date = ? AND meal_type_id = ? AND deleted_at IS NULL`,
    [args.date, args.mealTypeId],
  );

  await db.runAsync(
    `INSERT INTO meal_plan_entries (
       id, date, meal_type_id, recipe_id, food_id, label,
       quantity_g, servings, sort, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      args.date,
      args.mealTypeId,
      args.recipeId ?? null,
      args.foodId ?? null,
      args.label ?? null,
      args.quantityG ?? null,
      args.servings ?? null,
      (sortRow?.maxSort ?? -1) + 1,
      now,
      now,
    ],
  );
  return id;
}

export async function deletePlanEntry(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE meal_plan_entries SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

/**
 * Copia un insieme di giornate a partire da `targetStartDate`.
 *
 * Le giornate di destinazione vengono prima svuotate per evitare duplicati.
 */
export async function copyPlanDays(
  sourceDates: string[],
  targetStartDate: string,
): Promise<number> {
  if (sourceDates.length === 0) return 0;
  const sorted = [...sourceDates].sort();
  const db = await getDb();
  const now = nowIso();
  let totalCopied = 0;

  await db.withTransactionAsync(async () => {
    for (let i = 0; i < sorted.length; i++) {
      const sourceDate = sorted[i];
      const destDate = addDays(targetStartDate, i);
      const rows = await listPlan(sourceDate, sourceDate);

      await db.runAsync(
        `UPDATE meal_plan_entries SET deleted_at = ?, updated_at = ?
         WHERE date = ? AND deleted_at IS NULL`,
        [now, now, destDate],
      );

      for (const row of rows) {
        await db.runAsync(
          `INSERT INTO meal_plan_entries (
             id, date, meal_type_id, recipe_id, food_id, label,
             quantity_g, servings, sort, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            destDate,
            row.meal_type_id,
            row.recipe_id,
            row.food_id,
            row.label,
            row.quantity_g,
            row.servings,
            row.sort,
            now,
            now,
          ],
        );
        totalCopied += 1;
      }
    }
  });

  return totalCopied;
}

/**
 * Ricopia sette giorni a partire da `fromDate` sui sette a partire da `toDate`.
 */
export async function copyPlanWeek(
  fromDate: string,
  toDate: string,
): Promise<number> {
  const days = Array.from({ length: 7 }, (_, i) => addDays(fromDate, i));
  return copyPlanDays(days, toDate);
}

const MS_PER_DAY = 86_400_000;

/**
 * Giorni di distanza tra due date ISO. Il conto passa da Date.UTC perché il
 * fuso locale, col cambio dell'ora, farebbe durare una giornata 23 o 25 ore e
 * l'arrotondamento sposterebbe una riga di un giorno.
 */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY,
  );
}

// ─── Lista della spesa ───────────────────────────────────────────────────────

/**
 * Lista della spesa dell'intervallo: le ricette del piano diventano i loro
 * ingredienti, e lo stesso ingrediente si somma una volta sola.
 *
 * È il senso della funzione: al supermercato non si compra "lasagne", si
 * comprano la besciamella e la carne che servono a farle.
 *
 * Le voci col solo nome restano fuori: di un "pranzo fuori" non c'è niente da
 * comprare.
 */
export async function planToShoppingList(
  fromDate: string,
  toDate: string,
): Promise<ShoppingItem[]> {
  const rows = await listPlan(fromDate, toDate);
  const items: ShoppingItem[] = [];

  for (const row of rows) {
    if (row.food_id) {
      const food = await getFood(row.food_id);
      if (!food) continue;
      items.push({
        foodId: food.id,
        name: food.name,
        grams: row.quantity_g ?? 0,
      });
    } else if (row.recipe_id) {
      items.push(...(await expandRecipe(row.recipe_id, row.servings ?? 0)));
    }
  }

  return buildShoppingList(items);
}

/**
 * Ingredienti di una ricetta scalati alle porzioni richieste, scendendo nelle
 * ricette annidate.
 *
 * Gli ingredienti stanno nella ricetta INTERA: per una porzione sola vanno
 * divisi per le porzioni che la ricetta rende.
 */
async function expandRecipe(
  recipeId: string,
  servings: number,
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<ShoppingItem[]> {
  // Cicli e annidamenti troppo profondi sono già impediti in scrittura: qui
  // ci si ferma e basta, perché una ricetta malata non deve far fallire tutta
  // la spesa della settimana.
  if (depth >= MAX_RECIPE_DEPTH || visited.has(recipeId)) return [];
  if (servings <= 0) return [];

  const recipe = await getRecipe(recipeId);
  if (!recipe) return [];

  const factor = servings / (recipe.servings > 0 ? recipe.servings : 1);
  const nextVisited = new Set(visited).add(recipeId);
  const rows = await getRecipeItems(recipeId);
  const items: ShoppingItem[] = [];

  for (const row of rows) {
    if (row.food_id) {
      const food = await getFood(row.food_id);
      if (!food) continue;
      items.push({
        foodId: food.id,
        name: food.name,
        grams: (row.quantity_g ?? 0) * factor,
      });
    } else if (row.child_recipe_id) {
      items.push(
        ...(await expandRecipe(
          row.child_recipe_id,
          (row.servings ?? 0) * factor,
          nextVisited,
          depth + 1,
        )),
      );
    }
  }

  return items;
}

// ─── Dal piano al diario ─────────────────────────────────────────────────────

export async function isPlanApplied(date: string): Promise<boolean> {
  return (await getSetting(`${APPLIED_PREFIX}${date}`)) !== null;
}

/**
 * Trasforma il piano di un giorno in voci di diario vere.
 *
 * È un atto esplicito e non automatico: il piano dice cosa si aveva intenzione
 * di mangiare, il diario cosa si è mangiato davvero. Tenerli separati è l'unico
 * modo per sapere, poi, se il piano è stato seguito.
 *
 * Il piano NON viene svuotato, così il confronto resta possibile. Contro il
 * doppio trasferimento c'è un flag per giorno: chiamarla due volte sullo stesso
 * giorno non scrive niente la seconda volta.
 */
export async function applyPlanToDiary(
  planDate: string,
  targetDate: string = planDate,
): Promise<ApplyPlanResult> {
  if (planDate === targetDate && (await isPlanApplied(planDate))) {
    return { created: 0, skipped: 0, alreadyApplied: true };
  }

  const rows = await listPlan(planDate, planDate);
  const db = await getDb();
  let created = 0;
  let skipped = 0;

  // Tutto in transazione col flag: un trasferimento interrotto a metà
  // lascerebbe il giorno senza flag e col diario già parzialmente scritto, e
  // il tentativo successivo raddoppierebbe le righe.
  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const grams = row.quantity_g ?? 0;
      const servings = row.servings ?? 0;

      if (row.food_id && grams > 0) {
        await addFoodEntry({
          date: targetDate,
          mealTypeId: row.meal_type_id,
          foodId: row.food_id,
          quantityG: grams,
        });
        created += 1;
      } else if (row.recipe_id && servings > 0) {
        await addRecipeEntry({
          date: targetDate,
          mealTypeId: row.meal_type_id,
          recipeId: row.recipe_id,
          servings,
        });
        created += 1;
      } else {
        // Voce col solo nome: senza macro non è una riga di diario. Meglio
        // lasciarla fuori che inventarle uno zero.
        skipped += 1;
      }
    }

    if (planDate === targetDate) {
      await setSetting(`${APPLIED_PREFIX}${planDate}`, nowIso());
    }
  });

  return { created, skipped, alreadyApplied: false };
}
