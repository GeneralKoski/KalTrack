import {
  EMPTY_NUTRIENTS,
  kcalFromMacros,
  recipePerServing,
  recipeTotals,
  roundNutrients,
  scaleNutrients,
  sumNutrients,
  type Nutrients,
  type RecipeNode,
} from "@/src/domain/nutrition";

const nutrients = (partial: Partial<Nutrients>): Nutrients => ({
  ...EMPTY_NUTRIENTS,
  ...partial,
});

// Petto di pollo crudo, valori per 100 g.
const CHICKEN = nutrients({ kcal: 165, protein: 31, carbs: 0, fat: 3.6 });
// Riso bianco crudo, valori per 100 g.
const RICE = nutrients({ kcal: 358, protein: 7, carbs: 79, fat: 0.6, fiber: 1.4 });

describe("scaleNutrients", () => {
  it("scala i valori per 100 g alla quantità richiesta", () => {
    const result = scaleNutrients(CHICKEN, 150);
    expect(result.kcal).toBeCloseTo(247.5);
    expect(result.protein).toBeCloseTo(46.5);
    expect(result.fat).toBeCloseTo(5.4);
  });

  it("con 0 grammi ritorna tutti zeri", () => {
    expect(scaleNutrients(CHICKEN, 0)).toEqual(EMPTY_NUTRIENTS);
  });

  it("con grammi negativi ritorna zeri invece di valori negativi", () => {
    expect(scaleNutrients(CHICKEN, -50)).toEqual(EMPTY_NUTRIENTS);
  });

  it("non muta l'oggetto di partenza", () => {
    const source = nutrients({ kcal: 100 });
    scaleNutrients(source, 250);
    expect(source.kcal).toBe(100);
  });
});

describe("sumNutrients", () => {
  it("somma campo per campo", () => {
    const result = sumNutrients([
      scaleNutrients(CHICKEN, 100),
      scaleNutrients(RICE, 100),
    ]);
    expect(result.kcal).toBeCloseTo(523);
    expect(result.protein).toBeCloseTo(38);
    expect(result.fiber).toBeCloseTo(1.4);
  });

  it("su lista vuota ritorna zeri", () => {
    expect(sumNutrients([])).toEqual(EMPTY_NUTRIENTS);
  });
});

describe("kcalFromMacros", () => {
  it("usa 4/4/9 kcal per grammo", () => {
    expect(kcalFromMacros(30, 50, 10)).toBe(30 * 4 + 50 * 4 + 10 * 9);
  });
});

describe("roundNutrients", () => {
  it("arrotonda a un decimale per default", () => {
    const result = roundNutrients(nutrients({ kcal: 247.4999, protein: 46.55 }));
    expect(result.kcal).toBe(247.5);
    expect(result.protein).toBe(46.6);
  });

  it("accetta un numero di decimali diverso", () => {
    expect(roundNutrients(nutrients({ kcal: 247.456 }), 2).kcal).toBe(247.46);
  });
});

describe("recipeTotals", () => {
  it("somma gli ingredienti scalati", () => {
    const recipe: RecipeNode = {
      servings: 2,
      items: [
        { kind: "food", per100: CHICKEN, grams: 200 },
        { kind: "food", per100: RICE, grams: 100 },
      ],
    };
    const totals = recipeTotals(recipe);
    expect(totals.kcal).toBeCloseTo(330 + 358);
    expect(totals.protein).toBeCloseTo(62 + 7);
  });

  it("include le ricette annidate contate a porzioni", () => {
    const base: RecipeNode = {
      servings: 4,
      items: [{ kind: "food", per100: RICE, grams: 400 }],
    };
    // base: 1432 kcal totali, 358 kcal a porzione.
    const outer: RecipeNode = {
      servings: 1,
      items: [
        { kind: "recipe", child: base, servings: 2 },
        { kind: "food", per100: CHICKEN, grams: 100 },
      ],
    };
    expect(recipeTotals(outer).kcal).toBeCloseTo(358 * 2 + 165);
  });

  it("regge due livelli di annidamento", () => {
    const level0: RecipeNode = {
      servings: 2,
      items: [{ kind: "food", per100: RICE, grams: 200 }],
    };
    const level1: RecipeNode = {
      servings: 1,
      items: [{ kind: "recipe", child: level0, servings: 1 }],
    };
    const level2: RecipeNode = {
      servings: 1,
      items: [{ kind: "recipe", child: level1, servings: 1 }],
    };
    expect(recipeTotals(level2).kcal).toBeCloseTo(358);
  });

  it("su una ricetta senza ingredienti ritorna zeri", () => {
    expect(recipeTotals({ servings: 2, items: [] })).toEqual(EMPTY_NUTRIENTS);
  });

  it("una ricetta annidata con 0 porzioni non contribuisce", () => {
    const base: RecipeNode = {
      servings: 2,
      items: [{ kind: "food", per100: RICE, grams: 200 }],
    };
    const outer: RecipeNode = {
      servings: 1,
      items: [{ kind: "recipe", child: base, servings: 0 }],
    };
    expect(recipeTotals(outer)).toEqual(EMPTY_NUTRIENTS);
  });
});

describe("recipePerServing", () => {
  it("divide i totali per il numero di porzioni", () => {
    const recipe: RecipeNode = {
      servings: 4,
      items: [{ kind: "food", per100: RICE, grams: 400 }],
    };
    expect(recipePerServing(recipe).kcal).toBeCloseTo(358);
  });

  it("tratta 0 porzioni come 1 invece di dividere per zero", () => {
    const recipe: RecipeNode = {
      servings: 0,
      items: [{ kind: "food", per100: RICE, grams: 100 }],
    };
    expect(recipePerServing(recipe).kcal).toBeCloseTo(358);
  });

  it("gestisce porzioni frazionarie", () => {
    const recipe: RecipeNode = {
      servings: 2.5,
      items: [{ kind: "food", per100: RICE, grams: 250 }],
    };
    expect(recipePerServing(recipe).kcal).toBeCloseTo(358);
  });
});
