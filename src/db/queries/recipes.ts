import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import type { RecipeItemNode, RecipeNode } from "@/src/domain/nutrition";
import { normalizeText } from "@/src/domain/text";
import {
  foodNutrients,
  type FoodRow,
  type RecipeInput,
  type RecipeItemRow,
  type RecipeRow,
} from "@/src/types/nutrition";

/** Profondità massima di annidamento delle ricette. */
export const MAX_RECIPE_DEPTH = 3;

export class RecipeCycleError extends Error {
  constructor(message = "La ricetta non può contenere se stessa") {
    super(message);
    this.name = "RecipeCycleError";
  }
}

export class RecipeDepthError extends Error {
  constructor(message = "Annidamento delle ricette troppo profondo") {
    super(message);
    this.name = "RecipeDepthError";
  }
}

const SELECT_RECIPE = "SELECT * FROM recipes WHERE deleted_at IS NULL";
const ORDER = "ORDER BY is_favorite DESC, usage_count DESC, name ASC LIMIT ?";

export async function searchRecipes(
  term: string,
  limit = 50,
): Promise<RecipeRow[]> {
  const db = await getDb();
  const normalized = normalizeText(term);
  if (normalized === "") {
    return db.getAllAsync<RecipeRow>(`${SELECT_RECIPE} ${ORDER}`, [limit]);
  }
  return db.getAllAsync<RecipeRow>(
    `${SELECT_RECIPE} AND name_norm LIKE ? ${ORDER}`,
    [`%${normalized}%`, limit],
  );
}

export async function getRecipe(id: string): Promise<RecipeRow | null> {
  const db = await getDb();
  return db.getFirstAsync<RecipeRow>(`${SELECT_RECIPE} AND id = ?`, [id]);
}

export async function getRecipeItems(
  recipeId: string,
): Promise<RecipeItemRow[]> {
  const db = await getDb();
  return db.getAllAsync<RecipeItemRow>(
    "SELECT * FROM recipe_items WHERE recipe_id = ? AND deleted_at IS NULL ORDER BY sort ASC",
    [recipeId],
  );
}

/**
 * Costruisce l'albero nutrizionale della ricetta risolvendo gli annidamenti.
 *
 * Gli ingredienti il cui alimento (o ricetta figlia) è stato cancellato vengono
 * saltati invece di far fallire tutto: cancellare un alimento non deve rendere
 * irrecuperabili le ricette che lo usavano.
 */
export async function buildRecipeTree(
  recipeId: string,
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<RecipeNode | null> {
  if (depth >= MAX_RECIPE_DEPTH) throw new RecipeDepthError();
  if (visited.has(recipeId)) throw new RecipeCycleError();

  const recipe = await getRecipe(recipeId);
  if (!recipe) return null;

  const db = await getDb();
  const nextVisited = new Set(visited).add(recipeId);
  const rows = await getRecipeItems(recipeId);
  const items: RecipeItemNode[] = [];

  for (const row of rows) {
    if (row.food_id) {
      const food = await db.getFirstAsync<FoodRow>(
        "SELECT * FROM foods WHERE id = ? AND deleted_at IS NULL",
        [row.food_id],
      );
      if (!food) continue;
      items.push({
        kind: "food",
        foodId: food.id,
        label: food.name,
        per100: foodNutrients(food),
        grams: row.quantity_g ?? 0,
      });
    } else if (row.child_recipe_id) {
      const child = await buildRecipeTree(
        row.child_recipe_id,
        nextVisited,
        depth + 1,
      );
      if (!child) continue;
      items.push({ kind: "recipe", child, servings: row.servings ?? 0 });
    }
  }

  return { servings: recipe.servings, items };
}

/**
 * Verifica che questi figli non creino un ciclo né sforino la profondità.
 * Va chiamata PRIMA di scrivere: una ricetta rifiutata deve restare intatta.
 */
async function assertValidNesting(
  recipeId: string | null,
  items: RecipeInput["items"],
): Promise<void> {
  for (const item of items) {
    if (!("childRecipeId" in item)) continue;
    if (item.childRecipeId === recipeId) throw new RecipeCycleError();
    const visited = recipeId ? new Set([recipeId]) : new Set<string>();
    await buildRecipeTree(item.childRecipeId, visited, 1);
  }
}

export async function createRecipe(input: RecipeInput): Promise<string> {
  await assertValidNesting(null, input.items);
  const db = await getDb();
  const id = newId();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO recipes (id, name, name_norm, photo_uri, servings, notes,
         is_favorite, usage_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [
        id,
        input.name,
        normalizeText(input.name),
        input.photoUri ?? null,
        input.servings,
        input.notes ?? null,
        now,
        now,
      ],
    );
    await insertItems(db, id, input.items, now);
  });
  return id;
}

export async function updateRecipe(
  id: string,
  input: RecipeInput,
): Promise<void> {
  await assertValidNesting(id, input.items);
  const db = await getDb();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE recipes SET name = ?, name_norm = ?, photo_uri = ?, servings = ?,
         notes = ?, updated_at = ? WHERE id = ?`,
      [
        input.name,
        normalizeText(input.name),
        input.photoUri ?? null,
        input.servings,
        input.notes ?? null,
        now,
        id,
      ],
    );
    /*
     * Gli ingredienti si riscrivono per intero: sono un dettaglio interno alla
     * ricetta, niente li referenzia dall'esterno.
     *
     * Cancellazione LOGICA e non fisica, pero'. Togliendoli davvero, la
     * sincronizzazione non avrebbe piu' modo di dire all'altro dispositivo che
     * quelle righe non ci sono piu': gli arriverebbero solo i nuovi
     * ingredienti, con id nuovi, e la ricetta si ritroverebbe con i vecchi E i
     * nuovi. Ogni modifica ne aggiungerebbe una copia.
     */
    await db.runAsync(
      `UPDATE recipe_items SET deleted_at = ?, updated_at = ?
       WHERE recipe_id = ? AND deleted_at IS NULL`,
      [now, now, id],
    );
    await insertItems(db, id, input.items, now);
  });
}

async function insertItems(
  db: Awaited<ReturnType<typeof getDb>>,
  recipeId: string,
  items: RecipeInput["items"],
  now: string,
): Promise<void> {
  let sort = 0;
  for (const item of items) {
    const isFood = "foodId" in item;
    await db.runAsync(
      `INSERT INTO recipe_items (id, recipe_id, food_id, child_recipe_id,
         quantity_g, servings, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        recipeId,
        isFood ? item.foodId : null,
        isFood ? null : item.childRecipeId,
        isFood ? item.quantityG : null,
        isFood ? null : item.servings,
        sort++,
        now,
        now,
      ],
    );
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE recipes SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function toggleRecipeFavorite(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE recipes SET is_favorite = 1 - is_favorite, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}

export async function incrementRecipeUsage(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE recipes SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}
