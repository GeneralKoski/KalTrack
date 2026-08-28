export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  sugars: number;
  fat: number;
  saturatedFat: number;
  fiber: number;
  salt: number;
}

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  sugars: 0,
  fat: 0,
  saturatedFat: 0,
  fiber: 0,
  salt: 0,
};

const KEYS = Object.keys(EMPTY_NUTRIENTS) as (keyof Nutrients)[];

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export const kcalFromMacros = (
  protein: number,
  carbs: number,
  fat: number,
): number =>
  protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat;

/** Scala valori espressi per 100 g alla quantità indicata. Quantità <= 0 -> zeri. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  if (grams <= 0) return { ...EMPTY_NUTRIENTS };
  const factor = grams / 100;
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = per100[key] * factor;
  return result;
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const result = { ...EMPTY_NUTRIENTS };
  for (const item of items) {
    for (const key of KEYS) result[key] += item[key];
  }
  return result;
}

export function roundNutrients(n: Nutrients, decimals = 1): Nutrients {
  const factor = 10 ** decimals;
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = Math.round(n[key] * factor) / factor;
  return result;
}

export interface RecipeNode {
  servings: number;
  items: RecipeItemNode[];
}

/**
 * Un ingrediente-alimento si conta in grammi, un ingrediente-ricetta in
 * porzioni: l'unità resta non ambigua a ogni livello di annidamento.
 */
export type RecipeItemNode =
  | { kind: "food"; per100: Nutrients; grams: number }
  | { kind: "recipe"; child: RecipeNode; servings: number };

/** Valori nutrizionali dell'intera ricetta (tutte le porzioni). */
export function recipeTotals(node: RecipeNode): Nutrients {
  return sumNutrients(
    node.items.map((item) =>
      item.kind === "food"
        ? scaleNutrients(item.per100, item.grams)
        : scalePortions(recipePerServing(item.child), item.servings),
    ),
  );
}

/** Valori di una singola porzione. Con servings <= 0 la ricetta vale 1 porzione. */
export function recipePerServing(node: RecipeNode): Nutrients {
  const servings = node.servings > 0 ? node.servings : 1;
  const totals = recipeTotals(node);
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = totals[key] / servings;
  return result;
}

function scalePortions(perServing: Nutrients, servings: number): Nutrients {
  if (servings <= 0) return { ...EMPTY_NUTRIENTS };
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = perServing[key] * servings;
  return result;
}
