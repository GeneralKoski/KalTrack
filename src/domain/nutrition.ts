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

/**
 * L'inverso di `scaleNutrients`: da valori assoluti di una porzione ai valori
 * per 100 g.
 *
 * Serve alla stima da foto, che risponde con i valori ASSOLUTI del piatto e
 * non per 100 g. Per lasciar correggere i grammi servono valori per 100 g
 * stabili da cui riscalare ogni volta: riscalare i valori assoluti su se
 * stessi li fa derivare a ogni modifica, e tornare da 200 g a 180 g non
 * riporterebbe ai numeri di partenza.
 */
export function per100FromPortion(portion: Nutrients, grams: number): Nutrients {
  if (grams <= 0) return { ...EMPTY_NUTRIENTS };
  const factor = 100 / grams;
  const result = { ...EMPTY_NUTRIENTS };
  for (const key of KEYS) result[key] = portion[key] * factor;
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
  | {
      kind: "food";
      /**
       * Da dove viene l'ingrediente, e come si chiama.
       *
       * Servono a chi copia gli ingredienti fuori dalla ricetta - la
       * composizione di una voce del diario. Senza, l'unica etichetta possibile
       * sarebbe generica, e un elenco di "ingrediente 1, ingrediente 2" non
       * risponde a nessuna domanda. Non sono la fonte dei valori: quelli sono
       * `per100`.
       */
      foodId: string;
      label: string;
      per100: Nutrients;
      grams: number;
    }
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

/** Un pezzo dell'anello delle calorie: chi lo occupa e quanta parte ne prende. */
export interface MacroSlice {
  kind: "protein" | "carbs" | "fat" | "other";
  /** Frazione dell'intero anello, da 0 a 1. */
  fraction: number;
}

/**
 * L'anello delle calorie diviso per macronutriente.
 *
 * Le calorie sono la somma di tre cose, e l'anello lo dice: quanta parte di
 * quel che hai mangiato viene dalle proteine, quanta dai carboidrati, quanta
 * dai grassi. Ogni pezzo e' lungo quanto le calorie che quel macro porta - un
 * grammo di grasso ne vale nove, uno di proteine quattro - percio' i tre pezzi
 * non sono i tre numeri in grammi, sono il loro peso energetico.
 *
 * IL PEZZO "other" NON E' UN ERRORE DA NASCONDERE. Le calorie di una riga sono
 * uno snapshot a se' e non sempre tornano esatte con i macro: alimenti
 * incompleti, alcol, fibra, arrotondamenti. Colorare quella differenza come se
 * fosse carboidrati direbbe una cosa che non e' scritta da nessuna parte, e
 * ridistribuirla in proporzione la farebbe sparire pur essendoci.
 *
 * Il totale dei pezzi non supera mai 1: oltre l'obiettivo l'anello e' pieno, e
 * quanto si e' andati oltre lo dice il numero al centro.
 */
export function macroSlices(
  consumed: Nutrients,
  targetKcal: number | null,
): MacroSlice[] {
  if (!targetKcal || targetKcal <= 0 || consumed.kcal <= 0) return [];

  const daiMacro = {
    protein: Math.max(consumed.protein, 0) * KCAL_PER_G.protein,
    carbs: Math.max(consumed.carbs, 0) * KCAL_PER_G.carbs,
    fat: Math.max(consumed.fat, 0) * KCAL_PER_G.fat,
  };
  const sommaMacro = daiMacro.protein + daiMacro.carbs + daiMacro.fat;

  /*
   * Se i macro dichiarano piu' calorie del totale della giornata si scala
   * tutto invece di sforare: e' la stessa giornata vista in due modi, e quello
   * che comanda e' il numero di calorie mostrato al centro.
   */
  const scala = sommaMacro > consumed.kcal ? consumed.kcal / sommaMacro : 1;

  const pieno = Math.min(consumed.kcal / targetKcal, 1);
  // Quanto vale una caloria in frazione d'anello, gia' tenendo conto del
  // taglio quando si e' oltre l'obiettivo.
  const perKcal = pieno / consumed.kcal;

  const slices: MacroSlice[] = [
    { kind: "protein", fraction: daiMacro.protein * scala * perKcal },
    { kind: "carbs", fraction: daiMacro.carbs * scala * perKcal },
    { kind: "fat", fraction: daiMacro.fat * scala * perKcal },
  ];

  const restante = pieno - slices.reduce((sum, s) => sum + s.fraction, 0);
  // Sotto il mezzo punto percentuale non e' una differenza, e' un
  // arrotondamento: disegnarla farebbe comparire una scheggia grigia in ogni
  // giornata normale.
  if (restante > 0.005) {
    slices.push({ kind: "other", fraction: restante });
  }

  return slices.filter((s) => s.fraction > 0);
}
