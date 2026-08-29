import { chat } from "@/src/ai/client";
import { AiResponseError } from "@/src/ai/errors";
import {
  editDistance,
  matchScore,
  ResolveInputError,
  resolveFoodItem,
  resolveFoodItems,
  type ResolvedItem,
} from "@/src/ai/resolveFood";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createFood, getFoodByBarcode } from "@/src/db/queries/foods";
import { createRecipe } from "@/src/db/queries/recipes";
import { applySeeds } from "@/src/db/seed";
import { SEED_FOODS } from "@/src/db/seed/foods";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { OpenFoodFactsError, searchByName } from "@/src/services/openFoodFacts";
import type { FoodInput, FoodSource } from "@/src/types/nutrition";

jest.mock("@/src/ai/client");
jest.mock("@/src/services/openFoodFacts", () => {
  const actual = jest.requireActual("@/src/services/openFoodFacts");
  return { ...actual, searchByName: jest.fn() };
});

const chatMock = chat as jest.MockedFunction<typeof chat>;
const searchByNameMock = searchByName as jest.MockedFunction<
  typeof searchByName
>;

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  chatMock.mockReset();
  searchByNameMock.mockReset();
  searchByNameMock.mockResolvedValue([]);
});

afterEach(() => __setDbForTesting(null));

const nutrients = { ...EMPTY_NUTRIENTS, kcal: 165, protein: 31, fat: 3.6 };

const addFood = (name: string, source: FoodSource = "user"): Promise<string> =>
  createFood({ name, source, nutrients });

const aiEstimate = (body: Record<string, unknown>): void => {
  chatMock.mockResolvedValue({
    content: JSON.stringify(body),
    toolCalls: [],
    usage: null,
  });
};

/** Nome dell'alimento/ricetta/etichetta con cui la cascata ha risposto. */
const resolvedName = (item: ResolvedItem): string => {
  switch (item.kind) {
    case "recipe":
      return item.recipe.name;
    case "food":
    case "off":
      return item.food.name;
    case "estimated":
      return item.label;
  }
};

const offProduct: FoodInput = {
  name: "Petto di pollo a fette",
  source: "off",
  barcode: "8001",
  offId: "8001",
  nutrients,
};

describe("editDistance", () => {
  it("è zero fra stringhe uguali", () => {
    expect(editDistance("pollo", "pollo")).toBe(0);
  });

  it("conta sostituzioni, inserimenti e cancellazioni", () => {
    expect(editDistance("pollo", "polo")).toBe(1);
    expect(editDistance("pollo", "pallo")).toBe(1);
    expect(editDistance("pollo", "polloo")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  it("con una stringa vuota vale la lunghezza dell'altra", () => {
    expect(editDistance("", "riso")).toBe(4);
    expect(editDistance("riso", "")).toBe(4);
  });
});

describe("matchScore", () => {
  it("dà 1 al match esatto", () => {
    expect(matchScore("Petto di pollo", "petto di pollo")).toBe(1);
  });

  it("ignora accenti e punteggiatura", () => {
    expect(matchScore("caffè", "Caffe'")).toBe(1);
  });

  it("il match esatto batte ogni altro modo di somigliarsi", () => {
    const exact = matchScore("parmigiano", "parmigiano") ?? 0;
    const substring = matchScore("parmigiano", "parmigiano reggiano") ?? 0;
    const fuzzy = matchScore("parmigiano", "parmiggiano") ?? 0;

    expect(exact).toBe(1);
    expect(exact).toBeGreaterThan(substring);
    expect(exact).toBeGreaterThan(fuzzy);
    expect(substring).toBeGreaterThan(0);
    expect(fuzzy).toBeGreaterThan(0);
  });

  /**
   * Le fasce sotto l'esatto NON sono in ordine fisso, e non devono esserlo.
   *
   * Tenere il fuzzy sempre sotto la sottostringa era comodo ma sbagliato:
   * "burro d arachidi" e "burro di arachidi" distano un carattere su
   * diciassette, e quel match vale piu' di "Burro" preso come pezzo della
   * stessa frase. Con l'ordinamento rigido vinceva "Burro", e trenta grammi
   * di burro d'arachidi entravano nel diario come 227 kcal di burro.
   */
  it("un refuso su una frase lunga batte un nome che ne copre un pezzo", () => {
    const refuso = matchScore("burro d'arachidi", "Burro di arachidi") ?? 0;
    const pezzo = matchScore("burro d'arachidi", "Burro") ?? 0;

    expect(refuso).toBeGreaterThan(pezzo);
    expect(pezzo).toBeLessThan(0.5);
  });

  /**
   * Nessuna delle due frasi contiene l'altra e la distanza di edit e' troppo
   * alta: senza il confronto per parole intere l'unico candidato rimasto era
   * "Mela", che con la query condivide quattro lettere e nessuna parola.
   */
  it("due nomi che condividono la parola principale si somigliano", () => {
    const stessaParola =
      matchScore("melanzane grigliate", "Melanzane crude") ?? 0;
    const soleLettere = matchScore("melanzane grigliate", "Mela") ?? 0;

    expect(stessaParola).toBeGreaterThan(soleLettere);
    expect(stessaParola).toBeGreaterThan(0.7);
  });

  it("su parole brevi non tollera nessun refuso", () => {
    // Sotto la soglia un solo edit produce un alimento diverso, non un refuso:
    // pesce/pesca, uova/uva, pane/cane. Meglio nessun match che quello sbagliato.
    expect(matchScore("pollo", "polo")).toBeNull();
    expect(matchScore("pesce", "pesca")).toBeNull();
    expect(matchScore("pane", "cane")).toBeNull();
  });

  it("rifiuta nomi troppo distanti", () => {
    expect(matchScore("pollo", "banana")).toBeNull();
    expect(matchScore("riso", "")).toBeNull();
  });

  it("su query di 2-3 caratteri accetta solo il nome identico", () => {
    // "te" è dentro "tempeh": la sottostringa su query cortissime è rumore.
    expect(matchScore("te", "Tempeh")).toBeNull();
    expect(matchScore("te", "Tè verde non zuccherato")).toBeNull();
    expect(matchScore("tè", "Te")).toBe(1);
  });

  it("non applica la tolleranza fuzzy alle parole corte", () => {
    expect(matchScore("uova", "Uva")).toBeNull();
    expect(matchScore("mais", "mars")).toBeNull();
  });

  it("non tollera il refuso sulla prima lettera", () => {
    expect(matchScore("tonno", "sonno")).toBeNull();
    expect(matchScore("pane", "cane")).toBeNull();
  });

  it("tollera il refuso dentro una parola abbastanza lunga", () => {
    const fuzzy = matchScore("peto di pollo", "Petto di pollo");
    expect(fuzzy).not.toBeNull();
    // Alto, e deve esserlo: un carattere su quattordici e' un refuso di
    // battitura, non un altro alimento.
    expect(fuzzy ?? 0).toBeGreaterThan(0.7);
    expect(fuzzy ?? 0).toBeLessThan(1);
  });
});

describe("matchScore sui nomi reali del seed", () => {
  /** Miglior candidato del seed per una query, come lo sceglierebbe la cascata. */
  const bestSeedName = (query: string): string | null => {
    let best: { name: string; score: number } | null = null;
    for (const food of SEED_FOODS) {
      const score = matchScore(query, food.name);
      if (score === null) continue;
      if (!best || score > best.score) best = { name: food.name, score };
    }
    return best?.name ?? null;
  };

  it("non aggancia 'uova' a 'Uva'", () => {
    expect(bestSeedName("uova")).toBeNull();
  });

  it("non aggancia 'te' a 'Tempeh'", () => {
    expect(bestSeedName("te")).toBeNull();
  });

  it("continua a trovare gli alimenti che nel seed ci sono davvero", () => {
    expect(bestSeedName("riso bianco cotto")).toBe("Riso bianco cotto");
    expect(bestSeedName("tempeh")).toBe("Tempeh");
    expect(bestSeedName("petto di pollo")).toBe("Petto di pollo crudo");
  });

  /**
   * I casi che il difetto produceva davvero. Ognuno finiva nel diario con i
   * valori di un altro alimento: trenta grammi di burro d'arachidi come burro
   * (227 kcal invece di 176, e 0,2 g di proteine invece di 7,5), duecento
   * grammi di melanzane come mela.
   */
  it.each([
    ["burro d'arachidi", "Burro di arachidi"],
    ["melanzane grigliate", "Melanzane crude"],
    ["petto di pollo alla piastra", "Petto di pollo crudo"],
    ["yogurt greco", "Yogurt greco 0% grassi"],
  ])("per %s sceglie %s", (query, expected) => {
    expect(bestSeedName(query)).toBe(expected);
  });

  /** Il nome corto preso dentro una frase lunga non deve mai vincere. */
  it.each(["uva passa", "pesca sciroppata", "banana bread"])(
    "non risolve %s con la sola parola contenuta",
    (query) => {
      const best = bestSeedName(query);
      // Puo' non trovare niente, e va benissimo: la cascata prosegue verso
      // OpenFoodFacts. Quel che non deve fare e' rispondere "Uva" o "Pesca".
      expect(["Uva", "Pesca", "Banana", null]).toContain(best);
      if (best !== null) {
        expect(matchScore(query, best) ?? 0).toBeLessThan(0.5);
      }
    },
  );
});

describe("resolveFoodItem — validazione degli input", () => {
  it("rifiuta il nome vuoto senza pagare una chiamata AI", async () => {
    await expect(resolveFoodItem({ name: "   " })).rejects.toBeInstanceOf(
      ResolveInputError,
    );
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("rifiuta i grammi NaN, che a valle diventerebbero macro NaN", async () => {
    await expect(
      resolveFoodItem({ name: "riso", quantityG: Number.NaN }),
    ).rejects.toBeInstanceOf(ResolveInputError);
  });

  it("rifiuta i grammi negativi o nulli", async () => {
    await expect(
      resolveFoodItem({ name: "riso", quantityG: -5 }),
    ).rejects.toBeInstanceOf(ResolveInputError);
    await expect(
      resolveFoodItem({ name: "riso", quantityG: 0 }),
    ).rejects.toBeInstanceOf(ResolveInputError);
  });

  it("rifiuta una quantità implausibile", async () => {
    await expect(
      resolveFoodItem({ name: "riso", quantityG: 50_000 }),
    ).rejects.toBeInstanceOf(ResolveInputError);
  });

  it("rifiuta un numero di porzioni non valido", async () => {
    await expect(
      resolveFoodItem({ name: "lasagne", servings: 0 }),
    ).rejects.toBeInstanceOf(ResolveInputError);
  });

  it("accetta la quantità assente e la riporta come null", async () => {
    await addFood("Riso bianco bollito", "seed");

    const result = await resolveFoodItem({ name: "riso bianco bollito" });

    expect(result.kind === "food" && result.quantityG).toBeNull();
  });
});

describe("resolveFoodItem — cascata", () => {
  it("primo livello: le ricette dell'utente", async () => {
    const id = await createRecipe({ name: "Lasagne", servings: 4, items: [] });

    const result = await resolveFoodItem({ name: "lasagne", servings: 2 });

    expect(result.kind).toBe("recipe");
    if (result.kind !== "recipe") throw new Error("atteso kind recipe");
    expect(result.recipe.id).toBe(id);
    expect(result.servings).toBe(2);
    expect(result.confidence).toBe(1);
    expect(chatMock).not.toHaveBeenCalled();
    expect(searchByNameMock).not.toHaveBeenCalled();
  });

  it("dichiara i grammi che la ricetta non sa usare invece di buttarli", async () => {
    await createRecipe({ name: "Lasagne", servings: 4, items: [] });

    const result = await resolveFoodItem({ name: "lasagne", quantityG: 150 });

    if (result.kind !== "recipe") throw new Error("atteso kind recipe");
    expect(result.servings).toBe(1);
    expect(result.unusedQuantityG).toBe(150);
  });

  it("secondo livello: gli alimenti dell'utente", async () => {
    const id = await addFood("Petto di pollo");

    const result = await resolveFoodItem({
      name: "petto di pollo",
      quantityG: 150,
    });

    expect(result.kind).toBe("food");
    if (result.kind !== "food") throw new Error("atteso kind food");
    expect(result.food.id).toBe(id);
    expect(result.quantityG).toBe(150);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("a parità di punteggio l'alimento dell'utente batte il seed", async () => {
    await addFood("Pane", "seed");
    const mine = await addFood("Pane", "user");

    const result = await resolveFoodItem({ name: "pane", quantityG: 50 });

    expect(result.kind === "food" && result.food.id).toBe(mine);
  });

  it("il match esatto sul seed batte il match parziale dell'utente", async () => {
    await addFood("Panettone", "user");
    const seed = await addFood("Pane", "seed");

    const result = await resolveFoodItem({ name: "pane", quantityG: 50 });

    expect(result.kind === "food" && result.food.id).toBe(seed);
  });

  it("il match esatto su un alimento batte la ricetta che somiglia a metà", async () => {
    await createRecipe({
      name: "Insalata di riso",
      servings: 4,
      items: [],
    });
    const riso = await addFood("Riso", "seed");

    const result = await resolveFoodItem({ name: "riso", quantityG: 200 });

    expect(result.kind).toBe("food");
    if (result.kind !== "food") throw new Error("atteso kind food");
    expect(result.food.id).toBe(riso);
    expect(result.quantityG).toBe(200);
  });

  it("valuta tutti i candidati locali, non i primi che tornano dal DB", async () => {
    // L'ordinamento SQL (preferiti, utilizzi, nome) metterebbe "Pane" oltre la
    // trentesima riga: se i candidati venissero tagliati prima dello scoring,
    // il match esatto non verrebbe mai valutato.
    for (let i = 0; i < 30; i++) {
      await addFood(`Companatico con pane ${String(i).padStart(2, "0")}`);
    }
    const exact = await addFood("Pane");

    const result = await resolveFoodItem({ name: "pane", quantityG: 50 });

    expect(result.kind === "food" && result.food.id).toBe(exact);
    expect(result.confidence).toBe(1);
  });

  it("terzo livello: il seed locale", async () => {
    const id = await addFood("Riso bianco bollito", "seed");

    const result = await resolveFoodItem({
      name: "riso bianco bollito",
      quantityG: 200,
    });

    expect(result.kind === "food" && result.food.id).toBe(id);
    expect(chatMock).not.toHaveBeenCalled();
    expect(searchByNameMock).not.toHaveBeenCalled();
  });

  it("trova l'alimento locale nonostante gli accenti", async () => {
    const id = await addFood("Caffè espresso");

    const result = await resolveFoodItem({
      name: "caffe espresso",
      quantityG: 30,
    });

    expect(result.kind === "food" && result.food.id).toBe(id);
    expect(result.confidence).toBe(1);
  });

  it("trova l'alimento locale nonostante un refuso", async () => {
    const id = await addFood("Petto di pollo");

    const result = await resolveFoodItem({
      name: "peto di pollo",
      quantityG: 100,
    });

    expect(result.kind === "food" && result.food.id).toBe(id);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("quarto livello: OpenFoodFacts, senza scrivere in libreria", async () => {
    searchByNameMock.mockResolvedValue([offProduct]);

    const result = await resolveFoodItem({
      name: "petto di pollo a fette",
      quantityG: 120,
    });

    expect(result.kind).toBe("off");
    if (result.kind !== "off") throw new Error("atteso kind off");
    expect(result.food.offId).toBe("8001");
    expect(result.quantityG).toBe(120);
    // Confidenza scontata di OFF_TRUST_FACTOR: match esatto 1 * 0.9.
    expect(result.confidence).toBe(0.9);
    // La libreria si scrive quando l'utente conferma, non risolvendo.
    expect(await getFoodByBarcode("8001")).toBeNull();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("riusa la riga già in libreria invece di duplicare il barcode", async () => {
    const existing = await createFood({
      name: "Fettine di pollo del discount",
      source: "off",
      barcode: "8001",
      offId: "8001",
      nutrients,
    });
    searchByNameMock.mockResolvedValue([offProduct]);

    const result = await resolveFoodItem({
      name: "petto di pollo a fette",
      quantityG: 120,
    });

    expect(result.kind).toBe("food");
    if (result.kind !== "food") throw new Error("atteso kind food");
    expect(result.food.id).toBe(existing);
  });

  it("scarta i prodotti OFF che non c'entrano col nome cercato", async () => {
    searchByNameMock.mockResolvedValue([
      { ...offProduct, name: "Detersivo per piatti" },
    ]);
    aiEstimate({ label: "Petto di pollo", kcal: 165, protein: 31 });

    const result = await resolveFoodItem({
      name: "petto di pollo",
      quantityG: 100,
    });

    expect(result.kind).toBe("estimated");
  });

  it("passa alla stima AI se OpenFoodFacts non risponde", async () => {
    searchByNameMock.mockRejectedValue(new OpenFoodFactsError("offline"));
    aiEstimate({ label: "Torta della nonna", kcal: 380 });

    const result = await resolveFoodItem({
      name: "torta della nonna",
      quantityG: 90,
    });

    expect(result.kind).toBe("estimated");
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it("non traveste da rete assente un errore che non viene da OFF", async () => {
    searchByNameMock.mockRejectedValue(new TypeError("undefined is not a fn"));

    await expect(
      resolveFoodItem({ name: "torta della nonna", quantityG: 90 }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("ultimo livello: nessun match, stima AI marcata come stimata", async () => {
    aiEstimate({
      label: "Frittata di zucchine",
      kcal: 154,
      protein: 10.2,
      carbs: 2.1,
      sugars: 1.4,
      fat: 11.5,
      saturatedFat: 3,
      fiber: 0.8,
      salt: 0.6,
      confidence: 0.7,
    });

    const result = await resolveFoodItem({
      name: "frittata di zucchine",
      quantityG: 180,
    });

    expect(result).toEqual({
      kind: "estimated",
      label: "Frittata di zucchine",
      nutrients: {
        kcal: 154,
        protein: 10.2,
        carbs: 2.1,
        sugars: 1.4,
        fat: 11.5,
        saturatedFat: 3,
        fiber: 0.8,
        salt: 0.6,
      },
      quantityG: 180,
      confidence: 0.7,
    });
  });

  it("chiede la risposta in JSON con prompt di sistema in inglese", async () => {
    aiEstimate({ label: "Pinsa romana", kcal: 250 });

    await resolveFoodItem({ name: "pinsa romana", quantityG: 200 });

    const args = chatMock.mock.calls[0][0];
    expect(args.capability).toBe("food_estimate");
    expect(args.responseFormatJson).toBe(true);
    expect(String(args.messages[0].content)).toContain("PER 100 GRAMS");
  });
});

describe("resolveFoodItem — sul seed reale", () => {
  beforeEach(async () => {
    await applySeeds(db);
  });

  it("non risolve 'uova' nell'uva del seed", async () => {
    aiEstimate({ label: "Uova", kcal: 143, protein: 12.6, fat: 9.5 });

    const result = await resolveFoodItem({ name: "uova", quantityG: 120 });

    expect(resolvedName(result)).not.toBe("Uva");
    expect(result.kind).toBe("estimated");
  });

  it("non risolve 'te' nel tempeh del seed", async () => {
    aiEstimate({ label: "Tè", kcal: 1 });

    const result = await resolveFoodItem({ name: "te", quantityG: 200 });

    expect(resolvedName(result)).not.toBe("Tempeh");
    expect(result.kind).toBe("estimated");
  });

  it("risolve in locale gli alimenti che nel seed ci sono", async () => {
    const result = await resolveFoodItem({
      name: "petto di pollo",
      quantityG: 150,
    });

    expect(resolvedName(result)).toBe("Petto di pollo crudo");
    expect(chatMock).not.toHaveBeenCalled();
    expect(searchByNameMock).not.toHaveBeenCalled();
  });
});

describe("resolveFoodItems", () => {
  it("risolve la lista mantenendo l'ordine di dettatura", async () => {
    await addFood("Riso bianco bollito", "seed");
    await addFood("Petto di pollo");
    aiEstimate({ label: "Insalata mista", kcal: 20 });

    const results = await resolveFoodItems([
      { name: "petto di pollo", quantityG: 150 },
      { name: "insalata mista", quantityG: 80 },
      { name: "riso bianco bollito", quantityG: 200 },
    ]);

    expect(results.map(resolvedName)).toEqual([
      "Petto di pollo",
      "Insalata mista",
      "Riso bianco bollito",
    ]);
    expect(results.map((r) => r.kind)).toEqual(["food", "estimated", "food"]);
  });

  it("rifiuta l'intera lista se una voce ha una quantità non valida", async () => {
    await expect(
      resolveFoodItems([{ name: "riso" }, { name: "pollo", quantityG: -1 }]),
    ).rejects.toBeInstanceOf(ResolveInputError);
  });
});

describe("resolveFoodItem — risposta AI malformata", () => {
  it("rifiuta il JSON non parsabile", async () => {
    chatMock.mockResolvedValue({
      content: "non sono JSON",
      toolCalls: [],
      usage: null,
    });

    await expect(
      resolveFoodItem({ name: "qualcosa di ignoto", quantityG: 100 }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it("rifiuta la stima senza kcal", async () => {
    aiEstimate({ label: "Boh", protein: 3 });

    await expect(
      resolveFoodItem({ name: "qualcosa di ignoto", quantityG: 100 }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it("rifiuta le kcal fisicamente impossibili per 100 g", async () => {
    aiEstimate({ label: "Boh", kcal: 99_999 });

    await expect(
      resolveFoodItem({ name: "qualcosa di ignoto", quantityG: 100 }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it("accetta i numeri arrivati come stringa, come da OpenFoodFacts", async () => {
    aiEstimate({ label: "Petto di pollo", kcal: "165", protein: "31" });

    const result = await resolveFoodItem({
      name: "qualcosa di ignoto",
      quantityG: 100,
    });

    if (result.kind !== "estimated") throw new Error("atteso kind estimated");
    expect(result.nutrients.kcal).toBe(165);
    expect(result.nutrients.protein).toBe(31);
  });

  it("azzera i campi non numerici e ricade sul nome cercato", async () => {
    aiEstimate({ kcal: 200, protein: "tanta", fat: null });

    const result = await resolveFoodItem({
      name: "piatto misterioso",
      quantityG: 100,
    });

    if (result.kind !== "estimated") throw new Error("atteso kind estimated");
    expect(result.label).toBe("piatto misterioso");
    expect(result.nutrients.protein).toBe(0);
    expect(result.nutrients.fat).toBe(0);
    expect(result.confidence).toBe(0.4);
  });
});

describe("matching sui nomi reali del seed (regressioni note)", () => {
  const bestSeedMatch = (query: string): { name: string; score: number } | null => {
    let best: { name: string; score: number } | null = null;
    for (const food of SEED_FOODS) {
      const score = matchScore(query, food.name);
      if (score === null) continue;
      if (!best || score > best.score) best = { name: food.name, score };
    }
    return best;
  };

  it('"uovo" trova l\'uovo intero, non l\'albume', () => {
    // Il solo rapporto di lunghezza premiava "Albume d'uovo" perché più corto.
    expect(bestSeedMatch("uovo")?.name).toBe("Uovo di gallina intero crudo");
  });

  it('"pesce" non aggancia "Pesca"', () => {
    // Un edit su parola breve cambia completamente l'alimento.
    const best = bestSeedMatch("pesce");
    expect(best?.name ?? null).not.toBe("Pesca");
  });

  it('"uova" non aggancia "Uva"', () => {
    const best = bestSeedMatch("uova");
    expect(best?.name ?? null).not.toBe("Uva");
  });

  it('"te" non aggancia "Tempeh"', () => {
    const best = bestSeedMatch("te");
    expect(best?.name ?? null).not.toBe("Tempeh");
  });

  it("le query utili continuano a trovare la cosa giusta", () => {
    expect(bestSeedMatch("pane")?.name).toContain("Pane");
    expect(bestSeedMatch("riso")?.name).toContain("Riso");
    expect(bestSeedMatch("tonno")?.name).toContain("Tonno");
  });

  it("un match che inizia con la query batte uno che se la porta in coda", () => {
    expect(matchScore("uovo", "Uovo di gallina intero crudo")!).toBeGreaterThan(
      matchScore("uovo", "Albume d'uovo")!,
    );
  });
});
