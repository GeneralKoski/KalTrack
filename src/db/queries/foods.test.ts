import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  applyCatalogFood,
  createFood,
  deleteFood,
  detachFoodFromCatalog,
  findFoodByCatalogUid,
  getFood,
  getFoodByBarcode,
  incrementFoodUsage,
  searchFoods,
  searchMyFoods,
  toggleFoodFavorite,
  updateFood,
} from "@/src/db/queries/foods";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

const chickenInput = {
  name: "Petto di pollo",
  nutrients: { ...EMPTY_NUTRIENTS, kcal: 165, protein: 31, fat: 3.6 },
};

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("createFood", () => {
  it("salva l'alimento e ne ritorna l'id", async () => {
    const id = await createFood(chickenInput);
    const row = await getFood(id);

    expect(row?.name).toBe("Petto di pollo");
    expect(row?.kcal).toBe(165);
    expect(row?.source).toBe("user");
    expect(row?.deleted_at).toBeNull();
  });

  it("salva il nome normalizzato per la ricerca", async () => {
    const id = await createFood({ ...chickenInput, name: "Caffè Espresso" });
    expect((await getFood(id))?.name_norm).toBe("caffe espresso");
  });

  it("nasce non preferito e con zero utilizzi", async () => {
    const id = await createFood(chickenInput);
    const row = await getFood(id);
    expect(row?.is_favorite).toBe(0);
    expect(row?.usage_count).toBe(0);
  });

  it("accetta porzione di default ed etichetta", async () => {
    const id = await createFood({
      name: "Yogurt greco",
      nutrients: EMPTY_NUTRIENTS,
      defaultServingG: 150,
      servingLabel: "1 vasetto = 150 g",
    });
    const row = await getFood(id);
    expect(row?.default_serving_g).toBe(150);
    expect(row?.serving_label).toBe("1 vasetto = 150 g");
  });
});

describe("searchFoods", () => {
  beforeEach(async () => {
    await createFood(chickenInput);
    await createFood({
      name: "Riso bianco",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358, carbs: 79 },
    });
    await createFood({
      name: "Yogurt greco",
      brand: "Fage",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 57, protein: 10 },
    });
  });

  it("trova per sottostringa", async () => {
    const results = await searchFoods("poll");
    expect(results.map((r) => r.name)).toEqual(["Petto di pollo"]);
  });

  it("ignora accenti e maiuscole", async () => {
    await createFood({ name: "Caffè", nutrients: EMPTY_NUTRIENTS });
    expect((await searchFoods("CAFFE")).map((r) => r.name)).toContain("Caffè");
  });

  it("con termine vuoto ritorna tutti gli alimenti vivi", async () => {
    expect(await searchFoods("")).toHaveLength(3);
  });

  it("non ritorna gli alimenti cancellati", async () => {
    const id = await createFood({
      name: "Da buttare",
      nutrients: EMPTY_NUTRIENTS,
    });
    await deleteFood(id);
    expect(await searchFoods("buttare")).toHaveLength(0);
  });

  it("rispetta il limite", async () => {
    expect(await searchFoods("", 2)).toHaveLength(2);
  });

  it("mette i preferiti prima e poi ordina per uso", async () => {
    const rice = (await searchFoods("riso"))[0];
    const yogurt = (await searchFoods("yogurt"))[0];
    await incrementFoodUsage(rice.id);
    await incrementFoodUsage(rice.id);
    await toggleFoodFavorite(yogurt.id);

    const results = await searchFoods("");
    expect(results[0].id).toBe(yogurt.id);
    expect(results[1].id).toBe(rice.id);
  });
});

describe("la ricerca trova anche il marchio", () => {
  /**
   * Il difetto segnalato: "Formaggio spalmabile" marchio "milbona" era
   * invisibile a chi scriveva "milbona" - la ricerca guardava solo
   * `name_norm`. Tre casi, e il terzo e' quello che una WHERE allargata con
   * poca cura rompe piu' spesso: `brand` e' nullable, e `NULL LIKE '%x%'` e'
   * `NULL`, non falso.
   */
  beforeEach(async () => {
    await createFood({
      name: "Formaggio spalmabile",
      brand: "Milbona",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 250 },
    });
    await createFood({
      name: "Yogurt alla frutta",
      brand: "Milbona",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 90 },
    });
    await createFood(chickenInput); // senza marchio (brand null)
  });

  it("il marchio trova il prodotto e tutti gli altri dello stesso marchio", async () => {
    const results = await searchFoods("milbona");
    expect(results.map((r) => r.name).sort()).toEqual([
      "Formaggio spalmabile",
      "Yogurt alla frutta",
    ]);
  });

  it("il nome continua a trovare", async () => {
    const results = await searchFoods("spalmabile");
    expect(results.map((r) => r.name)).toEqual(["Formaggio spalmabile"]);
  });

  it("un alimento senza marchio non sparisce dalla ricerca per nome", async () => {
    const results = await searchFoods("pollo");
    expect(results.map((r) => r.name)).toEqual(["Petto di pollo"]);
  });

  it("non ritorna un alimento cancellato che porta quel marchio", async () => {
    const results = await searchFoods("milbona");
    const id = results.find((r) => r.name === "Formaggio spalmabile")!.id;
    await deleteFood(id);

    expect((await searchFoods("milbona")).map((r) => r.name)).toEqual([
      "Yogurt alla frutta",
    ]);
  });

  it("searchMyFoods trova per marchio ed esclude comunque i seed", async () => {
    await createFood({
      name: "Formaggio del seed",
      brand: "Milbona",
      source: "seed",
      nutrients: EMPTY_NUTRIENTS,
    });

    const results = await searchMyFoods("milbona");
    expect(results.map((r) => r.name).sort()).toEqual([
      "Formaggio spalmabile",
      "Yogurt alla frutta",
    ]);
  });
});

describe("getFoodByBarcode", () => {
  it("trova per codice a barre", async () => {
    await createFood({
      ...chickenInput,
      name: "Prodotto con barcode",
      barcode: "8001234567890",
    });
    expect((await getFoodByBarcode("8001234567890"))?.name).toBe(
      "Prodotto con barcode",
    );
  });

  it("ritorna null se il barcode non esiste", async () => {
    expect(await getFoodByBarcode("0000000000000")).toBeNull();
  });
});

describe("updateFood", () => {
  it("aggiorna i valori e il nome normalizzato", async () => {
    const id = await createFood(chickenInput);
    await updateFood(id, {
      ...chickenInput,
      name: "Petto di tacchino",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 135, protein: 30 },
    });

    const row = await getFood(id);
    expect(row?.name).toBe("Petto di tacchino");
    expect(row?.name_norm).toBe("petto di tacchino");
    expect(row?.kcal).toBe(135);
  });

  it("aggiorna updated_at", async () => {
    const id = await createFood(chickenInput);
    const before = (await getFood(id))!.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    await updateFood(id, { ...chickenInput, name: "Pollo" });
    expect((await getFood(id))!.updated_at).not.toBe(before);
  });

  it("non azzera preferito e conteggio utilizzi", async () => {
    const id = await createFood(chickenInput);
    await toggleFoodFavorite(id);
    await incrementFoodUsage(id);
    await updateFood(id, { ...chickenInput, name: "Pollo" });

    const row = await getFood(id);
    expect(row?.is_favorite).toBe(1);
    expect(row?.usage_count).toBe(1);
  });
});

describe("deleteFood", () => {
  it("cancella logicamente, non fisicamente", async () => {
    const id = await createFood(chickenInput);
    await deleteFood(id);

    expect(await getFood(id)).toBeNull();

    // La riga resta nel DB: le meal_entries storiche la referenziano ancora.
    const raw = await db.getFirstAsync<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM foods WHERE id = ?",
      [id],
    );
    expect(raw).not.toBeNull();
    expect(raw?.deleted_at).not.toBeNull();
  });
});

describe("toggleFoodFavorite", () => {
  it("alterna il flag", async () => {
    const id = await createFood(chickenInput);
    await toggleFoodFavorite(id);
    expect((await getFood(id))?.is_favorite).toBe(1);
    await toggleFoodFavorite(id);
    expect((await getFood(id))?.is_favorite).toBe(0);
  });
});

describe("incrementFoodUsage", () => {
  it("incrementa di uno a ogni chiamata", async () => {
    const id = await createFood(chickenInput);
    await incrementFoodUsage(id);
    await incrementFoodUsage(id);
    expect((await getFood(id))?.usage_count).toBe(2);
  });
});

describe("l'identita' di un alimento", () => {
  /**
   * Il difetto che questo test blocca: `updateFood` riscriveva anche `barcode`
   * e `off_id` da `input`, e `FoodFormScreen` non li passa - il modulo non ha
   * un campo per nessuno dei due. Aprire un prodotto arrivato da
   * OpenFoodFacts, correggere una virgola e salvare ne cancellava il codice a
   * barre.
   *
   * Da li' in poi `getFoodByBarcode` non lo trovava piu': la deduplica di
   * `resolveFood` smetteva di funzionare per quel prodotto, e una scansione
   * dello stesso codice avrebbe creato un doppione. Nessun errore, nessun
   * segno a schermo.
   */
  it("correggere un alimento non gli porta via il codice a barre", async () => {
    const id = await createFood({
      name: "Fette biscottate",
      barcode: "8001234567890",
      offId: "8001234567890",
      source: "off",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 412 },
    });

    // Esattamente quel che manda il modulo: nessun barcode, nessun offId.
    await updateFood(id, {
      name: "Fette biscottate integrali",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 400 },
    });

    const dopo = await getFood(id);
    expect(dopo?.name).toBe("Fette biscottate integrali");
    expect(dopo?.kcal).toBe(400);
    expect(dopo?.barcode).toBe("8001234567890");
    expect(dopo?.off_id).toBe("8001234567890");
  });

  it("l'alimento resta ritrovabile dal codice dopo una correzione", async () => {
    const id = await createFood({
      name: "Fette biscottate",
      barcode: "8001234567890",
      nutrients: EMPTY_NUTRIENTS,
    });

    await updateFood(id, {
      name: "Fette biscottate integrali",
      nutrients: EMPTY_NUTRIENTS,
    });

    const trovato = await getFoodByBarcode("8001234567890");
    expect(trovato?.id).toBe(id);
  });
});

describe("l'aggancio al catalogo", () => {
  it("ritrova una riga dal suo uid", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });

    expect((await findFoodByCatalogUid("food-riso"))?.id).toBe(id);
  });

  /**
   * `barcode` e `off_id` sono identita' e non contenuto: nessuna schermata ha
   * un campo per modificarli, e il catalogo non ne sa piu' di questo telefono
   * - il codice ce l'ha messo una scansione fatta qui.
   */
  it("riscrive i valori e non il codice a barre", async () => {
    const id = await createFood({
      name: "Yogurt",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 60 },
      source: "seed",
      barcode: "8001234567890",
      offId: "off-yogurt",
    });
    await toggleFoodFavorite(id);

    await applyCatalogFood(id, "food-yogurt", {
      name: "Yogurt bianco",
      brand: "Marca",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 62, protein: 3.5 },
      isLiquid: false,
      defaultServingG: 125,
      servingLabel: "1 vasetto = 125 g",
      imageUri: null,
    });

    const riga = await getFood(id);
    expect(riga?.name).toBe("Yogurt bianco");
    expect(riga?.kcal).toBe(62);
    expect(riga?.catalog_uid).toBe("food-yogurt");
    // Identita' e stato d'uso: non li tocca.
    expect(riga?.barcode).toBe("8001234567890");
    expect(riga?.off_id).toBe("off-yogurt");
    expect(riga?.is_favorite).toBe(1);
  });

  /**
   * Gli alimenti non hanno `is_custom`: il marcatore e' `source`, e staccarsi
   * dal catalogo vuol dire passare da 'seed' a 'user'.
   */
  it("staccata dal catalogo resta, e diventa dell'utente", async () => {
    const id = await createFood({
      name: "Riso",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 358 },
      source: "seed",
      catalogUid: "food-riso",
    });

    await detachFoodFromCatalog(id);

    const riga = await getFood(id);
    expect(riga).not.toBeNull();
    expect(riga?.source).toBe("user");
    expect(riga?.catalog_uid).toBe("food-riso");
  });
});
