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
import { createExercise, searchExercises } from "@/src/db/queries/exercises";
import { createFood, getFood } from "@/src/db/queries/foods";
import { addPlanEntry } from "@/src/db/queries/mealPlan";
import {
  buildRecipeTree,
  createRecipe,
  getRecipe,
} from "@/src/db/queries/recipes";
import { getTargetsFor, saveTargets } from "@/src/db/queries/settings";
import { getSteps, setSteps, setWeight } from "@/src/db/queries/tracking";
import { createRoutine, logSet, startSession } from "@/src/db/queries/workouts";
import { isRealIsoDate, todayIso } from "@/src/domain/date";
import { i18n } from "@/src/i18n";
import { decimalSeparator } from "@/src/utils/number";
import {
  recipePerServing,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
} from "@/src/domain/nutrition";
import { knownSlugs } from "@/src/domain/taxonomy";
import type { NavParams } from "@/src/hooks/useAppNav";
import { navigationRef } from "@/src/navigation/navigationRef";
import { useTaxonomyStore } from "@/src/stores/taxonomyStore";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  UNKNOWN_MUSCLE_GROUP,
  type Equipment,
  type MuscleGroup,
} from "@/src/types/gym";
import {
  foodNutrients,
  type FoodRow,
  type MealEntryRow,
  type RecipeRow,
} from "@/src/types/nutrition";

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

function optDate(
  source: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = optString(source, key);
  if (value === undefined) return undefined;
  // Non solo la forma: il modello risolve "ieri" da se', e il 1 marzo puo'
  // scrivere "2026-02-29". Quella riga finirebbe a database in un giorno che
  // non esiste, dove nessuna schermata puo' andare a correggerla.
  if (!isRealIsoDate(value)) {
    fail(`"${key}" non e' una data valida (YYYY-MM-DD)`);
  }
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

// ─── Formattazione ───────────────────────────────────────────────────────────

/**
 * Anteprime e messaggi di questo file li LEGGE L'UTENTE, quindi passano da
 * `i18n`: erano scritti in italiano dentro il codice, e chi usava KalTrack in
 * inglese si vedeva rispondere "Registrati 8000 passi per il 07/09" sotto una
 * scheda intitolata "Passi". Le `description` dei tool restano invece in
 * inglese: quelle le legge il modello, non l'utente (§ buildSystemPrompt).
 */

/** Data compatta per le anteprime: la ISO completa è rumore da leggere. */
const shortDate = (iso: string): string =>
  `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const num = (value: number): string =>
  (Math.round(value * 10) / 10).toString().replace(".", decimalSeparator());

const int = (value: number): string => String(Math.round(value));

/**
 * "2 porzioni" / "2 servings": il plurale lo decide i18n, non un ternario.
 *
 * `count` sceglie la forma, `value` è il numero come si scrive: mezza porzione
 * è "0,5 porzioni" in italiano e "0.5 servings" in inglese, e col solo `count`
 * i18n stamperebbe il numero grezzo.
 */
const servingsLabel = (count: number): string =>
  i18n.t("assistant_tools.servings", { count, value: num(count) });

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
      'several days in a single sentence ("lunedì 8000, martedì 12000"): return ' +
      "one item per day, never merge them. Dates MUST be in YYYY-MM-DD format: " +
      'resolve "oggi", "ieri" and weekday names against the current date given ' +
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
              date: {
                type: "string",
                description: "Day in YYYY-MM-DD format.",
              },
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
        if (steps < 0) fail(i18n.t("assistant_tools.steps_negative"));
        // Lo schema dichiara integer ma non lo impone: 8000.7 verrebbe mostrato
        // come 8001 in anteprima e arrotondato solo dentro setSteps.
        if (!Number.isInteger(steps))
          fail(i18n.t("assistant_tools.steps_integer"));
        return { date: dateOrReference(day, context), steps };
      });
      return { days };
    },
    preview: async ({ days }) => ({
      title: i18n.t("assistant_tools.steps_title"),
      lines: days.map((day) =>
        i18n.t("assistant_tools.steps_line", {
          date: shortDate(day.date),
          steps: int(day.steps),
        }),
      ),
    }),
    execute: async ({ days }) => {
      for (const day of days) await setSteps(day.date, day.steps, "voice");
      const first = days[0];
      return {
        message: i18n.t("assistant_tools.steps_saved", {
          count: days.length,
          steps: int(first.steps),
          date: shortDate(first.date),
        }),
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
      '"settantotto e mezzo" or "78 e mezzo" meaning 78.5 kg: always convert to ' +
      "a decimal number of kilograms. Date in YYYY-MM-DD, defaults to the " +
      "reference day of the context. One measurement per day: saving again " +
      "replaces the previous one.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Day in YYYY-MM-DD format." },
        weightKg: {
          type: "number",
          description: "Weight in kilograms, e.g. 78.5.",
        },
        bodyFatPct: {
          type: "number",
          description: "Body fat percentage, if said.",
        },
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
      const lines = [
        i18n.t("assistant_tools.weight_line", {
          date: shortDate(args.date),
          weight: num(args.weightKg),
        }),
      ];
      if (args.bodyFatPct !== undefined) {
        lines.push(
          i18n.t("assistant_tools.body_fat_line", {
            value: num(args.bodyFatPct),
          }),
        );
      }
      return { title: i18n.t("assistant_tools.weight_title"), lines };
    },
    execute: async (args) => {
      await setWeight(args.date, args.weightKg, args.bodyFatPct ?? null);
      return {
        message: i18n.t("assistant_tools.weight_saved", {
          weight: num(args.weightKg),
          date: shortDate(args.date),
        }),
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
        '"due etti" = 200 g. Se l\'utente intendeva davvero pochi grammi, chiediglielo.',
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
      : i18n.t("assistant_tools.grams_unused", { grams: int(unusedQuantityG) });
  return {
    line:
      `${recipe.name} - ${servingsLabel(servings)} - ` +
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
      return freePlan(
        item.label,
        item.nutrients,
        item.quantityG,
        item.confidence,
      );
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
      : await cachedResolve(
          context,
          byName.map(({ entry }) => ({
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
      'QUANTITIES ARE ALWAYS IN GRAMS: 1 etto = 100 g, "un etto e mezzo" = ' +
      '150 g, "due etti e mezzo" = 250 g, "mezzo chilo" = 500 g, "un chilo" ' +
      '= 1000 g. Never pass 1 for "un etto". Always pass `name` with what the ' +
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
          description:
            "Id of the meal type, from the list given in the context.",
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
                  'What the user called it, e.g. "riso basmati". Always required.',
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
          fail(i18n.t("assistant_tools.no_nutrients"));
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
          // I grammi su un pasto non si possono onorare - un pasto e' definito
          // per porzioni, e quanto pesa una porzione non e' un dato che
          // esiste - ma nemmeno buttare via in silenzio: chi ha detto "200
          // grammi della mia pizza" si vedrebbe registrare una porzione
          // intera senza che niente lo dica.
          if (optPositive(source, "quantityG") !== undefined) {
            fail(i18n.t("assistant_tools.recipe_needs_servings"));
          }
          return {
            kind: "recipe",
            recipeId,
            servings: optPositive(source, "servings") ?? 1,
          };
        }
        if (name === undefined) {
          fail(i18n.t("assistant_tools.entry_needs_name"));
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
        lines.push(
          i18n.t("assistant_tools.meal_total", {
            kcal: int(totals.kcal),
            protein: num(totals.protein),
          }),
        );
      }
      return {
        title: i18n.t("assistant_tools.meal_add_title", {
          meal: name,
          date: shortDate(args.date),
        }),
        lines,
      };
    },
    execute: async (args) => {
      const name = await mealTypeName(args.mealTypeId);
      const plans = await planEntries(context, args.entries);
      for (const plan of plans) await plan.write(args.date, args.mealTypeId);
      const count = plans.length;
      return {
        message: i18n.t("assistant_tools.meal_added", { count, meal: name }),
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
      '"Diary entries" list of the context: never guess it, and if the entry ' +
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
        title: i18n.t("assistant_tools.delete_title"),
        lines: [
          i18n.t("assistant_tools.delete_line", {
            name,
            kcal: int(entry.kcal),
            meal: mealName,
            date: shortDate(args.date),
          }),
          i18n.t("assistant_tools.delete_irreversible"),
        ],
      };
    },
    execute: async (args) => {
      // Ricontrollata anche qui: fra anteprima e conferma l'utente può aver
      // cancellato la voce dalla UI, e deleteEntry non segnala zero righe.
      const { entry } = await findDiaryEntry(args.date, args.entryId);
      const name = await diaryEntryName(entry, args.label);
      await deleteEntry(args.entryId);
      return { message: i18n.t("assistant_tools.deleted", { name }) };
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
      i18n.t("assistant_tools.summary_totals", {
        kcal: int(eaten.kcal),
        protein: num(eaten.protein),
        carbs: num(eaten.carbs),
        fat: num(eaten.fat),
      }),
      i18n.t("assistant_tools.summary_steps", { steps: int(walked) }),
      i18n.t("assistant_tools.summary_no_targets"),
    ];
  }

  const left = (value: number, target: number): string => {
    // Arrotondato prima del confronto: num() mostrerebbe "mancano 0" per 0,04.
    const remaining = Math.round((target - value) * 10) / 10;
    if (remaining > 0)
      return i18n.t("assistant_tools.summary_left", { value: num(remaining) });
    // Obiettivo centrato non è uno sforamento: "sforato di 0" è una frase che
    // l'assistente poi pronuncia.
    if (remaining === 0) return i18n.t("assistant_tools.summary_on_target");
    return i18n.t("assistant_tools.summary_over", { value: num(-remaining) });
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
      ? i18n.t("assistant_tools.summary_with_target", {
          label,
          eaten: eatenText,
          target: targetText,
          remaining,
        })
      : i18n.t("assistant_tools.summary_without_target", {
          label,
          eaten: eatenText,
        });

  return [
    line(
      i18n.t("assistant_tools.label_kcal"),
      int(eaten.kcal),
      targets.kcal,
      int(targets.kcal),
      left(eaten.kcal, targets.kcal),
    ),
    line(
      i18n.t("assistant_tools.label_protein"),
      `${num(eaten.protein)} g`,
      targets.protein_g,
      `${int(targets.protein_g)} g`,
      left(eaten.protein, targets.protein_g),
    ),
    line(
      i18n.t("assistant_tools.label_carbs"),
      `${num(eaten.carbs)} g`,
      targets.carbs_g,
      `${int(targets.carbs_g)} g`,
      left(eaten.carbs, targets.carbs_g),
    ),
    line(
      i18n.t("assistant_tools.label_fat"),
      `${num(eaten.fat)} g`,
      targets.fat_g,
      `${int(targets.fat_g)} g`,
      left(eaten.fat, targets.fat_g),
    ),
    line(
      i18n.t("assistant_tools.label_steps"),
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
      'like "quante proteine mi mancano?" or "quanto ho camminato?". ' +
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
    fail(i18n.t("assistant_tools.targets_none"));
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
    if (before !== after)
      changes.push(`${label}: ${num(before)} → ${num(after)}`);
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
        validFrom: {
          type: "string",
          description: "Start day in YYYY-MM-DD format.",
        },
        kcal: { type: "integer", description: "Daily calorie target." },
        proteinG: {
          type: "integer",
          description: "Daily protein target, grams.",
        },
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
        fail('"steps" non può essere negativo');
      }
      const hasValue = [
        args.kcal,
        args.proteinG,
        args.carbsG,
        args.fatG,
        args.steps,
      ].some((value) => value !== undefined);
      if (!hasValue) fail(i18n.t("assistant_tools.targets_nothing_to_change"));
      return args;
    },
    preview: async (args) => {
      const { validFrom, changes } = await resolveTargets(args);
      return {
        title: i18n.t("assistant_tools.targets_title", {
          date: shortDate(validFrom),
        }),
        lines:
          changes.length > 0
            ? changes
            : [i18n.t("assistant_tools.targets_no_change")],
      };
    },
    execute: async (args) => {
      const { validFrom, next, changes } = await resolveTargets(args);
      await saveTargets({ validFrom, ...next });
      return {
        message:
          changes.length > 0
            ? i18n.t("assistant_tools.targets_updated", {
                date: shortDate(validFrom),
                changes: changes.join(", "),
              })
            : i18n.t("assistant_tools.targets_confirmed", {
                date: shortDate(validFrom),
              }),
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

/** Il nome leggibile della schermata, nella lingua dell'app. */
const screenLabel = (screen: ScreenName): string =>
  i18n.t(`assistant_tools.screen.${screen}`);

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
      'Open a screen of the app. Use it for requests like "portami alla scheda ' +
      'di oggi" or "apri i miei alimenti". Only the listed screen names are ' +
      "valid. It does not change any data.",
    parameters: {
      type: "object",
      properties: {
        screen: {
          type: "string",
          description: "Screen to open.",
          enum: SCREENS,
        },
        params: {
          type: "object",
          description: 'Optional route params, e.g. { "id": "..." }.',
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
      title: i18n.t("assistant_tools.nav_title"),
      lines: [
        i18n.t("assistant_tools.nav_line", { screen: screenLabel(args.screen) }),
      ],
    }),
    /**
     * Naviga davvero, tramite il ref della navigazione.
     *
     * Prima si limitava a rispondere "Apro Alimenti" contando su una UI che
     * leggesse l'intento: nessun componente lo faceva, e il tool prometteva
     * una cosa che non succedeva mai. L'assistente e' montato sopra l'albero
     * di navigazione, quindi il ref e' l'unica via.
     */
    execute: async (args) => {
      if (!navigationRef.isReady()) {
        fail(i18n.t("assistant_tools.nav_not_ready"));
      }
      // Il ref e' tipizzato `any` a monte (navigationRef.ts): il tipo giusto
      // e' garantito dal `satisfies` su SCREENS, non da questa chiamata.
      const navigateTo = navigationRef.navigate as (
        screen: string,
        params?: Record<string, unknown>,
      ) => void;
      navigateTo(args.screen, args.params);
      return {
        message: i18n.t("assistant_tools.nav_line", {
          screen: screenLabel(args.screen),
        }),
      };
    },
  });

// ─── create_custom_food ──────────────────────────────────────────────────────

interface CreateCustomFoodArgs {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  brand?: string;
  fiber?: number;
  sugars?: number;
  saturatedFat?: number;
  salt?: number;
  isLiquid?: boolean;
  defaultServingG?: number;
  servingLabel?: string;
}

const createCustomFood: ToolFactory = () =>
  defineTool<CreateCustomFoodArgs>({
    name: "create_custom_food",
    riskLevel: "write",
    description:
      "Create a new personal food item in the user's food database with nutritional values per 100g. " +
      "Use when user wants to create a new food, add a food to their personal list, or describes nutritional facts.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the food item." },
        kcal: { type: "number", description: "Calories (kcal) per 100g." },
        protein: { type: "number", description: "Protein (g) per 100g." },
        carbs: { type: "number", description: "Carbohydrates (g) per 100g." },
        fat: { type: "number", description: "Fat (g) per 100g." },
        brand: { type: "string", description: "Brand name, optional." },
        fiber: { type: "number", description: "Fiber (g) per 100g, optional." },
        sugars: {
          type: "number",
          description: "Sugars (g) per 100g, optional.",
        },
        saturatedFat: {
          type: "number",
          description: "Saturated fat (g) per 100g, optional.",
        },
        salt: { type: "number", description: "Salt (g) per 100g, optional." },
        isLiquid: {
          type: "boolean",
          description: "True if liquid (ml instead of g), optional.",
        },
        defaultServingG: {
          type: "number",
          description: "Standard serving size in grams, optional.",
        },
        servingLabel: {
          type: "string",
          description:
            "Description of the serving, e.g. '1 barretta = 45g', optional.",
        },
      },
      required: ["name", "kcal", "protein", "carbs", "fat"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const name = reqString(root, "name");
      const kcal = reqNumber(root, "kcal");
      const protein = reqNumber(root, "protein");
      const carbs = reqNumber(root, "carbs");
      const fat = reqNumber(root, "fat");
      return {
        name,
        kcal,
        protein,
        carbs,
        fat,
        brand: optString(root, "brand"),
        fiber: optNumber(root, "fiber"),
        sugars: optNumber(root, "sugars"),
        saturatedFat: optNumber(root, "saturatedFat"),
        salt: optNumber(root, "salt"),
        isLiquid:
          typeof root.isLiquid === "boolean" ? root.isLiquid : undefined,
        defaultServingG: optNumber(root, "defaultServingG"),
        servingLabel: optString(root, "servingLabel"),
      };
    },
    preview: async (args) => {
      const lines = [
        `Nome: ${args.name}${args.brand ? ` (${args.brand})` : ""}`,
        `Valori per 100g: ${num(args.kcal)} kcal · ${num(args.protein)}g P · ${num(args.carbs)}g C · ${num(args.fat)}g G`,
      ];
      if (args.defaultServingG) {
        lines.push(
          i18n.t("assistant_tools.food_serving_line", {
            grams: int(args.defaultServingG),
            label: args.servingLabel ? ` (${args.servingLabel})` : "",
          }),
        );
      }
      return {
        title: i18n.t("assistant_tools.food_create_title"),
        lines,
      };
    },
    execute: async (args) => {
      await createFood({
        name: args.name,
        brand: args.brand,
        nutrients: {
          kcal: args.kcal,
          protein: args.protein,
          carbs: args.carbs,
          fat: args.fat,
          fiber: args.fiber ?? 0,
          sugars: args.sugars ?? 0,
          saturatedFat: args.saturatedFat ?? 0,
          salt: args.salt ?? 0,
        },
        isLiquid: args.isLiquid ?? false,
        defaultServingG: args.defaultServingG,
        servingLabel: args.servingLabel,
      });
      return {
        message: i18n.t("assistant_tools.food_created", { name: args.name }),
      };
    },
  });

// ─── create_recipe ───────────────────────────────────────────────────────────

interface CreateRecipeIngredient {
  name: string;
  quantityG: number;
}

interface CreateRecipeArgs {
  name: string;
  servings: number;
  ingredients: CreateRecipeIngredient[];
  notes?: string;
}

const createRecipeTool: ToolFactory = (context) =>
  defineTool<CreateRecipeArgs>({
    name: "create_recipe",
    riskLevel: "write",
    description:
      "Create a custom recipe with a list of ingredients and quantities in grams, plus number of servings. " +
      "Use when user wants to create a new recipe or save a custom composite meal.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the recipe." },
        servings: {
          type: "number",
          description: "Number of servings (default 1).",
        },
        ingredients: {
          type: "array",
          description: "List of ingredients with name and grams.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Food name." },
              quantityG: { type: "number", description: "Quantity in grams." },
            },
            required: ["name", "quantityG"],
          },
        },
        notes: { type: "string", description: "Optional preparation notes." },
      },
      required: ["name", "ingredients"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const name = reqString(root, "name");
      const servings = optPositive(root, "servings") ?? 1;
      const rawIngredients = reqArray(root, "ingredients");
      const ingredients: CreateRecipeIngredient[] = rawIngredients.map(
        (item, idx) => {
          const rec = asRecord(item, `Ingrediente [${idx}]`);
          return {
            name: reqString(rec, "name"),
            quantityG: reqPositive(rec, "quantityG"),
          };
        },
      );
      return {
        name,
        servings,
        ingredients,
        notes: optString(root, "notes"),
      };
    },
    preview: async (args) => ({
      title: i18n.t("assistant_tools.recipe_create_title"),
      lines: [
        i18n.t("assistant_tools.recipe_line", {
          name: args.name,
          servings: servingsLabel(args.servings),
        }),
        i18n.t("assistant_tools.recipe_ingredients", {
          list: args.ingredients
            .map((i) => `${i.name} (${int(i.quantityG)} g)`)
            .join(", "),
        }),
      ],
    }),
    execute: async (args) => {
      const resolved = await cachedResolve(
        context,
        args.ingredients.map((i) => ({ name: i.name, quantityG: i.quantityG })),
      );

      const items: { foodId: string; quantityG: number }[] = [];
      for (let i = 0; i < resolved.length; i++) {
        const item = resolved[i];
        const ing = args.ingredients[i];
        if (item.kind === "food") {
          items.push({ foodId: item.food.id, quantityG: ing.quantityG });
        } else if (item.kind === "off") {
          const foodId = await createFood(item.food);
          items.push({ foodId, quantityG: ing.quantityG });
        } else {
          const nutrients =
            item.kind === "estimated"
              ? item.nutrients
              : {
                  kcal: 0,
                  protein: 0,
                  carbs: 0,
                  fat: 0,
                  fiber: 0,
                  sugars: 0,
                  saturatedFat: 0,
                  salt: 0,
                };
          const foodId = await createFood({
            name: ing.name,
            nutrients,
            isEstimated: true,
          });
          items.push({ foodId, quantityG: ing.quantityG });
        }
      }

      await createRecipe({
        name: args.name,
        servings: args.servings,
        notes: args.notes,
        items,
      });
      return {
        message: i18n.t("assistant_tools.recipe_created", { name: args.name }),
      };
    },
  });

// ─── create_exercise ─────────────────────────────────────────────────────────

interface CreateExerciseArgs {
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  equipment?: Equipment[];
  instructions?: string;
}

const createExerciseTool: ToolFactory = () =>
  defineTool<CreateExerciseArgs>({
    name: "create_exercise",
    riskLevel: "write",
    description:
      "Create a new gym exercise. Valid muscleGroup values: 'petto', 'schiena', 'spalle', 'bicipiti', 'tricipiti', 'quadricipiti', 'femorali', 'glutei', 'polpacci', 'addome', 'avambracci', 'full_body'. " +
      "Valid equipment values: 'corpo_libero', 'bilanciere', 'manubri', 'kettlebell', 'cavi', 'macchina', 'panca', 'sbarra', 'elastici', 'trx', 'cardio'.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Name of the exercise, e.g. 'Panca inclinata con manubri'.",
        },
        muscleGroup: {
          type: "string",
          description: "Primary muscle group.",
          enum: MUSCLE_GROUPS,
        },
        secondaryMuscles: {
          type: "array",
          description: "Secondary muscle groups.",
          items: { type: "string", enum: MUSCLE_GROUPS },
        },
        equipment: {
          type: "array",
          description: "Equipment needed.",
          items: { type: "string", enum: EQUIPMENT },
        },
        instructions: {
          type: "string",
          description: "Execution instructions, optional.",
        },
      },
      required: ["name", "muscleGroup"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const name = reqString(root, "name");
      const muscleGroup = reqString(root, "muscleGroup") as MuscleGroup;

      /*
       * L'`enum` sopra e' un suggerimento per il modello (MUSCLE_GROUPS/
       * EQUIPMENT, il seme compilato in questa versione dell'app): resta li'
       * perche' e' quel che il modello legge, e un elenco che cambia ogni ora
       * non gli servirebbe a niente. Il LUCCHETTO e' qui: la tassonomia
       * locale, che il pull tiene aggiornata anche con quel che il pannello
       * ha aggiunto un'ora fa. Un gruppo cosi' nuovo supererebbe l'enum-guida
       * solo per caso; qui passa perche' la tassonomia lo conosce davvero.
       *
       * Lettura VIVA (`liveMuscleGroups`/`liveEquipment`) e non "tutti,
       * cancellati compresi": qui si scrive una riga NUOVA, cioe' si offre
       * una scelta esattamente come ogni selettore dell'interfaccia. Un
       * gruppo che un amministratore ha cancellato non e' piu' un'opzione da
       * proporre, ne' per un modulo ne' per l'assistente che scrive al suo
       * posto - e' la stessa domanda di `listAvailableEquipment` vs
       * `listUsableEquipment`, con la risposta opposta perche' qui non si
       * disegna un esercizio che esiste gia'.
       */
      const muscoliNoti = knownSlugs(useTaxonomyStore.getState().liveMuscleGroups);
      const attrezziNoti = knownSlugs(useTaxonomyStore.getState().liveEquipment);

      /*
       * Il messaggio riporta i valori ACCETTATI, non solo quello rifiutato:
       * l'unico elenco che il modello ha visto e' l'`enum` sulle costanti,
       * che non e' piu' il metro. Senza questo il modello riprova alla cieca
       * e puo' bruciare fino a tre delle venti richieste giornaliere per
       * modello (CLAUDE.md § La quota) su un solo slug, senza aver ricevuto
       * un'informazione in piu' su cui correggersi.
       */
      if (!muscoliNoti.has(muscleGroup)) {
        fail(
          `Gruppo muscolare "${muscleGroup}" non valido. Valori validi: ` +
            `${[...muscoliNoti].sort().join(", ")}`,
        );
      }

      /*
       * Le tre validazioni ora FALLISCONO tutte allo stesso modo: prima solo
       * il gruppo principale bloccava, muscoli secondari e attrezzatura
       * sbagliati sparivano zitti dall'array. Un attrezzo scartato in
       * silenzio e' un esercizio creato senza attrezzatura, e nessuno lo dice
       * a chi ha appena chiesto di crearlo - lo stesso difetto che un errore
       * chiaro qui esiste per evitare.
       */
      const secondaryMuscles: MuscleGroup[] = [];
      if (Array.isArray(root.secondaryMuscles)) {
        for (const m of root.secondaryMuscles) {
          if (typeof m !== "string" || !muscoliNoti.has(m)) {
            fail(
              `Muscolo secondario "${String(m)}" non valido. Valori validi: ` +
                `${[...muscoliNoti].sort().join(", ")}`,
            );
          }
          secondaryMuscles.push(m);
        }
      }
      const equipment: Equipment[] = [];
      if (Array.isArray(root.equipment)) {
        for (const eq of root.equipment) {
          if (typeof eq !== "string" || !attrezziNoti.has(eq)) {
            fail(
              `Attrezzo "${String(eq)}" non valido. Valori validi: ` +
                `${[...attrezziNoti].sort().join(", ")}`,
            );
          }
          equipment.push(eq);
        }
      }
      return {
        name,
        muscleGroup,
        secondaryMuscles:
          secondaryMuscles.length > 0 ? secondaryMuscles : undefined,
        equipment: equipment.length > 0 ? equipment : undefined,
        instructions: optString(root, "instructions"),
      };
    },
    preview: async (args) => {
      const lines = [
        i18n.t("assistant_tools.exercise_name_line", { name: args.name }),
        i18n.t("assistant_tools.exercise_muscle_line", {
          muscle: args.muscleGroup,
          secondary: args.secondaryMuscles?.length
            ? i18n.t("assistant_tools.exercise_secondary", {
                list: args.secondaryMuscles.join(", "),
              })
            : "",
        }),
      ];
      if (args.equipment?.length) {
        lines.push(
          i18n.t("assistant_tools.exercise_equipment_line", {
            list: args.equipment.join(", "),
          }),
        );
      }
      return {
        title: i18n.t("assistant_tools.exercise_create_title"),
        lines,
      };
    },
    execute: async (args) => {
      await createExercise({
        name: args.name,
        muscleGroup: args.muscleGroup,
        secondaryMuscles: args.secondaryMuscles ?? [],
        equipment: args.equipment ?? [],
        instructions: args.instructions,
      });
      return {
        message: i18n.t("assistant_tools.exercise_created", { name: args.name }),
      };
    },
  });

// ─── create_routine ──────────────────────────────────────────────────────────

interface RoutineDayExerciseInput {
  name: string;
  targetSets?: number;
  targetReps?: string;
  targetWeight?: number;
}

interface RoutineDayInputArg {
  name: string;
  exercises: RoutineDayExerciseInput[];
}

interface CreateRoutineArgs {
  name: string;
  days: RoutineDayInputArg[];
  notes?: string;
}

const createRoutineTool: ToolFactory = () =>
  defineTool<CreateRoutineArgs>({
    name: "create_routine",
    riskLevel: "write",
    description:
      "Create a workout routine with structured training days and exercises. " +
      "Use when user wants to create a new gym routine or training split.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the routine (e.g. 'Push Pull Legs').",
        },
        days: {
          type: "array",
          description: "Training days in the routine.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Day name (e.g. 'Push - Petto e Spalle').",
              },
              exercises: {
                type: "array",
                description: "Exercises in this day.",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Exercise name." },
                    targetSets: {
                      type: "number",
                      description: "Target sets (e.g. 3 or 4).",
                    },
                    targetReps: {
                      type: "string",
                      description: "Target reps (e.g. '8-10' or '12').",
                    },
                    targetWeight: {
                      type: "number",
                      description: "Target weight in kg, optional.",
                    },
                  },
                  required: ["name"],
                },
              },
            },
            required: ["name", "exercises"],
          },
        },
        notes: { type: "string", description: "Optional notes." },
      },
      required: ["name", "days"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const name = reqString(root, "name");
      const rawDays = reqArray(root, "days");
      const days: RoutineDayInputArg[] = rawDays.map((d, dIdx) => {
        const dayRec = asRecord(d, `Giorno [${dIdx}]`);
        const dayName = reqString(dayRec, "name");
        const rawEx = reqArray(dayRec, "exercises");
        const exercises: RoutineDayExerciseInput[] = rawEx.map((e, eIdx) => {
          const exRec = asRecord(e, `Esercizio [${eIdx}]`);
          return {
            name: reqString(exRec, "name"),
            targetSets: optPositive(exRec, "targetSets"),
            targetReps: optString(exRec, "targetReps"),
            targetWeight: optPositive(exRec, "targetWeight"),
          };
        });
        return { name: dayName, exercises };
      });
      return {
        name,
        days,
        notes: optString(root, "notes"),
      };
    },
    preview: async (args) => ({
      title: "Crea nuova scheda",
      lines: [
        `Scheda: ${args.name}`,
        ...args.days.map(
          (d) =>
            `${d.name}: ${d.exercises.map((e) => `${e.name}${e.targetSets ? ` (${e.targetSets}x${e.targetReps ?? "10"})` : ""}`).join(", ")}`,
        ),
      ],
    }),
    execute: async (args) => {
      const formattedDays = [];
      for (const day of args.days) {
        const blockExercises = [];
        for (const ex of day.exercises) {
          const found = await searchExercises({ term: ex.name, limit: 1 });
          let exerciseId: string;
          if (found.length > 0) {
            exerciseId = found[0].id;
          } else {
            exerciseId = await createExercise({
              name: ex.name,
              muscleGroup: UNKNOWN_MUSCLE_GROUP,
              secondaryMuscles: [],
              equipment: [],
            });
          }
          blockExercises.push({
            exerciseId,
            targetSets: ex.targetSets ?? 3,
            targetReps: ex.targetReps ?? "10",
            targetWeight: ex.targetWeight ?? null,
          });
        }
        formattedDays.push({
          name: day.name,
          blocks: [
            {
              kind: "single" as const,
              exercises: blockExercises,
            },
          ],
        });
      }
      await createRoutine({
        name: args.name,
        notes: args.notes,
        days: formattedDays,
      });
      return {
        message: i18n.t("assistant_tools.routine_created", { name: args.name }),
      };
    },
  });

// ─── log_workout ─────────────────────────────────────────────────────────────

interface WorkoutSetInput {
  reps: number;
  weight?: number;
  isWarmup?: boolean;
}

interface WorkoutExerciseLogInput {
  name: string;
  sets: WorkoutSetInput[];
}

interface LogWorkoutArgs {
  date: string;
  exercises: WorkoutExerciseLogInput[];
}

const logWorkout: ToolFactory = (context) =>
  defineTool<LogWorkoutArgs>({
    name: "log_workout",
    riskLevel: "write",
    description:
      "Log a workout session with exercises, sets, reps and weights for a given date. " +
      "Use when user reports completed exercises or training sets (e.g. 'ho fatto panca 3x10 a 80kg e squat 3x8 a 100kg').",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Date (YYYY-MM-DD), defaults to reference date.",
        },
        exercises: {
          type: "array",
          description: "List of exercises performed.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Exercise name." },
              sets: {
                type: "array",
                description: "Sets performed.",
                items: {
                  type: "object",
                  properties: {
                    reps: { type: "number", description: "Reps completed." },
                    weight: {
                      type: "number",
                      description: "Weight in kg (optional).",
                    },
                    isWarmup: {
                      type: "boolean",
                      description: "True if warmup set (optional).",
                    },
                  },
                  required: ["reps"],
                },
              },
            },
            required: ["name", "sets"],
          },
        },
      },
      required: ["exercises"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      const date = dateOrReference(root, context);
      const rawExercises = reqArray(root, "exercises");
      const exercises: WorkoutExerciseLogInput[] = rawExercises.map(
        (e, eIdx) => {
          const exRec = asRecord(e, `Esercizio [${eIdx}]`);
          const rawSets = reqArray(exRec, "sets");
          const sets: WorkoutSetInput[] = rawSets.map((s, sIdx) => {
            const sRec = asRecord(s, `Serie [${sIdx}]`);
            return {
              reps: reqPositive(sRec, "reps"),
              weight: optNumber(sRec, "weight"),
              isWarmup:
                typeof sRec.isWarmup === "boolean" ? sRec.isWarmup : undefined,
            };
          });
          return {
            name: reqString(exRec, "name"),
            sets,
          };
        },
      );
      return { date, exercises };
    },
    preview: async (args) => ({
      title: i18n.t("assistant_tools.workout_title"),
      lines: [
        i18n.t("assistant_tools.workout_date", { date: shortDate(args.date) }),
        ...args.exercises.map((e) =>
          i18n.t("assistant_tools.workout_line", {
            name: e.name,
            sets: i18n.t("assistant_tools.workout_sets", {
              count: e.sets.length,
            }),
            detail: e.sets
              .map(
                (s) =>
                  `${s.reps}x${s.weight ?? 0}kg${
                    s.isWarmup ? i18n.t("assistant_tools.workout_warmup") : ""
                  }`,
              )
              .join(", "),
          }),
        ),
      ],
    }),
    execute: async (args) => {
      const sessionId = await startSession({ date: args.date });
      for (const ex of args.exercises) {
        const found = await searchExercises({ term: ex.name, limit: 1 });
        let exerciseId: string;
        if (found.length > 0) {
          exerciseId = found[0].id;
        } else {
          exerciseId = await createExercise({
            name: ex.name,
            muscleGroup: UNKNOWN_MUSCLE_GROUP,
            secondaryMuscles: [],
            equipment: [],
          });
        }
        for (let i = 0; i < ex.sets.length; i++) {
          const set = ex.sets[i];
          await logSet({
            sessionId,
            exerciseId,
            setIndex: i + 1,
            reps: set.reps,
            weight: set.weight ?? null,
            isWarmup: set.isWarmup ?? false,
          });
        }
      }
      return {
        message: i18n.t("assistant_tools.workout_saved", {
          date: shortDate(args.date),
        }),
      };
    },
  });

// ─── plan_meal_entry ─────────────────────────────────────────────────────────

interface PlanMealEntryArgs {
  date: string;
  mealType: string;
  name: string;
  quantityG?: number;
  servings?: number;
}

const planMealEntry: ToolFactory = (context) =>
  defineTool<PlanMealEntryArgs>({
    name: "plan_meal_entry",
    riskLevel: "write",
    description:
      "Add a food or recipe to the weekly meal plan for a given date and meal type. " +
      "Use when user wants to plan future meals (e.g. 'pianifica per domani a pranzo 200g di riso', 'metti la pasta nel piano di giovedì').",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date (YYYY-MM-DD)." },
        mealType: {
          type: "string",
          description: "Meal type name or id (e.g. 'Pranzo', 'Cena').",
        },
        name: { type: "string", description: "Food or recipe name." },
        quantityG: {
          type: "number",
          description: "Quantity in grams (optional).",
        },
        servings: {
          type: "number",
          description: "Servings for recipe (optional).",
        },
      },
      required: ["date", "mealType", "name"],
    },
    parse: (raw) => {
      const root = asRecord(raw);
      return {
        date: dateOrReference(root, context),
        mealType: reqString(root, "mealType"),
        name: reqString(root, "name"),
        quantityG: optPositive(root, "quantityG"),
        servings: optPositive(root, "servings"),
      };
    },
    preview: async (args) => ({
      title: i18n.t("assistant_tools.plan_title"),
      lines: [
        i18n.t("assistant_tools.plan_when", {
          date: shortDate(args.date),
          meal: args.mealType,
        }),
        i18n.t("assistant_tools.plan_item", {
          name: args.name,
          quantity: args.quantityG
            ? i18n.t("assistant_tools.plan_grams", {
                grams: int(args.quantityG),
              })
            : args.servings
              ? i18n.t("assistant_tools.plan_servings", {
                  servings: servingsLabel(args.servings),
                })
              : "",
        }),
      ],
    }),
    execute: async (args) => {
      const mealTypes = await listMealTypes();
      const matched = mealTypes.find(
        (m) =>
          m.id === args.mealType ||
          m.name.toLowerCase() === args.mealType.toLowerCase(),
      );
      const mealTypeId = matched?.id ?? mealTypes[0]?.id;
      if (!mealTypeId) fail(i18n.t("assistant_tools.meal_type_not_found"));

      const resolved = await cachedResolve(context, [
        {
          name: args.name,
          quantityG: args.quantityG,
          servings: args.servings,
        },
      ]);
      const item = resolved[0];

      if (item.kind === "food") {
        await addPlanEntry({
          date: args.date,
          mealTypeId,
          foodId: item.food.id,
          quantityG:
            args.quantityG ??
            item.quantityG ??
            item.food.default_serving_g ??
            100,
        });
      } else if (item.kind === "recipe") {
        await addPlanEntry({
          date: args.date,
          mealTypeId,
          recipeId: item.recipe.id,
          servings: args.servings ?? item.servings ?? 1,
        });
      } else if (item.kind === "off") {
        const foodId = await createFood(item.food);
        await addPlanEntry({
          date: args.date,
          mealTypeId,
          foodId,
          quantityG: args.quantityG ?? item.quantityG ?? 100,
        });
      } else {
        await addPlanEntry({
          date: args.date,
          mealTypeId,
          label: args.name,
          quantityG: args.quantityG ?? 100,
        });
      }
      return {
        message: i18n.t("assistant_tools.plan_added", {
          date: shortDate(args.date),
        }),
      };
    },
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
  createCustomFood,
  createRecipeTool,
  createExerciseTool,
  createRoutineTool,
  logWorkout,
  planMealEntry,
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
