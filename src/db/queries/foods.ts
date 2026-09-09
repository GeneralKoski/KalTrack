import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import type { Nutrients } from "@/src/domain/nutrition";
import { normalizeText } from "@/src/domain/text";
import type { FoodInput, FoodRow } from "@/src/types/nutrition";

const SELECT_FOOD = `
  SELECT * FROM foods
  WHERE deleted_at IS NULL
`;

const ORDER = "ORDER BY is_favorite DESC, usage_count DESC, name ASC LIMIT ?";

/**
 * Ricerca per sottostringa sul nome normalizzato (accenti e maiuscole ignorati)
 * o sul marchio grezzo: scrivere "milbona" deve trovare tutti i prodotti di
 * quel marchio, non solo un alimento che si chiama cosi'. `LIKE` di SQLite e'
 * gia' case-insensitive su ASCII, quindi non serve un `brand_norm` - solo gli
 * accenti nel marchio non si troverebbero, e i marchi che contano (Milbona,
 * Barilla, Coop...) sono ASCII. Le due condizioni stanno fra parentesi: senza,
 * `deleted_at IS NULL AND name_norm LIKE ? OR brand LIKE ?` per precedenza
 * ritornerebbe anche i cancellati che portano quel marchio.
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
    `${SELECT_FOOD} AND (name_norm LIKE ? OR brand LIKE ?) ${ORDER}`,
    [`%${normalized}%`, `%${term.trim()}%`, limit],
  );
}

/**
 * Come `searchFoods`, ma esclude i seed: la libreria diventa "quelli che ho
 * aggiunto io" (creati a mano, importati dall'archivio o stimati dall'AI),
 * non i predefiniti dell'app. `searchFoods` resta cosi' com'e' perche' la
 * usano anche l'assistente e la generazione del piano, che sui seed devono
 * poter contare.
 */
export async function searchMyFoods(
  term: string,
  limit = 50,
): Promise<FoodRow[]> {
  const db = await getDb();
  const normalized = normalizeText(term);

  if (normalized === "") {
    return db.getAllAsync<FoodRow>(
      `${SELECT_FOOD} AND source != 'seed' ${ORDER}`,
      [limit],
    );
  }
  return db.getAllAsync<FoodRow>(
    `${SELECT_FOOD} AND source != 'seed' AND (name_norm LIKE ? OR brand LIKE ?) ${ORDER}`,
    [`%${normalized}%`, `%${term.trim()}%`, limit],
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
       is_liquid, default_serving_g, serving_label, image_uri, catalog_uid,
       is_favorite, usage_count, is_estimated, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
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
      input.catalogUid ?? null,
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

  /*
   * `barcode` e `off_id` NON si toccano.
   *
   * Sono l'identita' dell'alimento, non il suo contenuto: nessuna schermata ha
   * un campo per modificarli, e solo `createFood` li assegna. Riscriverli da
   * `input` voleva dire che `FoodFormScreen` - che non li passa, non avendo un
   * campo - li azzerava a ogni salvataggio: aprire un prodotto arrivato da
   * OpenFoodFacts, correggere una virgola e salvare gli portava via il codice
   * a barre. Da li' in poi `getFoodByBarcode` non lo trovava piu', la
   * deduplica di `resolveFood` smetteva di funzionare per quel prodotto e una
   * scansione dello stesso codice ne creava un doppione. Senza un errore e
   * senza un segno a schermo.
   */
  await db.runAsync(
    `UPDATE foods SET
       name = ?, name_norm = ?, brand = ?,
       kcal = ?, protein = ?, carbs = ?, sugars = ?, fat = ?,
       saturated_fat = ?, fiber = ?, salt = ?,
       is_liquid = ?, default_serving_g = ?, serving_label = ?, image_uri = ?,
       is_estimated = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      normalizeText(input.name),
      input.brand ?? null,
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

/** I campi che il catalogo possiede. Nota chi NON c'e': `barcode` e `off_id`. */
export interface CatalogFoodFields {
  name: string;
  brand: string | null;
  nutrients: Nutrients;
  isLiquid: boolean;
  defaultServingG: number | null;
  servingLabel: string | null;
  imageUri: string | null;
}

/** La riga che porta questo uid di catalogo, cancellate escluse. */
export async function findFoodByCatalogUid(
  uid: string,
): Promise<FoodRow | null> {
  const db = await getDb();
  return db.getFirstAsync<FoodRow>(`${SELECT_FOOD} AND catalog_uid = ?`, [uid]);
}

/** Come `setExerciseCatalogUid`, e per la stessa ragione: `updated_at` fermo. */
export async function setFoodCatalogUid(
  id: string,
  uid: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE foods SET catalog_uid = ? WHERE id = ?", [uid, id]);
}

/**
 * Riallinea un alimento di catalogo ai valori del server.
 *
 * `barcode`, `off_id`, `is_favorite`, `usage_count` e `source` NON ci sono.
 * I primi due sono identita' e non contenuto - e' la stessa regola per cui
 * `updateFood` non li tocca; gli altri due sono stato d'uso di questo
 * telefono; `source` e' il marcatore che dice di chi e' la riga, e
 * riscriverlo qui sarebbe l'unico modo di riportare sotto il catalogo un
 * alimento che l'utente si e' preso.
 */
export async function applyCatalogFood(
  id: string,
  uid: string,
  fields: CatalogFoodFields,
): Promise<void> {
  const db = await getDb();
  const n = fields.nutrients;
  await db.runAsync(
    `UPDATE foods SET
       name = ?, name_norm = ?, brand = ?,
       kcal = ?, protein = ?, carbs = ?, sugars = ?, fat = ?,
       saturated_fat = ?, fiber = ?, salt = ?,
       is_liquid = ?, default_serving_g = ?, serving_label = ?, image_uri = ?,
       catalog_uid = ?, updated_at = ?
     WHERE id = ?`,
    [
      fields.name,
      normalizeText(fields.name),
      fields.brand,
      n.kcal,
      n.protein,
      n.carbs,
      n.sugars,
      n.fat,
      n.saturatedFat,
      n.fiber,
      n.salt,
      fields.isLiquid ? 1 : 0,
      fields.defaultServingG,
      fields.servingLabel,
      fields.imageUri,
      uid,
      nowIso(),
      id,
    ],
  );
}

/** Come `detachExerciseFromCatalog`: la riga resta, e l'uid con lei. */
export async function detachFoodFromCatalog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE foods SET source = 'user', updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}
