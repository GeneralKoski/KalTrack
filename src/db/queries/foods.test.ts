import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  createFood,
  deleteFood,
  getFood,
  getFoodByBarcode,
  incrementFoodUsage,
  searchFoods,
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
