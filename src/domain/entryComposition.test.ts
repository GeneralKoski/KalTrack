import {
  addComponent,
  componentNutrients,
  compositionNutrients,
  flattenRecipe,
  parseComposition,
  removeComponent,
  rescaleComposition,
  serializeComposition,
  setComponentGrams,
  type EntryComponent,
  type EntryComposition,
} from "@/src/domain/entryComposition";
import {
  EMPTY_NUTRIENTS,
  type Nutrients,
  type RecipeNode,
} from "@/src/domain/nutrition";

const nutrients = (partial: Partial<Nutrients>): Nutrients => ({
  ...EMPTY_NUTRIENTS,
  ...partial,
});

const ZUCCHINE = nutrients({ kcal: 17, carbs: 3 });
const FARINA = nutrients({ kcal: 340, carbs: 70 });

const CREPES: RecipeNode = {
  servings: 2,
  items: [
    { kind: "food", foodId: "z", label: "Zucchine", per100: ZUCCHINE, grams: 140 },
    { kind: "food", foodId: "f", label: "Farina", per100: FARINA, grams: 70 },
  ],
};

const composizione = (
  items: EntryComponent[],
  edited = false,
): EntryComposition => ({ edited, items });

describe("flattenRecipe", () => {
  it("copia gli ingredienti con etichetta e valori per 100 g", () => {
    const items = flattenRecipe(CREPES, 2);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      foodId: "z",
      label: "Zucchine",
      quantityG: 140,
      per100: ZUCCHINE,
    });
  });

  // La ricetta rende 2 porzioni: mangiarne una vuol dire meta' di tutto.
  it("scala alle porzioni mangiate", () => {
    const items = flattenRecipe(CREPES, 1);
    expect(items[0].quantityG).toBe(70);
    expect(items[1].quantityG).toBe(35);
  });

  it("appiattisce una sotto-ricetta invece di annidarla", () => {
    const conSalsa: RecipeNode = {
      servings: 1,
      items: [
        { kind: "food", foodId: "f", label: "Farina", per100: FARINA, grams: 100 },
        { kind: "recipe", child: CREPES, servings: 1 },
      ],
    };

    const items = flattenRecipe(conSalsa, 1);

    expect(items.map((i) => i.label)).toEqual(["Farina", "Zucchine", "Farina"]);
    // Una porzione delle crepes = meta' dei suoi 140 g di zucchine.
    expect(items[1].quantityG).toBe(70);
  });

  it("con una ricetta a zero porzioni la tratta come una sola", () => {
    const items = flattenRecipe({ ...CREPES, servings: 0 }, 1);
    expect(items[0].quantityG).toBe(140);
  });
});

describe("componentNutrients", () => {
  it("scala i valori per 100 g ai grammi dell'ingrediente", () => {
    const valori = componentNutrients({
      foodId: "z",
      label: "Zucchine",
      quantityG: 200,
      per100: ZUCCHINE,
    });
    expect(valori.kcal).toBeCloseTo(34);
  });
});

describe("compositionNutrients", () => {
  it("somma gli ingredienti", () => {
    const totale = compositionNutrients(composizione(flattenRecipe(CREPES, 2)));
    // 140 g a 17 kcal/100 g piu' 70 g a 340 kcal/100 g.
    expect(totale.kcal).toBeCloseTo(23.8 + 238);
  });

  it("una composizione vuota vale zero, non NaN", () => {
    expect(compositionNutrients(composizione([]))).toEqual(EMPTY_NUTRIENTS);
  });
});

describe("rescaleComposition", () => {
  it("moltiplica ogni ingrediente", () => {
    const doppia = rescaleComposition(composizione(flattenRecipe(CREPES, 1)), 2);
    expect(doppia.items[0].quantityG).toBe(140);
    expect(doppia.items[1].quantityG).toBe(70);
  });

  // Riscalare e' un cambio di porzioni, non una modifica della composizione:
  // le crepes restano quelle della ricetta, sono solo di piu'.
  it("non marca la composizione come modificata", () => {
    const doppia = rescaleComposition(composizione(flattenRecipe(CREPES, 1)), 2);
    expect(doppia.edited).toBe(false);
  });

  it("una composizione gia' modificata resta modificata", () => {
    const partenza = composizione(flattenRecipe(CREPES, 1), true);
    expect(rescaleComposition(partenza, 2).edited).toBe(true);
  });

  it("con un fattore non positivo non cambia niente", () => {
    const partenza = composizione(flattenRecipe(CREPES, 1));
    expect(rescaleComposition(partenza, 0)).toEqual(partenza);
    expect(rescaleComposition(partenza, -1)).toEqual(partenza);
  });
});

describe("setComponentGrams", () => {
  it("cambia i grammi di un solo ingrediente", () => {
    const dopo = setComponentGrams(composizione(flattenRecipe(CREPES, 2)), 0, 160);
    expect(dopo.items[0].quantityG).toBe(160);
    expect(dopo.items[1].quantityG).toBe(70);
  });

  // Da qui viene il "modificata" accanto al nome: senza, si legge il nome della
  // ricetta e si crede di vedere la ricetta.
  it("marca la composizione come modificata", () => {
    const dopo = setComponentGrams(composizione(flattenRecipe(CREPES, 2)), 0, 160);
    expect(dopo.edited).toBe(true);
  });

  it("su un indice inesistente non cambia niente", () => {
    const partenza = composizione(flattenRecipe(CREPES, 2));
    expect(setComponentGrams(partenza, 9, 160)).toEqual(partenza);
    expect(setComponentGrams(partenza, -1, 160)).toEqual(partenza);
  });
});

describe("removeComponent", () => {
  it("toglie l'ingrediente e marca la modifica", () => {
    const dopo = removeComponent(composizione(flattenRecipe(CREPES, 2)), 0);
    expect(dopo.items.map((i) => i.label)).toEqual(["Farina"]);
    expect(dopo.edited).toBe(true);
  });

  it("puo' svuotare la composizione", () => {
    const uno = composizione([flattenRecipe(CREPES, 2)[0]]);
    expect(removeComponent(uno, 0).items).toEqual([]);
  });

  it("su un indice inesistente non cambia niente", () => {
    const partenza = composizione(flattenRecipe(CREPES, 2));
    expect(removeComponent(partenza, 9)).toEqual(partenza);
  });
});

describe("addComponent", () => {
  it("aggiunge in coda e marca la modifica", () => {
    const salame: EntryComponent = {
      foodId: "s",
      label: "Salame piccante",
      quantityG: 40,
      per100: nutrients({ kcal: 400 }),
    };

    const dopo = addComponent(composizione(flattenRecipe(CREPES, 2)), salame);

    expect(dopo.items).toHaveLength(3);
    expect(dopo.items[2].label).toBe("Salame piccante");
    expect(dopo.edited).toBe(true);
  });
});

describe("parseComposition", () => {
  it("rilegge quel che ha scritto", () => {
    const partenza = composizione(flattenRecipe(CREPES, 2), true);
    expect(parseComposition(serializeComposition(partenza))).toEqual(partenza);
  });

  it("su NULL torna null: e' una voce che non ne ha una", () => {
    expect(parseComposition(null)).toBeNull();
    expect(parseComposition("")).toBeNull();
  });

  /*
   * JSON rotto o di una forma che non conosciamo: torna null e la voce si
   * disegna come prima. Un'eccezione qui sarebbe una schermata bianca per una
   * colonna che ha valore accessorio.
   */
  it("su JSON invalido torna null invece di lanciare", () => {
    expect(parseComposition("{non json")).toBeNull();
    expect(parseComposition("[]")).toBeNull();
    expect(parseComposition('{"items":"no"}')).toBeNull();
  });

  it("scarta gli elementi malformati e tiene i buoni", () => {
    const raw = JSON.stringify({
      edited: true,
      items: [
        { foodId: "z", label: "Zucchine", quantityG: 140, per100: ZUCCHINE },
        { label: "senza grammi", per100: ZUCCHINE },
        { label: "  ", quantityG: 10, per100: ZUCCHINE },
      ],
    });

    const letta = parseComposition(raw);

    expect(letta?.items).toHaveLength(1);
    expect(letta?.items[0].label).toBe("Zucchine");
  });

  it("un ingrediente senza alimento resta valido, con foodId a null", () => {
    const raw = JSON.stringify({
      items: [{ label: "Salame del macellaio", quantityG: 40, per100: ZUCCHINE }],
    });

    expect(parseComposition(raw)?.items[0].foodId).toBeNull();
  });

  it("riempie di zeri i nutrienti che mancano invece di lasciarli undefined", () => {
    const raw = JSON.stringify({
      items: [{ label: "Zucchine", quantityG: 100, per100: { kcal: 17 } }],
    });

    expect(parseComposition(raw)?.items[0].per100).toEqual({
      ...EMPTY_NUTRIENTS,
      kcal: 17,
    });
  });
});
