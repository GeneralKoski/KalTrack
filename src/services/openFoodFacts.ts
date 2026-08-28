import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";
import type { FoodInput } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";

const OFF_BASE_URL = "https://world.openfoodfacts.org/api/v2";

/**
 * Più corto del timeout AI: OpenFoodFacts è un passaggio intermedio della
 * cascata di risoluzione, se tarda conviene passare oltre invece di far
 * aspettare l'utente.
 */
const OFF_TIMEOUT_MS = 8_000;

/** OpenFoodFacts chiede un user agent identificabile per non essere rate-limitati. */
const OFF_USER_AGENT = "KalTrack/1.0 (Expo; uso personale)";

/** Chiedere solo i campi usati: le risposte complete di OFF sono enormi. */
const OFF_FIELDS =
  "code,product_name,product_name_it,brands,nutriments,serving_quantity,serving_quantity_unit";

/** 1 kcal = 4.184 kJ. */
const KJ_PER_KCAL = 4.184;

const MAX_SEARCH_LIMIT = 50;

/** OpenFoodFacts ha risposto male o non ha risposto. */
export class OpenFoodFactsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenFoodFactsError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * I nutrimenti di OFF arrivano a volte come stringhe, a volte negativi, a
 * volte assenti: qualsiasi cosa non sia un numero valido vale 0.
 */
function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Energia per 100 g in kcal. Una quota rilevante di prodotti europei dichiara
 * solo i kJ: convertirli invece di scartare il prodotto, altrimenti la cascata
 * scivola su una stima AI mentre il dato reale c'era.
 */
function energyKcal(nutriments: Record<string, unknown>): number {
  const kcal = toNumber(nutriments["energy-kcal_100g"]);
  if (kcal > 0) return kcal;

  const kj = toNumber(nutriments["energy-kj_100g"]);
  if (kj > 0) return round1(kj / KJ_PER_KCAL);

  const generic = toNumber(nutriments["energy_100g"]);
  if (generic <= 0) return 0;
  // energy_100g è in kJ salvo che il prodotto dichiari un'altra unità.
  return toText(nutriments["energy_unit"]).toLowerCase() === "kcal"
    ? generic
    : round1(generic / KJ_PER_KCAL);
}

/**
 * OFF esprime la porzione nell'unità del prodotto: per una bevanda sono
 * millilitri, non grammi. Copiarla alla cieca fa entrare in libreria una
 * lattina da 330 ml come un solido da 330 g.
 */
function toServing(product: Record<string, unknown>): {
  size: number | null;
  isLiquid: boolean;
} {
  const quantity = toNumber(product["serving_quantity"]);
  if (quantity <= 0) return { size: null, isLiquid: false };

  switch (toText(product["serving_quantity_unit"]).toLowerCase()) {
    case "":
    case "g":
      return { size: quantity, isLiquid: false };
    case "ml":
      return { size: quantity, isLiquid: true };
    case "cl":
      return { size: quantity * 10, isLiquid: true };
    case "l":
      return { size: quantity * 1000, isLiquid: true };
    default:
      // Unità che non sappiamo convertire (oz, "portion", "biscotto"): meglio
      // nessuna porzione che una porzione in un'unità sbagliata.
      return { size: null, isLiquid: false };
  }
}

function mapNutrients(nutriments: Record<string, unknown>): Nutrients {
  return {
    ...EMPTY_NUTRIENTS,
    kcal: energyKcal(nutriments),
    protein: toNumber(nutriments["proteins_100g"]),
    carbs: toNumber(nutriments["carbohydrates_100g"]),
    sugars: toNumber(nutriments["sugars_100g"]),
    fat: toNumber(nutriments["fat_100g"]),
    saturatedFat: toNumber(nutriments["saturated-fat_100g"]),
    fiber: toNumber(nutriments["fiber_100g"]),
    salt: toNumber(nutriments["salt_100g"]),
  };
}

/**
 * Traduce un prodotto OFF nel nostro FoodInput, oppure null se il dato non è
 * utilizzabile. Senza nome o senza kcal la riga non serve a niente: meglio
 * scartarla che salvare un alimento da 0 kcal che falserebbe il diario.
 */
function toFoodInput(product: Record<string, unknown>): FoodInput | null {
  const name =
    toText(product["product_name_it"]) || toText(product["product_name"]);
  if (name === "") return null;

  const nutrients = mapNutrients(asRecord(product["nutriments"]) ?? {});
  if (nutrients.kcal <= 0) return null;

  const brand = toText(product["brands"]).split(",")[0].trim();
  const code = toText(product["code"]);
  const serving = toServing(product);

  return {
    name,
    brand: brand === "" ? null : brand,
    source: "off",
    barcode: code === "" ? null : code,
    offId: code === "" ? null : code,
    nutrients,
    isLiquid: serving.isLiquid,
    defaultServingG: serving.size,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new OpenFoodFactsError(
        `OpenFoodFacts ha risposto ${response.status}`,
        response.status,
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof OpenFoodFactsError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new OpenFoodFactsError(
      `Richiesta a OpenFoodFacts fallita: ${message}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Prodotto singolo per codice a barre. null se il barcode non è in archivio. */
export async function searchByBarcode(
  barcode: string,
): Promise<FoodInput | null> {
  const code = barcode.trim();
  if (code === "") return null;

  const json = await fetchJson(
    `${OFF_BASE_URL}/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`,
  );
  const body = asRecord(json);
  const product = asRecord(body?.["product"]);
  if (!product) return null;

  const food = toFoodInput({ ...product, code });
  if (!food) logger.warn(`[off] prodotto ${code} scartato: dati incompleti`);
  return food;
}

/**
 * Ricerca testuale. I prodotti inutilizzabili (senza nome o senza kcal) sono
 * filtrati qui, quindi la lista può essere più corta di `limit`.
 */
export async function searchByName(
  term: string,
  limit = 10,
): Promise<FoodInput[]> {
  const query = term.trim();
  if (query === "") return [];

  const pageSize = Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT);
  const json = await fetchJson(
    `${OFF_BASE_URL}/search?search_terms=${encodeURIComponent(query)}` +
      `&fields=${OFF_FIELDS}&page_size=${pageSize}`,
  );
  const products = asRecord(json)?.["products"];
  if (!Array.isArray(products)) return [];

  const foods: FoodInput[] = [];
  let discarded = 0;
  for (const raw of products) {
    const product = asRecord(raw);
    if (!product) continue;
    const food = toFoodInput(product);
    if (food) foods.push(food);
    else discarded++;
  }
  // Uno scarto silenzioso fa sembrare "assente su OFF" un prodotto che c'era
  // ma senza dati usabili: la differenza conta quando si degrada alla stima AI.
  if (discarded > 0) {
    logger.warn(
      `[off] "${query}": ${discarded} prodotti scartati, dati incompleti`,
    );
  }
  return foods;
}
