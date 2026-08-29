import type { ToolDefinition } from "@/src/ai/client";
import { AiResponseError } from "@/src/ai/errors";
import {
  resolveFoodItems,
  type ResolveFoodInput,
  type ResolvedItem,
} from "@/src/ai/resolveFood";
import { defineTool, type RegisteredTool } from "@/src/ai/tools/types";
import {
  addFoodEntry,
  addFreeEntry,
  addRecipeEntry,
  deleteEntry,
  getDayDiary,
  listMealTypes,
} from "@/src/db/queries/diary";
import { getFood } from "@/src/db/queries/foods";
import { buildRecipeTree, getRecipe } from "@/src/db/queries/recipes";
import { getTargetsFor, saveTargets } from "@/src/db/queries/settings";
import { getSteps, setSteps, setWeight } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import {
  recipePerServing,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
} from "@/src/domain/nutrition";
import {
  foodNutrients,
  type FoodRow,
  type MealEntryRow,
  type RecipeRow,
} from "@/src/types/nutrition";
import type { NavParams } from "@/src/hooks/useAppNav";

/**
 * Giorno a cui si riferiscono i tool quando il modello NON passa una data.
 *
 * È il giorno che l'utente sta guardando, non quello del dispositivo: se sfoglia
 * ieri e dice "aggiungi 8000 passi", la voce deve finire su ieri. Le description
 * promettono al modello esattamente questo, quindi il registro deve riceverlo:
 * chiamare todayIso() qui dentro faceva mentire i tool.
 */
export interface ToolContext {
  referenceDate: string;
  /**
   * Memoria delle risoluzioni della singola interazione. Creata da
   * `createTools`, muore con essa.
   */
  resolutionCache: Map<string, Promise<ResolvedItem>>;
}

const defaultToolContext = (): ToolContext => ({
  referenceDate: todayIso(),
  resolutionCache: new Map(),
});

type ToolFactory = (context: ToolContext) => RegisteredTool;

// ─── Validazione degli argomenti ─────────────────────────────────────────────
//
// Il JSON Schema orienta il modello ma non vincola niente: quello che arriva è
// JSON arbitrario, quindi ogni tool restringe i propri argomenti a mano.

function fail(message: string): never {
  throw new AiResponseError(message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function asRecord(raw: unknown, what = "Argomenti"): Record<string, unknown> {
  if (!isRecord(raw)) fail(`${what} non validi`);
  return raw;
}

function optString(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = source[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") fail(`"${key}" deve essere una stringa`);
  return value;
}

function reqString(source: Record<string, unknown>, key: string): string {
  const value = optString(source, key);
  if (value === undefined) fail(`"${key}" mancante`);
  return value;
}

function optNumber(
  source: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = source[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`"${key}" deve essere un numero`);
  }
  return value;
}

function reqNumber(source: Record<string, unknown>, key: string): number {
  const value = optNumber(source, key);
  if (value === undefined) fail(`"${key}" mancante`);
  return value;
}

function optPositive(
  source: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = optNumber(source, key);
  if (value === undefined) return undefined;
  if (value <= 0) fail(`"${key}" deve essere maggiore di zero`);
  return value;
}

function reqPositive(source: Record<string, unknown>, key: string): number {
  const value = reqNumber(source, key);
  if (value <= 0) fail(`"${key}" deve essere maggiore di zero`);
  return value;
}

function reqArray(source: Record<string, unknown>, key: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value) || value.length === 0) {
    fail(`"${key}" deve essere un elenco non vuoto`);
  }
  return value;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function optDate(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = optString(source, key);
  if (value === undefined) return undefined;
  if (!ISO_DATE.test(value)) fail(`"${key}" deve essere in formato YYYY-MM-DD`);
  return value;
}

/**
 * Data dell'operazione: senza `date` vale il giorno di riferimento del contesto.
 * Non todayIso(): vedi ToolContext.
 */
const dateOrReference = (
  source: Record<string, unknown>,
  context: ToolContext,
  key = "date",
): string => optDate(source, key) ?? context.referenceDate;

// ─── Formattazione italiana ──────────────────────────────────────────────────

/** Data compatta per le anteprime: la ISO completa è rumore da leggere. */
const shortDate = (iso: string): string =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const num = (value: number): string =>
  (Math.round(value * 10) / 10).toString().replace(".", ",");

const int = (value: number): string => String(Math.round(value));

const plural = (count: number, one: string, many: string): string =>
  count === 1 ? one : many;

// ─── log_steps ───────────────────────────────────────────────────────────────

interface StepDay {
  date: string;
  steps: number;
}

const logSteps: ToolFactory = (context) =>
  defineTool<{ days: StepDay[] }>({
    name: "log_steps",
    riskLevel: "write",
    description:
      "Save the daily step count for one or more days. The user often lists " +
      "several days in a single sentence (\"lunedì 8000, martedì 12000\"): return " +
      "one item per day, never merge them. Dates MUST be in YYYY-MM-DD format: " +
      "resolve \"oggi\", \"ieri\" and weekday names against the current date given " +
      "in the context. Omit the date only when the user names no day at all: it " +
      "then means the reference day of the context. Saving a day again replaces " +
      "its value instead of adding to it.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "array",
          description: "One entry per day mentioned by the user.",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "Day in YYYY-MM-DD format." },
              steps: { type: "integer", description: "Steps walked that day." },
            },
            required: ["date", "steps"],
          },
        },
      },
      required: ["days"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const days = reqArray(root, "days").map((item) => {
        const day = asRecord(item, "Giorno");
        const steps = reqNumber(day, "steps");
        if (steps < 0) fail("I passi non possono essere negativi");
        // Lo schema dichiara integer ma non lo impone: 8000.7 verrebbe mostrato
        // come 8001 in anteprima e arrotondato solo dentro setSteps.
        if (!Number.isInteger(steps)) fail("I passi devono essere un intero");
        return { date: dateOrReference(day, context), steps };
      });
      return { days };
    },
    preview: async ({ days }) => ({
      title: "Passi",
      lines: days.map((day) => `${shortDate(day.date)}: ${int(day.steps)} passi`),
    }),
    execute: async ({ days }) => {
      for (const day of days) await setSteps(day.date, day.steps, "voice");
      const first = days[0];
      return {
        message:
          days.length === 1
            ? `Registrati ${int(first.steps)} passi per il ${shortDate(first.date)}.`
            : `Registrati i passi di ${days.length} giorni.`,
      };
    },
  });

// ─── log_weight ──────────────────────────────────────────────────────────────

interface LogWeightArgs {
  date: string;
  weightKg: number;
  bodyFatPct?: number;
}

const MAX_BODY_FAT_PCT = 75;

const logWeight: ToolFactory = (context) =>
  defineTool<LogWeightArgs>({
    name: "log_weight",
    riskLevel: "write",
    description:
      "Save the body weight of one day, in kilograms. Italian speakers say " +
      "\"settantotto e mezzo\" or \"78 e mezzo\" meaning 78.5 kg: always convert to " +
      "a decimal number of kilograms. Date in YYYY-MM-DD, defaults to the " +
      "reference day of the context. One measurement per day: saving again " +
      "replaces the previous one.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Day in YYYY-MM-DD format." },
        weightKg: { type: "number", description: "Weight in kilograms, e.g. 78.5." },
        bodyFatPct: { type: "number", description: "Body fat percentage, if said." },
      },
      required: ["weightKg"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const bodyFatPct = optNumber(root, "bodyFatPct");
      // Una percentuale fuori scala è un errore di ascolto, non un dato: senza
      // questo controllo -5 o 900 finiscono nel grafico del profilo.
      if (bodyFatPct !== undefined) {
        if (bodyFatPct <= 0 || bodyFatPct > MAX_BODY_FAT_PCT) {
          fail(`Massa grassa implausibile: ${num(bodyFatPct)}%`);
        }
      }
      return {
        date: dateOrReference(root, context),
        weightKg: reqPositive(root, "weightKg"),
        bodyFatPct,
      };
    },
    preview: async (args) => {
      const lines = [`${shortDate(args.date)}: ${num(args.weightKg)} kg`];
      if (args.bodyFatPct !== undefined) {
        lines.push(`Massa grassa: ${num(args.bodyFatPct)}%`);
      }
      return { title: "Peso", lines };
    },
    execute: async (args) => {
      await setWeight(args.date, args.weightKg, args.bodyFatPct ?? null);
      return {
        message: `Registrato il peso di ${num(args.weightKg)} kg per il ${shortDate(args.date)}.`,
      };
    },
  });

// ─── add_meal_entries ────────────────────────────────────────────────────────

/**
 * Voce del pasto come la può produrre il modello: COSA e QUANTO, mai i valori
 * nutrizionali.
 *
 * Kcal e macro non sono nello schema e non si accettano nemmeno se il modello
 * li manda lo stesso: li risolve la cascata locale (ricette dell'utente ->
 * alimenti dell'utente -> seed -> OpenFoodFacts -> stima AI). È la regola di
 * dominio 5.4: tutto ciò che entra in diario deve essere passato di lì.
 */
type ParsedEntry =
  | { kind: "food"; foodId: string; quantityG: number }
  | { kind: "recipe"; recipeId: string; servings: number }
  | { kind: "byName"; name: string; quantityG?: number; servings?: number };

interface AddMealEntriesArgs {
  date: string;
  mealTypeId: string;
  entries: ParsedEntry[];
}

/**
 * Sotto questa soglia una quantità è quasi sempre un etto mai convertito
 * ("due etti" -> 2). Rifiutare costa una domanda all'utente; accettare scrive
 * in diario un centesimo delle calorie senza che nulla lo segnali.
 */
const MIN_PLAUSIBLE_QUANTITY_G = 5;

function checkedGrams(value: number, what: string): number {
  if (value < MIN_PLAUSIBLE_QUANTITY_G) {
    fail(
      `Quantità implausibile per "${what}": ${num(value)} g. 1 etto = 100 g, ` +
        "\"due etti\" = 200 g. Se l'utente intendeva davvero pochi grammi, chiediglielo.",
    );
  }
  return value;
}

function requiredGrams(value: number | null | undefined, what: string): number {
  if (value === null || value === undefined) {
    fail(`Quantità mancante per "${what}": chiedi all'utente quanti grammi.`);
  }
  return checkedGrams(value, what);
}

async function mealTypeName(mealTypeId: string): Promise<string> {
  const types = await listMealTypes();
  const found = types.find((type) => type.id === mealTypeId);
  if (!found) fail(`Tipo di pasto "${mealTypeId}" inesistente`);
  return found.name;
}

/**
 * Voce pronta: riga di anteprima, totale già scalato e la scrittura da fare.
 *
 * Anteprima ed esecuzione passano dalla stessa funzione, così l'utente conferma
 * esattamente i numeri che finiranno in diario.
 */
interface EntryPlan {
  line: string;
  /** Totale della voce, MAI valori per 100 g. */
  nutrients: Nutrients;
  write: (date: string, mealTypeId: string) => Promise<void>;
}

const foodPlan = (
  food: FoodRow,
  quantityG: number | null | undefined,
): EntryPlan => {
  const grams = requiredGrams(quantityG, food.name);
  const nutrients = scaleNutrients(foodNutrients(food), grams);
  return {
    line: `${food.name} - ${int(grams)} g - ${int(nutrients.kcal)} kcal, P ${num(nutrients.protein)} g`,
    nutrients,
    write: async (date, mealTypeId) => {
      await addFoodEntry({
        date,
        mealTypeId,
        foodId: food.id,
        quantityG: grams,
        createdVia: "voice",
      });
    },
  };
};

async function recipePlan(
  recipe: RecipeRow,
  servings: number,
  unusedQuantityG: number | null,
): Promise<EntryPlan> {
  const tree = await buildRecipeTree(recipe.id);
  if (!tree) fail(`Pasto "${recipe.name}" non leggibile`);
  const nutrients = scaleNutrients(recipePerServing(tree), servings * 100);
  // I grammi detti per una ricetta non sono convertibili in porzioni: si dice,
  // invece di farli sparire in silenzio dall'anteprima.
  const note =
    unusedQuantityG === null
      ? ""
      : ` (i ${int(unusedQuantityG)} g detti non si applicano a un pasto in porzioni)`;
  return {
    line:
      `${recipe.name} - ${num(servings)} ${plural(servings, "porzione", "porzioni")} - ` +
      `${int(nutrients.kcal)} kcal, P ${num(nutrients.protein)} g${note}`,
    nutrients,
    write: async (date, mealTypeId) => {
      await addRecipeEntry({
        date,
        mealTypeId,
        recipeId: recipe.id,
        servings,
        createdVia: "voice",
      });
    },
  };
}

/**
 * Voce libera con i valori risolti dalla cascata (OpenFoodFacts o stima AI).
 *
 * `per100` è per 100 g, come ovunque nel dominio; `addFreeEntry` congela invece
 * il TOTALE della riga. La conversione avviene qui, una volta sola: se si
 * passassero i valori per 100 g si registrerebbe metà delle calorie su una
 * piadina da 200 g, in silenzio.
 */
const freePlan = (
  label: string,
  per100: Nutrients,
  quantityG: number | null,
  confidence: number,
): EntryPlan => {
  const grams = requiredGrams(quantityG, label);
  const nutrients = scaleNutrients(per100, grams);
  return {
    line: `${label} (stima) - ${int(grams)} g - ${int(nutrients.kcal)} kcal, P ${num(nutrients.protein)} g`,
    nutrients,
    write: async (date, mealTypeId) => {
      await addFreeEntry({
        date,
        mealTypeId,
        label,
        nutrients,
        isEstimated: true,
        confidence,
        createdVia: "voice",
      });
    },
  };
};

/**
 * Risoluzioni già calcolate, condivise fra anteprima ed esecuzione.
 *
 * L'ultimo livello della cascata è una stima AI, che NON è deterministica:
 * senza questa memoria l'utente confermerebbe i numeri dell'anteprima e nel
 * diario ne finirebbero altri. Non è una cache di performance: toglierla
 * riapre quel disallineamento.
 *
 * Vive quanto la SINGOLA interazione, non quanto il processo: una cache
 * globale scavalcherebbe la cascata: se dopo una stima l'utente salva quel
 * cibo in libreria, la volta dopo deve vincere il match locale, non il valore
 * inventato mezz'ora prima.
 */
const MAX_CACHED_RESOLUTIONS = 50;

const resolutionKey = (input: ResolveFoodInput): string =>
  JSON.stringify([
    input.name.trim().toLowerCase(),
    input.quantityG ?? null,
    input.servings ?? null,
  ]);

function rememberResolution(
  cache: Map<string, Promise<ResolvedItem>>,
  key: string,
  item: Promise<ResolvedItem>,
): void {
  if (cache.size >= MAX_CACHED_RESOLUTIONS) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, item);
}

function cachedResolve(
  context: ToolContext,
  inputs: ResolveFoodInput[],
): Promise<ResolvedItem[]> {
  const cache = context.resolutionCache;
  const keys = inputs.map(resolutionKey);
  const missing = keys
    .map((key, index) => (cache.has(key) ? -1 : index))
    .filter((index) => index >= 0);

  if (missing.length > 0) {
    const batch = resolveFoodItems(missing.map((index) => inputs[index]));
    missing.forEach((inputIndex, batchIndex) => {
      const key = keys[inputIndex];
      const single = batch.then((items) => items[batchIndex]);
      // Una risoluzione fallita non si memorizza: il giro dopo deve riprovare.
      single.catch(() => cache.delete(key));
      rememberResolution(cache, key, single);
    });
  }

  return Promise.all(
    keys.map(
      (key) =>
        cache.get(key) ??
        Promise.reject(new AiResponseError("Risoluzione non disponibile")),
    ),
  );
}

function planFromResolved(item: ResolvedItem): Promise<EntryPlan> | EntryPlan {
  switch (item.kind) {
    case "recipe":
      return recipePlan(item.recipe, item.servings, item.unusedQuantityG);
    case "food":
      return foodPlan(item.food, item.quantityG);
    case "off":
      return freePlan(
        item.food.name,
        item.food.nutrients,
        item.quantityG,
        item.confidence,
      );
    case "estimated":
      return freePlan(item.label, item.nutrients, item.quantityG, item.confidence);
  }
}

async function planEntry(
  entry: ParsedEntry,
  resolved: ResolvedItem | undefined,
): Promise<EntryPlan> {
  if (entry.kind === "food") {
    const food = await getFood(entry.foodId);
    if (!food) fail(`Alimento "${entry.foodId}" inesistente`);
    return foodPlan(food, entry.quantityG);
  }
  if (entry.kind === "recipe") {
    const recipe = await getRecipe(entry.recipeId);
    if (!recipe) fail(`Pasto "${entry.recipeId}" inesistente`);
    return recipePlan(recipe, entry.servings, null);
  }
  if (!resolved) fail(`Non sono riuscito a risolvere "${entry.name}"`);
  return planFromResolved(resolved);
}

async function planEntries(
  context: ToolContext,
  entries: ParsedEntry[],
): Promise<EntryPlan[]> {
  const byName = entries.flatMap((entry, index) =>
    entry.kind === "byName" ? [{ index, entry }] : [],
  );
  const resolved =
    byName.length === 0
      ? []
      : await cachedResolve(context,           byName.map(({ entry }) => ({
            name: entry.name,
            quantityG: entry.quantityG,
            servings: entry.servings,
          })),
        );
  const resolvedByIndex = new Map(
    byName.map(({ index }, position) => [index, resolved[position]]),
  );

  const plans: EntryPlan[] = [];
  for (const [index, entry] of entries.entries()) {
    plans.push(await planEntry(entry, resolvedByIndex.get(index)));
  }
  return plans;
}

const addMealEntries: ToolFactory = (context) =>
  defineTool<AddMealEntriesArgs>({
    name: "add_meal_entries",
    riskLevel: "write",
    description:
      "Add one or more entries to a meal of the diary. Report only WHAT the " +
      "user ate and HOW MUCH: calories and macros are NOT your job and there " +
      "is no field for them. The app resolves every entry against the user's " +
      "recipes, the user's foods, the local database and OpenFoodFacts. " +
      "QUANTITIES ARE ALWAYS IN GRAMS: 1 etto = 100 g, \"un etto e mezzo\" = " +
      "150 g, \"due etti e mezzo\" = 250 g, \"mezzo chilo\" = 500 g, \"un chilo\" " +
      "= 1000 g. Never pass 1 for \"un etto\". Always pass `name` with what the " +
      "user said; add `foodId` or `recipeId` when the name clearly matches one " +
      "of the ids listed in the context. A recipe is counted in servings, a " +
      "food in grams: if the user did not say how much, ask instead of " +
      "guessing. Date in YYYY-MM-DD, defaults to the reference day of the " +
      "context.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Day in YYYY-MM-DD format." },
        mealTypeId: {
          type: "string",
          description: "Id of the meal type, from the list given in the context.",
        },
        entries: {
          type: "array",
          description: "One item per food or recipe named by the user.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "What the user called it, e.g. \"riso basmati\". Always required.",
              },
              foodId: {
                type: "string",
                description: "Id of a known food, when the name matches one.",
              },
              recipeId: {
                type: "string",
                description: "Id of a known recipe, when the name matches one.",
              },
              quantityG: {
                type: "number",
                description: "Grams. 1 etto = 100 g. Required for a food.",
              },
              servings: {
                type: "number",
                description: "Servings, used with a recipe. Defaults to 1.",
              },
            },
            required: ["name"],
          },
        },
      },
      required: ["mealTypeId", "entries"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const entries = reqArray(root, "entries").map<ParsedEntry>((item) => {
        const source = asRecord(item, "Voce");
        // Rifiutare invece di ignorare: se il modello prova a passare i macro,
        // il tentativo deve tornargli indietro come errore, non sparire.
        if (source.nutrients !== undefined || source.kcal !== undefined) {
          fail(
            "I valori nutrizionali non si passano: manda nome e quantità, " +
              "li risolve l'app sui dati dell'utente.",
          );
        }

        const foodId = optString(source, "foodId");
        const recipeId = optString(source, "recipeId");
        const name = optString(source, "name") ?? optString(source, "label");

        if (foodId !== undefined) {
          const quantityG = reqPositive(source, "quantityG");
          return {
            kind: "food",
            foodId,
            quantityG: checkedGrams(quantityG, name ?? foodId),
          };
        }
        if (recipeId !== undefined) {
          return {
            kind: "recipe",
            recipeId,
            servings: optPositive(source, "servings") ?? 1,
          };
        }
        if (name === undefined) {
          fail("Ogni voce deve avere name, foodId oppure recipeId");
        }
        const quantityG = optPositive(source, "quantityG");
        return {
          kind: "byName",
          name,
          quantityG:
            quantityG === undefined ? undefined : checkedGrams(quantityG, name),
          servings: optPositive(source, "servings"),
        };
      });

      return {
        date: dateOrReference(root, context),
        mealTypeId: reqString(root, "mealTypeId"),
        entries,
      };
    },
    preview: async (args) => {
      const name = await mealTypeName(args.mealTypeId);
      const plans = await planEntries(context, args.entries);

      const lines = plans.map((plan) => plan.line);
      if (plans.length > 1) {
        const totals = sumNutrients(plans.map((plan) => plan.nutrients));
        lines.push(`Totale: ${int(totals.kcal)} kcal, P ${num(totals.protein)} g`);
      }
      return { title: `Aggiungo a ${name} (${shortDate(args.date)})`, lines };
    },
    execute: async (args) => {
      const name = await mealTypeName(args.mealTypeId);
      const plans = await planEntries(context, args.entries);
      for (const plan of plans) await plan.write(args.date, args.mealTypeId);
      const count = plans.length;
      return {
        message: `${plural(count, "Aggiunta", "Aggiunte")} ${count} ${plural(count, "voce", "voci")} a ${name}.`,
      };
    },
  });

// ─── delete_entry ────────────────────────────────────────────────────────────

interface DeleteEntryArgs {
  date: string;
  entryId: string;
  label?: string;
}

/**
 * La voce esiste davvero? Il gate di conferma non deve poter chiedere all'utente
 * di cancellare un id inventato, e "Eliminato: riso" non deve poter uscire
 * quando non è stato cancellato niente.
 */
async function findDiaryEntry(
  date: string,
  entryId: string,
): Promise<{ entry: MealEntryRow; mealName: string }> {
  const diary = await getDayDiary(date);
  for (const meal of diary.meals) {
    const entry = meal.entries.find((row) => row.id === entryId);
    if (entry) return { entry, mealName: meal.type.name };
  }
  fail(
    `Nessuna voce con id "${entryId}" nel diario del ${shortDate(date)}: usa uno ` +
      "degli id elencati nel contesto, oppure dillo all'utente.",
  );
}

async function diaryEntryName(
  entry: MealEntryRow,
  fallback: string | undefined,
): Promise<string> {
  if (entry.label) return entry.label;
  if (entry.food_id) {
    const food = await getFood(entry.food_id);
    if (food) return food.name;
  }
  if (entry.recipe_id) {
    const recipe = await getRecipe(entry.recipe_id);
    if (recipe) return recipe.name;
  }
  return fallback ?? "Voce del diario";
}

const deleteEntryTool: ToolFactory = (context) =>
  defineTool<DeleteEntryArgs>({
    name: "delete_entry",
    riskLevel: "destructive",
    description:
      "Delete one entry from the diary. Pass the entry id taken from the " +
      "\"Diary entries\" list of the context: never guess it, and if the entry " +
      "the user means is not in that list, say so instead of calling this " +
      "tool. `date` is the day that list refers to (YYYY-MM-DD), and defaults " +
      "to the reference day of the context. `label` is only shown in the " +
      "confirmation.",
    parameters: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "Id of the diary entry." },
        date: { type: "string", description: "Day of the entry, YYYY-MM-DD." },
        label: {
          type: "string",
          description: "Name of the entry, shown in the confirmation preview.",
        },
      },
      required: ["entryId"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      return {
        date: dateOrReference(root, context),
        entryId: reqString(root, "entryId"),
        label: optString(root, "label"),
      };
    },
    preview: async (args) => {
      const { entry, mealName } = await findDiaryEntry(args.date, args.entryId);
      const name = await diaryEntryName(entry, args.label);
      return {
        title: "Elimino una voce",
        lines: [
          `${name} - ${int(entry.kcal)} kcal (${mealName} del ${shortDate(args.date)})`,
          "L'operazione non è reversibile.",
        ],
      };
    },
    execute: async (args) => {
      // Ricontrollata anche qui: fra anteprima e conferma l'utente può aver
      // cancellato la voce dalla UI, e deleteEntry non segnala zero righe.
      const { entry } = await findDiaryEntry(args.date, args.entryId);
      const name = await diaryEntryName(entry, args.label);
      await deleteEntry(args.entryId);
      return { message: `Eliminato: ${name}.` };
    },
  });

// ─── query_summary ───────────────────────────────────────────────────────────

/** Righe del riepilogo: le condividono anteprima e messaggio. */
async function summaryLines(date: string): Promise<string[]> {
  const [diary, targets, steps] = await Promise.all([
    getDayDiary(date),
    getTargetsFor(date),
    getSteps(date),
  ]);
  const eaten = diary.totals;
  const walked = steps?.steps ?? 0;

  if (!targets) {
    return [
      `${int(eaten.kcal)} kcal, ${num(eaten.protein)} g di proteine, ${num(eaten.carbs)} g di carboidrati, ${num(eaten.fat)} g di grassi.`,
      `${int(walked)} passi.`,
      "Nessun obiettivo impostato per questo giorno.",
    ];
  }

  const left = (value: number, target: number): string => {
    // Arrotondato prima del confronto: num() mostrerebbe "mancano 0" per 0,04.
    const remaining = Math.round((target - value) * 10) / 10;
    if (remaining > 0) return `mancano ${num(remaining)}`;
    // Obiettivo centrato non è uno sforamento: "sforato di 0" è una frase che
    // l'assistente poi pronuncia.
    if (remaining === 0) return "obiettivo raggiunto";
    return `sforato di ${num(-remaining)}`;
  };

  /**
   * Un obiettivo a zero significa "non l'ho impostato", non "il mio obiettivo
   * e' zero": la schermata degli obiettivi lascia a zero i campi che l'utente
   * non compila, e la barra dei macro li mostra gia' come assenti. Leggerlo
   * alla lettera faceva dire all'assistente "Proteine: 120 g su 0 g, sforato
   * di 120" a chi non aveva mai fissato un obiettivo proteico.
   */
  const line = (
    label: string,
    eatenText: string,
    target: number,
    targetText: string,
    remaining: string,
  ): string =>
    target > 0
      ? `${label}: ${eatenText} su ${targetText} (${remaining}).`
      : `${label}: ${eatenText}, nessun obiettivo impostato.`;

  return [
    line(
      "Calorie",
      int(eaten.kcal),
      targets.kcal,
      int(targets.kcal),
      left(eaten.kcal, targets.kcal),
    ),
    line(
      "Proteine",
      `${num(eaten.protein)} g`,
      targets.protein_g,
      `${int(targets.protein_g)} g`,
      left(eaten.protein, targets.protein_g),
    ),
    line(
      "Carboidrati",
      `${num(eaten.carbs)} g`,
      targets.carbs_g,
      `${int(targets.carbs_g)} g`,
      left(eaten.carbs, targets.carbs_g),
    ),
    line(
      "Grassi",
      `${num(eaten.fat)} g`,
      targets.fat_g,
      `${int(targets.fat_g)} g`,
      left(eaten.fat, targets.fat_g),
    ),
    line(
      "Passi",
      int(walked),
      targets.steps,
      int(targets.steps),
      left(walked, targets.steps),
    ),
  ];
}

const querySummary: ToolFactory = (context) =>
  defineTool<{ date: string }>({
    name: "query_summary",
    riskLevel: "read",
    description:
      "Read the summary of one day: calories and macros eaten against the " +
      "targets, how much is left, and the steps walked. Call it for questions " +
      "like \"quante proteine mi mancano?\" or \"quanto ho camminato?\". " +
      "Date in YYYY-MM-DD, defaults to the reference day of the context.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Day in YYYY-MM-DD format." },
      },
    },
    parse: (raw) => ({ date: dateOrReference(asRecord(raw), context) }),
    preview: async ({ date }) => ({
      title: `Riepilogo del ${shortDate(date)}`,
      lines: await summaryLines(date),
    }),
    execute: async ({ date }) => ({
      message: (await summaryLines(date)).join(" "),
    }),
  });

// ─── set_target ──────────────────────────────────────────────────────────────

interface SetTargetArgs {
  validFrom: string;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  steps?: number;
}

interface ResolvedTargets {
  validFrom: string;
  next: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    steps: number;
  };
  changes: string[];
}

/**
 * Gli obiettivi si salvano interi, ma l'utente ne nomina uno solo ("alza le
 * calorie a 2400"): i campi non detti si ereditano da quelli in vigore.
 */
async function resolveTargets(args: SetTargetArgs): Promise<ResolvedTargets> {
  const current = await getTargetsFor(args.validFrom);
  if (!current) {
    fail("Non ci sono obiettivi da aggiornare: impostane prima uno dal profilo.");
  }

  const next = {
    kcal: args.kcal ?? current.kcal,
    proteinG: args.proteinG ?? current.protein_g,
    carbsG: args.carbsG ?? current.carbs_g,
    fatG: args.fatG ?? current.fat_g,
    steps: args.steps ?? current.steps,
  };

  const changes: string[] = [];
  const track = (label: string, before: number, after: number): void => {
    if (before !== after) changes.push(`${label}: ${num(before)} → ${num(after)}`);
  };
  track("Calorie", current.kcal, next.kcal);
  track("Proteine", current.protein_g, next.proteinG);
  track("Carboidrati", current.carbs_g, next.carbsG);
  track("Grassi", current.fat_g, next.fatG);
  track("Passi", current.steps, next.steps);

  return { validFrom: args.validFrom, next, changes };
}

const setTarget: ToolFactory = (context) =>
  defineTool<SetTargetArgs>({
    name: "set_target",
    riskLevel: "write",
    description:
      "Change the daily targets starting from a date. Pass ONLY the values the " +
      "user actually mentioned: the others keep the value of the targets " +
      "currently in force. Calories are kcal, macros are grams per day. " +
      "`validFrom` in YYYY-MM-DD, defaults to the reference day of the context.",
    parameters: {
      type: "object",
      properties: {
        validFrom: { type: "string", description: "Start day in YYYY-MM-DD format." },
        kcal: { type: "integer", description: "Daily calorie target." },
        proteinG: { type: "integer", description: "Daily protein target, grams." },
        carbsG: { type: "integer", description: "Daily carbs target, grams." },
        fatG: { type: "integer", description: "Daily fat target, grams." },
        steps: { type: "integer", description: "Daily step target." },
      },
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const args: SetTargetArgs = {
        validFrom: dateOrReference(root, context, "validFrom"),
        kcal: optPositive(root, "kcal"),
        proteinG: optPositive(root, "proteinG"),
        carbsG: optPositive(root, "carbsG"),
        fatG: optPositive(root, "fatG"),
        steps: optNumber(root, "steps"),
      };
      if (args.steps !== undefined && args.steps < 0) {
        fail("\"steps\" non può essere negativo");
      }
      const hasValue = [args.kcal, args.proteinG, args.carbsG, args.fatG, args.steps]
        .some((value) => value !== undefined);
      if (!hasValue) fail("Nessun obiettivo da modificare");
      return args;
    },
    preview: async (args) => {
      const { validFrom, changes } = await resolveTargets(args);
      return {
        title: `Nuovi obiettivi dal ${shortDate(validFrom)}`,
        lines:
          changes.length > 0
            ? changes
            : ["Nessuna modifica rispetto agli obiettivi attuali."],
      };
    },
    execute: async (args) => {
      const { validFrom, next, changes } = await resolveTargets(args);
      await saveTargets({ validFrom, ...next });
      return {
        message:
          changes.length > 0
            ? `Obiettivi aggiornati dal ${shortDate(validFrom)}: ${changes.join(", ")}.`
            : `Obiettivi confermati dal ${shortDate(validFrom)}.`,
      };
    },
  });

// ─── navigate ────────────────────────────────────────────────────────────────

/**
 * `satisfies` invece di una lista libera: se una rotta viene rinominata in
 * NavParams il typecheck rompe qui, senza tirarsi dietro React Navigation a
 * runtime (il tipo è importato con `import type`).
 */
const SCREENS = [
  "TodayTab",
  "ProgressTab",
  "GymTab",
  "ProfileTab",
  "Foods",
  "FoodForm",
  "Recipes",
  "RecipeForm",
  "Settings",
  "Targets",
  "Backup",
] as const satisfies readonly (keyof NavParams)[];

type ScreenName = (typeof SCREENS)[number];

const SCREEN_LABELS: Record<ScreenName, string> = {
  TodayTab: "Oggi",
  ProgressTab: "Progressi",
  GymTab: "Palestra",
  ProfileTab: "Profilo",
  Foods: "Alimenti",
  FoodForm: "Scheda alimento",
  Recipes: "Pasti",
  RecipeForm: "Scheda pasto",
  Settings: "Impostazioni",
  Targets: "Obiettivi",
  Backup: "Backup",
};

const isScreenName = (value: string): value is ScreenName =>
  (SCREENS as readonly string[]).includes(value);

interface NavigateArgs {
  screen: ScreenName;
  params?: Record<string, unknown>;
}

const navigate: ToolFactory = () =>
  defineTool<NavigateArgs>({
    name: "navigate",
    riskLevel: "read",
    description:
      "Open a screen of the app. Use it for requests like \"portami alla scheda " +
      "di oggi\" or \"apri i miei alimenti\". Only the listed screen names are " +
      "valid. It does not change any data.",
    parameters: {
      type: "object",
      properties: {
        screen: { type: "string", description: "Screen to open.", enum: SCREENS },
        params: {
          type: "object",
          description: "Optional route params, e.g. { \"id\": \"...\" }.",
        },
      },
      required: ["screen"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const screen = reqString(root, "screen");
      if (!isScreenName(screen)) fail(`Schermata "${screen}" inesistente`);
      const params = root.params;
      return {
        screen,
        params:
          params === undefined || params === null
            ? undefined
            : asRecord(params, "params"),
      };
    },
    preview: async (args) => ({
      title: "Navigazione",
      lines: [`Apro ${SCREEN_LABELS[args.screen]}.`],
    }),
    // Non naviga: la navigazione è un effetto della UI, che legge l'intento e la
    // esegue con useAppNav. Qui resta solo il messaggio, così il contratto dei
    // tool non si biforca per un caso solo.
    execute: async (args) => ({ message: `Apro ${SCREEN_LABELS[args.screen]}.` }),
  });

// ─── Registro ────────────────────────────────────────────────────────────────

const TOOL_FACTORIES: ToolFactory[] = [
  navigate,
  addMealEntries,
  deleteEntryTool,
  logSteps,
  logWeight,
  querySummary,
  setTarget,
];

/** Numero di tool esposti: utile ai test senza costruirli tutti. */
export const TOOL_COUNT = TOOL_FACTORIES.length;

/**
 * Costruisce i tool legati a un contesto. Sono oggetti leggeri: si ricreano a
 * ogni turno dell'assistente perché il giorno di riferimento cambia.
 */
export const createTools = (
  context: ToolContext = defaultToolContext(),
): RegisteredTool[] => TOOL_FACTORIES.map((factory) => factory(context));

export const toolDefinitions = (
  tools: RegisteredTool[] = createTools(),
): ToolDefinition[] =>
  tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
