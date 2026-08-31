import {
  EMPTY_NUTRIENTS,
  kcalFromMacros,
  macroSlices,
  recipePerServing,
  recipeTotals,
  roundNutrients,
  per100FromPortion,
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

describe("per100FromPortion", () => {
  it("riporta a 100 g i valori assoluti di una porzione", () => {
    const porzione = scaleNutrients(CHICKEN, 150);
    const per100 = per100FromPortion(porzione, 150);
    expect(per100.kcal).toBeCloseTo(CHICKEN.kcal);
    expect(per100.protein).toBeCloseTo(CHICKEN.protein);
  });

  // E' il motivo per cui esiste: la stima da foto da' valori assoluti, e per
  // cambiare i grammi servono valori per 100 g stabili da cui riscalare.
  it("e' l'inverso di scaleNutrients", () => {
    const per100 = per100FromPortion(scaleNutrients(CHICKEN, 237), 237);
    const tornata = scaleNutrients(per100, 237);
    expect(tornata.kcal).toBeCloseTo(scaleNutrients(CHICKEN, 237).kcal);
  });

  it("con 0 grammi ritorna zeri invece di dividere per zero", () => {
    expect(per100FromPortion(nutrients({ kcal: 300 }), 0)).toEqual(
      EMPTY_NUTRIENTS,
    );
  });

  it("con grammi negativi ritorna zeri", () => {
    expect(per100FromPortion(nutrients({ kcal: 300 }), -10)).toEqual(
      EMPTY_NUTRIENTS,
    );
  });

  it("non muta l'oggetto di partenza", () => {
    const source = nutrients({ kcal: 100 });
    per100FromPortion(source, 250);
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
        { kind: "food", foodId: "f-pollo", label: "Pollo", per100: CHICKEN, grams: 200 },
        { kind: "food", foodId: "f-riso", label: "Riso", per100: RICE, grams: 100 },
      ],
    };
    const totals = recipeTotals(recipe);
    expect(totals.kcal).toBeCloseTo(330 + 358);
    expect(totals.protein).toBeCloseTo(62 + 7);
  });

  it("include le ricette annidate contate a porzioni", () => {
    const base: RecipeNode = {
      servings: 4,
      items: [{ kind: "food", foodId: "f-riso", label: "Riso", per100: RICE, grams: 400 }],
    };
    // base: 1432 kcal totali, 358 kcal a porzione.
    const outer: RecipeNode = {
      servings: 1,
      items: [
        { kind: "recipe", child: base, servings: 2 },
        { kind: "food", foodId: "f-chicken", label: "Chicken", per100: CHICKEN, grams: 100 },
      ],
    };
    expect(recipeTotals(outer).kcal).toBeCloseTo(358 * 2 + 165);
  });

  it("regge due livelli di annidamento", () => {
    const level0: RecipeNode = {
      servings: 2,
      items: [{ kind: "food", foodId: "f-rice", label: "Rice", per100: RICE, grams: 200 }],
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
      items: [{ kind: "food", foodId: "f-rice", label: "Rice", per100: RICE, grams: 200 }],
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
      items: [{ kind: "food", foodId: "f-riso", label: "Riso", per100: RICE, grams: 400 }],
    };
    expect(recipePerServing(recipe).kcal).toBeCloseTo(358);
  });

  it("tratta 0 porzioni come 1 invece di dividere per zero", () => {
    const recipe: RecipeNode = {
      servings: 0,
      items: [{ kind: "food", foodId: "f-riso", label: "Riso", per100: RICE, grams: 100 }],
    };
    expect(recipePerServing(recipe).kcal).toBeCloseTo(358);
  });

  it("gestisce porzioni frazionarie", () => {
    const recipe: RecipeNode = {
      servings: 2.5,
      items: [{ kind: "food", foodId: "f-rice", label: "Rice", per100: RICE, grams: 250 }],
    };
    expect(recipePerServing(recipe).kcal).toBeCloseTo(358);
  });
});

describe("macroSlices", () => {
  const giornata = (over: Partial<Nutrients>): Nutrients => ({
    ...EMPTY_NUTRIENTS,
    ...over,
  });

  it("divide l'anello per il peso energetico dei macro, non per i grammi", () => {
    // 100 g di proteine (400 kcal) e 100 g di grassi (900 kcal): in grammi
    // sono uguali, in calorie il grasso pesa piu' del doppio.
    const slices = macroSlices(
      giornata({ kcal: 1300, protein: 100, carbs: 0, fat: 100 }),
      1300,
    );

    const per = (kind: string) =>
      slices.find((s) => s.kind === kind)?.fraction ?? 0;

    expect(per("protein")).toBeCloseTo(400 / 1300, 5);
    expect(per("fat")).toBeCloseTo(900 / 1300, 5);
    expect(per("carbs")).toBe(0);
  });

  it("i pezzi riempiono esattamente la parte consumata", () => {
    const slices = macroSlices(
      giornata({ kcal: 1000, protein: 50, carbs: 100, fat: 44.4 }),
      2000,
    );
    const totale = slices.reduce((sum, s) => sum + s.fraction, 0);

    // Mille su duemila: mezzo anello, diviso fra i macro.
    expect(totale).toBeCloseTo(0.5, 3);
  });

  /**
   * Le calorie di una riga sono uno snapshot a se': alcol, fibra, alimenti
   * incompleti e arrotondamenti fanno si' che i macro non tornino sempre.
   * Quella differenza si mostra grigia, non si ridistribuisce sui macro.
   */
  it("quel che i macro non spiegano resta un pezzo a parte", () => {
    const slices = macroSlices(
      giornata({ kcal: 1000, protein: 0, carbs: 100, fat: 0 }),
      1000,
    );

    const other = slices.find((s) => s.kind === "other");
    expect(other?.fraction).toBeCloseTo(0.6, 5);
  });

  it("non inventa un pezzo grigio per un arrotondamento", () => {
    const slices = macroSlices(
      giornata({ kcal: 1002, protein: 50, carbs: 100, fat: 44.4 }),
      2000,
    );

    expect(slices.some((s) => s.kind === "other")).toBe(false);
  });

  it("oltre l'obiettivo l'anello e' pieno e non di piu'", () => {
    const slices = macroSlices(
      giornata({ kcal: 3000, protein: 150, carbs: 300, fat: 133.3 }),
      2000,
    );
    const totale = slices.reduce((sum, s) => sum + s.fraction, 0);

    expect(totale).toBeCloseTo(1, 3);
  });

  it("senza obiettivo o senza calorie non c'e' niente da dividere", () => {
    expect(macroSlices(giornata({ kcal: 1500, protein: 100 }), null)).toEqual([]);
    expect(macroSlices(giornata({ kcal: 0 }), 2000)).toEqual([]);
  });

  it("se i macro dicono piu' calorie del totale, comanda il totale", () => {
    // Un caso che capita con dati sporchi: i grammi sommano piu' del kcal.
    const slices = macroSlices(
      giornata({ kcal: 500, protein: 100, carbs: 100, fat: 100 }),
      1000,
    );
    const totale = slices.reduce((sum, s) => sum + s.fraction, 0);

    expect(totale).toBeCloseTo(0.5, 5);
    expect(slices.some((s) => s.kind === "other")).toBe(false);
  });
});
