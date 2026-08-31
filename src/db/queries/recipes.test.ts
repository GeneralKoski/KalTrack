import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createFood } from "@/src/db/queries/foods";
import {
  buildRecipeTree,
  createRecipe,
  createRecipeFromComposition,
  deleteRecipe,
  getRecipeItems,
  incrementRecipeUsage,
  MAX_RECIPE_DEPTH,
  RecipeCycleError,
  RecipeDepthError,
  searchRecipes,
  updateRecipe,
} from "@/src/db/queries/recipes";
import {
  EMPTY_NUTRIENTS,
  recipePerServing,
  recipeTotals,
} from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;
let riceId: string;
let chickenId: string;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  riceId = await createFood({
    name: "Riso",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 358, protein: 7, carbs: 79, fat: 0.6 },
  });
  chickenId = await createFood({
    name: "Pollo",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 165, protein: 31, fat: 3.6 },
  });
});

afterEach(() => __setDbForTesting(null));

describe("createRecipe", () => {
  it("salva ricetta e ingredienti", async () => {
    const id = await createRecipe({
      name: "Pollo e riso",
      servings: 2,
      items: [
        { foodId: riceId, quantityG: 200 },
        { foodId: chickenId, quantityG: 300 },
      ],
    });

    expect(await getRecipeItems(id)).toHaveLength(2);
  });

  it("mantiene l'ordine degli ingredienti", async () => {
    const id = await createRecipe({
      name: "Ordinata",
      servings: 1,
      items: [
        { foodId: chickenId, quantityG: 100 },
        { foodId: riceId, quantityG: 100 },
      ],
    });
    const items = await getRecipeItems(id);
    expect(items[0].food_id).toBe(chickenId);
    expect(items[1].food_id).toBe(riceId);
  });

  it("salva il nome normalizzato", async () => {
    const id = await createRecipe({ name: "Purè", servings: 1, items: [] });
    const rows = await searchRecipes("pure");
    expect(rows.map((r) => r.id)).toContain(id);
  });

  it("accetta una ricetta senza ingredienti", async () => {
    const id = await createRecipe({ name: "Vuota", servings: 1, items: [] });
    expect(await getRecipeItems(id)).toHaveLength(0);
  });
});

describe("buildRecipeTree", () => {
  it("costruisce l'albero con i valori degli alimenti", async () => {
    const id = await createRecipe({
      name: "Pollo e riso",
      servings: 2,
      items: [
        { foodId: riceId, quantityG: 200 },
        { foodId: chickenId, quantityG: 300 },
      ],
    });

    const tree = await buildRecipeTree(id);
    expect(tree).not.toBeNull();
    expect(recipeTotals(tree!).kcal).toBeCloseTo(358 * 2 + 165 * 3);
    expect(recipePerServing(tree!).kcal).toBeCloseTo((358 * 2 + 165 * 3) / 2);
  });

  it("risolve le ricette annidate", async () => {
    const baseId = await createRecipe({
      name: "Base riso",
      servings: 4,
      items: [{ foodId: riceId, quantityG: 400 }],
    });
    const outerId = await createRecipe({
      name: "Piatto completo",
      servings: 1,
      items: [
        { childRecipeId: baseId, servings: 2 },
        { foodId: chickenId, quantityG: 100 },
      ],
    });

    const tree = await buildRecipeTree(outerId);
    expect(recipeTotals(tree!).kcal).toBeCloseTo(358 * 2 + 165);
  });

  it("ignora gli ingredienti il cui alimento è stato cancellato", async () => {
    const id = await createRecipe({
      name: "Con buco",
      servings: 1,
      items: [{ foodId: riceId, quantityG: 100 }],
    });
    await db.runAsync("UPDATE foods SET deleted_at = ? WHERE id = ?", [
      "2026-01-01T00:00:00.000Z",
      riceId,
    ]);

    // L'alimento non c'è più: la ricetta resta apribile, senza quella riga.
    const tree = await buildRecipeTree(id);
    expect(tree!.items).toHaveLength(0);
  });

  it("ignora una ricetta figlia cancellata", async () => {
    const childId = await createRecipe({
      name: "Figlia",
      servings: 1,
      items: [{ foodId: riceId, quantityG: 100 }],
    });
    const parentId = await createRecipe({
      name: "Madre",
      servings: 1,
      items: [{ childRecipeId: childId, servings: 1 }],
    });
    await deleteRecipe(childId);

    const tree = await buildRecipeTree(parentId);
    expect(tree!.items).toHaveLength(0);
  });

  it("su ricetta inesistente ritorna null", async () => {
    expect(await buildRecipeTree("non-esiste")).toBeNull();
  });
});

describe("protezione dai cicli", () => {
  it("rifiuta una ricetta che contiene se stessa", async () => {
    const id = await createRecipe({ name: "A", servings: 1, items: [] });
    await expect(
      updateRecipe(id, {
        name: "A",
        servings: 1,
        items: [{ childRecipeId: id, servings: 1 }],
      }),
    ).rejects.toBeInstanceOf(RecipeCycleError);
  });

  it("rifiuta un ciclo indiretto A -> B -> A", async () => {
    const aId = await createRecipe({ name: "A", servings: 1, items: [] });
    const bId = await createRecipe({
      name: "B",
      servings: 1,
      items: [{ childRecipeId: aId, servings: 1 }],
    });

    await expect(
      updateRecipe(aId, {
        name: "A",
        servings: 1,
        items: [{ childRecipeId: bId, servings: 1 }],
      }),
    ).rejects.toBeInstanceOf(RecipeCycleError);
  });

  it("un ciclo rifiutato non lascia scritture a metà", async () => {
    const aId = await createRecipe({
      name: "A",
      servings: 1,
      items: [{ foodId: riceId, quantityG: 100 }],
    });
    const bId = await createRecipe({
      name: "B",
      servings: 1,
      items: [{ childRecipeId: aId, servings: 1 }],
    });

    await expect(
      updateRecipe(aId, {
        name: "A modificata",
        servings: 9,
        items: [{ childRecipeId: bId, servings: 1 }],
      }),
    ).rejects.toBeInstanceOf(RecipeCycleError);

    // La validazione gira PRIMA della scrittura: A deve essere intatta.
    const tree = await buildRecipeTree(aId);
    expect(tree!.servings).toBe(1);
    expect(tree!.items).toHaveLength(1);
  });

  it("rifiuta un annidamento più profondo del limite", async () => {
    // Costruisce una catena profonda esattamente MAX_RECIPE_DEPTH livelli...
    let previous = await createRecipe({ name: "L0", servings: 1, items: [] });
    for (let level = 1; level < MAX_RECIPE_DEPTH; level++) {
      previous = await createRecipe({
        name: `L${level}`,
        servings: 1,
        items: [{ childRecipeId: previous, servings: 1 }],
      });
    }
    // ...e verifica che il livello successivo venga rifiutato.
    await expect(
      createRecipe({
        name: "troppo profonda",
        servings: 1,
        items: [{ childRecipeId: previous, servings: 1 }],
      }),
    ).rejects.toBeInstanceOf(RecipeDepthError);
  });

  it("accetta l'annidamento fino al limite", async () => {
    let previous = await createRecipe({ name: "N0", servings: 1, items: [] });
    for (let level = 1; level < MAX_RECIPE_DEPTH; level++) {
      previous = await createRecipe({
        name: `N${level}`,
        servings: 1,
        items: [{ childRecipeId: previous, servings: 1 }],
      });
    }
    expect(await buildRecipeTree(previous)).not.toBeNull();
  });
});

describe("updateRecipe", () => {
  it("riscrive gli ingredienti per intero", async () => {
    const id = await createRecipe({
      name: "R",
      servings: 1,
      items: [{ foodId: riceId, quantityG: 100 }],
    });
    await updateRecipe(id, {
      name: "R",
      servings: 1,
      items: [{ foodId: chickenId, quantityG: 200 }],
    });

    const items = await getRecipeItems(id);
    expect(items).toHaveLength(1);
    expect(items[0].food_id).toBe(chickenId);
  });

  it("aggiorna nome, porzioni e note", async () => {
    const id = await createRecipe({ name: "Vecchio", servings: 1, items: [] });
    await updateRecipe(id, {
      name: "Nuovo",
      servings: 4,
      notes: "con più sale",
      items: [],
    });

    const rows = await searchRecipes("nuovo");
    expect(rows[0].servings).toBe(4);
    expect(rows[0].notes).toBe("con più sale");
  });
});

describe("searchRecipes", () => {
  it("cerca ignorando accenti e maiuscole", async () => {
    await createRecipe({ name: "Purè di patate", servings: 2, items: [] });
    expect((await searchRecipes("PURE")).map((r) => r.name)).toEqual([
      "Purè di patate",
    ]);
  });

  it("non ritorna le ricette cancellate", async () => {
    const id = await createRecipe({ name: "Vecchia", servings: 1, items: [] });
    await deleteRecipe(id);
    expect(await searchRecipes("vecchia")).toHaveLength(0);
  });

  it("ordina per utilizzo", async () => {
    const a = await createRecipe({ name: "Alfa", servings: 1, items: [] });
    const b = await createRecipe({ name: "Beta", servings: 1, items: [] });
    await incrementRecipeUsage(b);

    expect((await searchRecipes("")).map((r) => r.id)).toEqual([b, a]);
  });
});

describe("createRecipeFromComposition", () => {
  it("crea una ricetta dalla composizione di una voce", async () => {
    const salame = await createFood({
      name: "Salame",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 400 },
    });

    const recipeId = await createRecipeFromComposition({
      name: "Crepes al salame",
      servings: 1,
      composition: {
        edited: true,
        items: [
          {
            foodId: salame,
            label: "Salame",
            quantityG: 40,
            per100: { ...EMPTY_NUTRIENTS, kcal: 400 },
          },
        ],
      },
    });

    const items = await getRecipeItems(recipeId);
    expect(items).toHaveLength(1);
    expect(items[0].quantity_g).toBeCloseTo(40);
  });

  /*
   * Un ingrediente scritto a mano dentro una voce puo' non avere un alimento
   * dietro. Senza alimento non esiste una riga di ricetta - il CHECK della
   * tabella la rifiuterebbe - quindi si salta invece di far fallire tutto il
   * salvataggio per una riga.
   */
  it("salta gli ingredienti senza alimento", async () => {
    const recipeId = await createRecipeFromComposition({
      name: "Solo testo",
      servings: 1,
      composition: {
        edited: true,
        items: [
          {
            foodId: null,
            label: "Qualcosa",
            quantityG: 10,
            per100: { ...EMPTY_NUTRIENTS },
          },
        ],
      },
    });

    expect(await getRecipeItems(recipeId)).toHaveLength(0);
  });

  it("conserva le porzioni della voce, cosi' i valori per porzione restano quelli", async () => {
    const salame = await createFood({
      name: "Salame",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 400 },
    });

    const recipeId = await createRecipeFromComposition({
      name: "Due porzioni",
      servings: 2,
      composition: {
        edited: false,
        items: [
          {
            foodId: salame,
            label: "Salame",
            quantityG: 100,
            per100: { ...EMPTY_NUTRIENTS, kcal: 400 },
          },
        ],
      },
    });

    const tree = await buildRecipeTree(recipeId);
    if (!tree) throw new Error("albero atteso");
    // 400 kcal in due porzioni.
    expect(recipePerServing(tree).kcal).toBeCloseTo(200);
  });
});
