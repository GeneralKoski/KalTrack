import { chat } from "@/src/ai/client";
import {
  generateMealPlan,
  MealPlanGenerationError,
} from "@/src/ai/generateMealPlan";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { createFood } from "@/src/db/queries/foods";
import { listPlan } from "@/src/db/queries/mealPlan";
import { createRecipe } from "@/src/db/queries/recipes";
import { saveProfile, saveTargets } from "@/src/db/queries/settings";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";

jest.mock("@/src/ai/client");

const chatMock = chat as jest.MockedFunction<typeof chat>;

let db: LocalDatabase;
let pastaId: string;
let recipeId: string;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  chatMock.mockReset();

  pastaId = await createFood({
    name: "Pasta",
    brand: "Barilla",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 350, carbs: 70, protein: 12 },
  });

  recipeId = await createRecipe({
    name: "Pasta e Tonno",
    servings: 1,
    items: [{ foodId: pastaId, quantityG: 100 }],
  });

  await saveProfile({
    sex: "male",
    birthdate: "1995-05-15",
    heightCm: 180,
    activityLevel: "moderate",
    goal: "cut",
  });

  await saveTargets({
    validFrom: "2026-01-01",
    kcal: 2000,
    proteinG: 140,
    carbsG: 220,
    fatG: 60,
    steps: 10000,
  });
});

afterEach(() => __setDbForTesting(null));

const mockAiResponse = (data: unknown) => {
  chatMock.mockResolvedValue({
    content: JSON.stringify(data),
    toolCalls: [],
    usage: null,
  });
};

describe("generateMealPlan", () => {
  it("fallisce se la lista date è vuota", async () => {
    await expect(
      generateMealPlan({
        dates: [],
        dietStyle: "balanced",
      }),
    ).rejects.toThrow(MealPlanGenerationError);
  });

  it("genera e salva correttamente le voci di piano per le date specificate", async () => {
    mockAiResponse({
      days: [
        {
          date: "2026-09-02",
          items: [
            {
              mealTypeId: MEAL_TYPE_IDS.lunch,
              foodId: pastaId,
              quantityG: 120,
            },
            {
              mealTypeId: MEAL_TYPE_IDS.dinner,
              recipeId: recipeId,
              servings: 1,
            },
            {
              mealTypeId: MEAL_TYPE_IDS.snack,
              label: "Mela e noci",
            },
          ],
        },
      ],
    });

    const result = await generateMealPlan({
      dates: ["2026-09-02"],
      dietStyle: "high_protein",
      notes: "pasti veloci",
    });

    expect(result.createdCount).toBe(3);

    const plan = await listPlan("2026-09-02", "2026-09-02");
    expect(plan).toHaveLength(3);

    const lunch = plan.find((p) => p.meal_type_id === MEAL_TYPE_IDS.lunch);
    expect(lunch?.food_id).toBe(pastaId);
    expect(lunch?.quantity_g).toBe(120);

    const dinner = plan.find((p) => p.meal_type_id === MEAL_TYPE_IDS.dinner);
    expect(dinner?.recipe_id).toBe(recipeId);
    expect(dinner?.servings).toBe(1);

    const snack = plan.find((p) => p.meal_type_id === MEAL_TYPE_IDS.snack);
    expect(snack?.label).toBe("Mela e noci");
  });
});
