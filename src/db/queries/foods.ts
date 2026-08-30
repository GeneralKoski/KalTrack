import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import { normalizeText } from "@/src/domain/text";
import type { FoodInput, FoodRow } from "@/src/types/nutrition";

const SELECT_FOOD = `
  SELECT * FROM foods
  WHERE deleted_at IS NULL
`;

const ORDER = "ORDER BY is_favorite DESC, usage_count DESC, name ASC LIMIT ?";

/**
 * Ricerca per sottostringa sul nome normalizzato (accenti e maiuscole ignorati).
 * Termine vuoto = tutti. Ordine: preferiti, poi più usati, poi alfabetico, così
 * gli alimenti che si mangiano davvero salgono in cima senza scorrere.
 */
export async function searchFoods(
  term: string,
  limit = 50,
): Promise<FoodRow[]> {
  const db = await getDb();
  const normalized = normalizeText(term);

  if (normalized === "") {
    return db.getAllAsync<FoodRow>(`${SELECT_FOOD} ${ORDER}`, [limit]);
  }
  return db.getAllAsync<FoodRow>(
    `${SELECT_FOOD} AND name_norm LIKE ? ${ORDER}`,
    [`%${normalized}%`, limit],
  );
}

export async function getFood(id: string): Promise<FoodRow | null> {
  const db = await getDb();
  return db.getFirstAsync<FoodRow>(`${SELECT_FOOD} AND id = ?`, [id]);
}

export async function getFoodByBarcode(
  barcode: string,
): Promise<FoodRow | null> {
  const db = await getDb();
  return db.getFirstAsync<FoodRow>(`${SELECT_FOOD} AND barcode = ?`, [barcode]);
}

export async function createFood(input: FoodInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  const n = input.nutrients;

  await db.runAsync(
    `INSERT INTO foods (
       id, name, name_norm, brand, source, barcode, off_id,
       kcal, protein, carbs, sugars, fat, saturated_fat, fiber, salt,
       is_liquid, default_serving_g, serving_label, image_uri,
       is_favorite, usage_count, is_estimated, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
    [
      id,
      input.name,
      normalizeText(input.name),
      input.brand ?? null,
      input.source ?? "user",
      input.barcode ?? null,
      input.offId ?? null,
      n.kcal,
      n.protein,
      n.carbs,
      n.sugars,
      n.fat,
      n.saturatedFat,
      n.fiber,
      n.salt,
      input.isLiquid ? 1 : 0,
      input.defaultServingG ?? null,
      input.servingLabel ?? null,
      input.imageUri ?? null,
      input.isEstimated ? 1 : 0,
      now,
      now,
    ],
  );
  return id;
}

/**
 * Aggiorna i dati dell'alimento. Preferito e conteggio utilizzi restano fuori:
 * sono stato d'uso, non contenuto della scheda, e hanno le loro funzioni.
 */
export async function updateFood(id: string, input: FoodInput): Promise<void> {
  const db = await getDb();
  const n = input.nutrients;

  await db.runAsync(
    `UPDATE foods SET
       name = ?, name_norm = ?, brand = ?, barcode = ?, off_id = ?,
       kcal = ?, protein = ?, carbs = ?, sugars = ?, fat = ?,
       saturated_fat = ?, fiber = ?, salt = ?,
       is_liquid = ?, default_serving_g = ?, serving_label = ?, image_uri = ?,
       is_estimated = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      normalizeText(input.name),
      input.brand ?? null,
      input.barcode ?? null,
      input.offId ?? null,
      n.kcal,
      n.protein,
      n.carbs,
      n.sugars,
      n.fat,
      n.saturatedFat,
      n.fiber,
      n.salt,
      input.isLiquid ? 1 : 0,
      input.defaultServingG ?? null,
      input.servingLabel ?? null,
      input.imageUri ?? null,
      input.isEstimated ? 1 : 0,
      nowIso(),
      id,
    ],
  );
}

/**
 * Cancellazione logica: le meal_entries storiche continuano a referenziare la
 * riga, e il loro snapshot dei macro resta comunque intatto.
 */
export async function deleteFood(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE foods SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function toggleFoodFavorite(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE foods SET is_favorite = 1 - is_favorite, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}

export async function incrementFoodUsage(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE foods SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}

/** Un alimento esistente con lo stesso nome, a meno di maiuscole e accenti. */
export async function findFoodByName(name: string): Promise<FoodRow | null> {
  const db = await getDb();
  return db.getFirstAsync<FoodRow>(`${SELECT_FOOD} AND name_norm = ?`, [
    normalizeText(name),
  ]);
}
