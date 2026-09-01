import { chat } from "@/src/ai/client";
import { MODELS } from "@/src/ai/config";
import { AiResponseError } from "@/src/ai/errors";
import { newId, nowIso } from "@/src/db/ids";
import { getDb } from "@/src/db/index";
import { listMealTypes } from "@/src/db/queries/diary";
import { searchFoods } from "@/src/db/queries/foods";
import { searchRecipes } from "@/src/db/queries/recipes";
import { getProfile, getTargetsFor } from "@/src/db/queries/settings";
import type { FoodRow, MealTypeRow, RecipeRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";

export type DietStyle =
  | "balanced"
  | "high_protein"
  | "low_carb"
  | "keto"
  | "vegetarian"
  | "quick_prep";

export interface MealPlanPreferences {
  dates: string[];
  dietStyle: DietStyle;
  targetKcal?: number;
  targetProteinG?: number;
  targetCarbsG?: number;
  targetFatG?: number;
  useSavedItems?: boolean;
  notes?: string;
}

export class MealPlanGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MealPlanGenerationError";
  }
}

export interface GeneratedPlanItem {
  mealTypeId: string;
  foodId?: string | null;
  recipeId?: string | null;
  label?: string | null;
  quantityG?: number | null;
  servings?: number | null;
}

export interface GeneratedDayPlan {
  date: string;
  items: GeneratedPlanItem[];
}

const DIET_STYLE_DESCRIPTIONS: Record<DietStyle, string> = {
  balanced: "Dieta equilibrata e bilanciata in stile mediterraneo",
  high_protein:
    "Dieta iperproteica con focus sul mantenimento e crescita muscolare",
  low_carb:
    "Dieta a ridotto apporto di carboidrati, con più grassi sani e proteine",
  keto: "Dieta chetogenica (carboidrati molto bassi, grassi alti, proteine moderate)",
  vegetarian: "Dieta vegetariana bilanciata (senza carne né pesce)",
  quick_prep: "Pasti semplici, veloci ed efficienti da preparare o trasportare",
};

const SYSTEM_PROMPT = `You are an expert nutritionist and meal planner building a realistic, nutritious, and balanced meal plan for the specified dates.
You receive the user's daily calorie and macronutrient targets, profile goal, available meal types, and optional catalogs of saved foods and recipes.

Rules:
1. For EACH date requested in the input, produce a complete meal plan covering the user's available meal types (Breakfast, Lunch, Dinner, Snacks, etc.).
2. The total daily calories and macros (protein, carbs, fats) for each day should reasonably align with the target daily calories and macronutrient ratios.
3. Distribute meals realistically across the day (e.g. 20-25% Breakfast, 35-40% Lunch, 30-35% Dinner, 10-15% Snacks).
4. Whenever appropriate, prioritize using existing foods (via foodId and realistic quantityG in grams) or recipes (via recipeId and servings) from the provided catalogs.
5. If an item is not in the catalogs, provide a concrete Italian label (e.g. "Riso basmati con salmone e zucchine", "Yogurt greco con noci e miele") with approximate quantityG if applicable.
6. Ensure each item specifies a valid mealTypeId matching one of the provided meal types.
7. Output Italian descriptions for any labels.

Reply with a single JSON object and nothing else:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "items": [
        {
          "mealTypeId": "<meal_type_id>",
          "foodId": "<food_id_from_catalog_or_null>",
          "recipeId": "<recipe_id_from_catalog_or_null>",
          "label": "<italian_name_if_not_using_id_or_null>",
          "quantityG": 150,
          "servings": 1
        }
      ]
    }
  ]
}`;

export async function generateMealPlan(
  preferences: MealPlanPreferences,
): Promise<{ createdCount: number }> {
  if (preferences.dates.length === 0) {
    throw new MealPlanGenerationError(
      "Nessuna data specificata per la generazione.",
    );
  }

  const firstDate = preferences.dates[0];
  const [profile, targets, mealTypes, foods, recipes] = await Promise.all([
    getProfile(),
    getTargetsFor(firstDate),
    listMealTypes(),
    preferences.useSavedItems !== false
      ? searchFoods("", 60)
      : Promise.resolve([] as FoodRow[]),
    preferences.useSavedItems !== false
      ? searchRecipes("", 30)
      : Promise.resolve([] as RecipeRow[]),
  ]);

  if (mealTypes.length === 0) {
    throw new MealPlanGenerationError("Nessun tipo di pasto configurato.");
  }

  const targetKcal = preferences.targetKcal ?? targets?.kcal ?? 2000;
  const targetProtein = preferences.targetProteinG ?? targets?.protein_g ?? 120;
  const targetCarbs = preferences.targetCarbsG ?? targets?.carbs_g ?? 220;
  const targetFat = preferences.targetFatG ?? targets?.fat_g ?? 65;

  const mealTypesContext = mealTypes.map((mt: MealTypeRow) => ({
    id: mt.id,
    name: mt.name,
  }));

  const foodsContext = foods.slice(0, 60).map((f: FoodRow) => ({
    id: f.id,
    name: f.name,
    brand: f.brand,
    kcal_per_100: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
  }));

  const recipesContext = recipes.slice(0, 30).map((r: RecipeRow) => ({
    id: r.id,
    name: r.name,
    servings: r.servings,
  }));

  const userContext = {
    dates: preferences.dates,
    dietStyle:
      DIET_STYLE_DESCRIPTIONS[preferences.dietStyle] ?? preferences.dietStyle,
    targets: {
      kcal: targetKcal,
      proteinG: targetProtein,
      carbsG: targetCarbs,
      fatG: targetFat,
    },
    userGoal: profile?.goal ?? "mantenimento",
    activityLevel: profile?.activity_level ?? "moderata",
    notes: preferences.notes?.trim() || undefined,
    availableMealTypes: mealTypesContext,
    savedFoodsCatalog: foodsContext.length > 0 ? foodsContext : undefined,
    savedRecipesCatalog: recipesContext.length > 0 ? recipesContext : undefined,
  };

  const response = await chat({
    capability: "meal_plan_generation",
    model: MODELS.assistant,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Generate a meal plan based on these parameters:\n${JSON.stringify(userContext, null, 2)}`,
      },
    ],
    temperature: 0.4,
  });

  if (!response.content) {
    throw new MealPlanGenerationError(
      "Il modello non ha restituito alcuna risposta.",
    );
  }

  let parsed: { days?: GeneratedDayPlan[] };
  try {
    const raw = response.content.trim();
    const jsonStr = raw.startsWith("```")
      ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : raw;
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    logger.error(
      "[generateMealPlan] JSON parsing error",
      error,
      response.content,
    );
    throw new AiResponseError("Risposta del modello non valida come JSON.");
  }

  if (!parsed.days || !Array.isArray(parsed.days) || parsed.days.length === 0) {
    throw new MealPlanGenerationError(
      "Il piano generato non contiene giornate valide.",
    );
  }

  const validMealTypeIds = new Set(mealTypes.map((mt) => mt.id));
  const validFoodIds = new Set(foods.map((f) => f.id));
  const validRecipeIds = new Set(recipes.map((r) => r.id));

  const db = await getDb();
  const now = nowIso();
  let createdCount = 0;

  await db.withTransactionAsync(async () => {
    for (const day of parsed.days!) {
      if (!day.date || !preferences.dates.includes(day.date)) continue;

      // Svuota piano esistente per il giorno
      await db.runAsync(
        `UPDATE meal_plan_entries SET deleted_at = ?, updated_at = ?
         WHERE date = ? AND deleted_at IS NULL`,
        [now, now, day.date],
      );

      if (!Array.isArray(day.items)) continue;

      for (let i = 0; i < day.items.length; i++) {
        const item = day.items[i];
        if (!item.mealTypeId || !validMealTypeIds.has(item.mealTypeId)) {
          // Assegna il primo tipo di pasto se non valido
          item.mealTypeId = mealTypes[0].id;
        }

        const foodId =
          item.foodId && validFoodIds.has(item.foodId) ? item.foodId : null;
        const recipeId =
          item.recipeId && validRecipeIds.has(item.recipeId)
            ? item.recipeId
            : null;
        let label = item.label?.trim() || null;

        if (!foodId && !recipeId && !label) {
          continue;
        }

        const quantityG = foodId
          ? item.quantityG && item.quantityG > 0
            ? item.quantityG
            : 100
          : null;
        const servings = recipeId
          ? item.servings && item.servings > 0
            ? item.servings
            : 1
          : null;

        await db.runAsync(
          `INSERT INTO meal_plan_entries (
             id, date, meal_type_id, recipe_id, food_id, label,
             quantity_g, servings, sort, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            day.date,
            item.mealTypeId,
            recipeId,
            foodId,
            label,
            quantityG,
            servings,
            i,
            now,
            now,
          ],
        );
        createdCount += 1;
      }
    }
  });

  return { createdCount };
}
