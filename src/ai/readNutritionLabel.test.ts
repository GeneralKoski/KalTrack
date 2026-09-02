import { AiResponseError } from "@/src/ai/errors";
import {
  labelUpdates,
  readNutritionLabel,
  sanitizeReading,
  type LabelReading,
} from "@/src/ai/readNutritionLabel";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

jest.mock("@/src/ai/config", () => ({
  ...jest.requireActual("@/src/ai/config"),
  hasAiKey: () => true,
}));

const mockSaveAsync = jest.fn();
const mockRenderAsync = jest.fn();
const mockResize = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
  ImageManipulator: {
    manipulate: () => ({ resize: mockResize, renderAsync: mockRenderAsync }),
  },
}));

let db: LocalDatabase;
const fetchMock = jest.fn();

const httpOk = (content: string): unknown => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 900, completion_tokens: 120 },
  }),
  text: async () => content,
});

const respondWith = (content: string): void => {
  fetchMock.mockImplementation(async () => httpOk(content));
};

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);

  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  mockResize.mockReset().mockImplementation(() => ({
    resize: mockResize,
    renderAsync: mockRenderAsync,
  }));
  mockRenderAsync
    .mockReset()
    .mockResolvedValue({ width: 3000, height: 4000, saveAsync: mockSaveAsync });
  mockSaveAsync.mockReset().mockResolvedValue({
    uri: "file:///cache/label.jpg",
    width: 1176,
    height: 1568,
    base64: "AAAABBBB",
  });
});

afterEach(() => __setDbForTesting(null));

/** Uno yogurt greco: numeri realistici e coerenti tra loro. */
const YOGURT = {
  productName: "Yogurt greco 0%",
  servingG: 150,
  per100: {
    kcal: 57,
    protein: 10,
    carbs: 4,
    sugars: 4,
    fat: 0.2,
    saturatedFat: 0.1,
    fiber: 0,
    salt: 0.1,
  },
};

describe("lettura dell'etichetta", () => {
  it("trascrive i valori per 100 g e il nome del prodotto", async () => {
    respondWith(JSON.stringify(YOGURT));
    const reading = await readNutritionLabel("file:///photo.jpg");

    expect(reading.productName).toBe("Yogurt greco 0%");
    expect(reading.servingG).toBe(150);
    expect(reading.per100.kcal).toBe(57);
    expect(reading.per100.protein).toBe(10);
    expect(reading.missing).toEqual([]);
  });

  /**
   * La distinzione che regge tutto il modulo: un campo non letto resta
   * assente. Se diventasse 0 l'utente salverebbe "0 g di fibre" credendolo
   * un dato del produttore.
   */
  it("lascia assente quel che non ha letto, senza metterci zero", async () => {
    respondWith(
      JSON.stringify({
        productName: null,
        servingG: null,
        per100: { kcal: 250, protein: 8, carbs: 30, fat: 10, fiber: null },
      }),
    );
    const reading = await readNutritionLabel("file:///photo.jpg");

    expect(reading.per100.fiber).toBeUndefined();
    expect(reading.per100.sugars).toBeUndefined();
    expect(reading.missing).toEqual(["sugars", "saturatedFat", "fiber", "salt"]);
  });

  it("accetta i decimali scritti con la virgola", async () => {
    respondWith(
      JSON.stringify({
        productName: "Latte",
        servingG: null,
        per100: { kcal: 64, protein: "3,2", carbs: "4,8", fat: "3,6" },
      }),
    );
    const reading = await readNutritionLabel("file:///photo.jpg");

    expect(reading.per100.protein).toBeCloseTo(3.2);
    expect(reading.per100.fat).toBeCloseTo(3.6);
  });

  it("rifiuta una risposta che non è JSON", async () => {
    respondWith("Ecco l'etichetta che mi hai mandato!");
    await expect(readNutritionLabel("file:///photo.jpg")).rejects.toThrow(
      AiResponseError,
    );
  });

  it("torna tutto vuoto quando la foto non è una tabella", async () => {
    respondWith(
      JSON.stringify({ productName: null, servingG: null, per100: {} }),
    );
    const reading = await readNutritionLabel("file:///photo.jpg");

    expect(reading.per100).toEqual({});
    expect(reading.missing).toHaveLength(8);
  });
});

describe("coerenza dei valori letti", () => {
  it("accetta un'etichetta reale con i suoi arrotondamenti", () => {
    // Numeri veri: i macro implicano 56,8 kcal, l'etichetta ne dichiara 57.
    expect(sanitizeReading(YOGURT.per100).kcal).toBe(57);
  });

  /**
   * L'errore di OCR più probabile su un'etichetta europea: entrambe le unità
   * sono stampate una accanto all'altra, "560 kJ / 133 kcal", e prendere la
   * prima gonfia l'energia di 4,2 volte.
   */
  it("scarta le kcal quando sono in realtà i kJ", () => {
    const clean = sanitizeReading({
      kcal: 560,
      protein: 3,
      carbs: 20,
      fat: 4,
    });
    expect(clean.kcal).toBeUndefined();
    expect(clean.protein).toBe(3);
  });

  /**
   * Il caso che apriva la falla: la colonna dei carboidrati letta male fa
   * scartare i carboidrati, il confronto coi macro si disarma, e senza un
   * tetto assoluto le kcal prese dai kJ passavano indisturbate.
   */
  it("scarta kcal impossibili anche quando un macro e' stato scartato", () => {
    const clean = sanitizeReading({
      kcal: 1050,
      protein: 6,
      carbs: 340,
      fat: 12,
    });
    expect(clean.carbs).toBeUndefined();
    expect(clean.kcal).toBeUndefined();
    expect(clean.protein).toBe(6);
  });

  it("tiene le 900 kcal dell'olio, che sono il massimo possibile", () => {
    expect(sanitizeReading({ kcal: 900, fat: 100 }).kcal).toBe(900);
  });

  it("scarta un nutriente che supera i 100 g dentro 100 g", () => {
    const clean = sanitizeReading({ carbs: 340, protein: 5 });
    expect(clean.carbs).toBeUndefined();
    expect(clean.protein).toBe(5);
  });

  it("tiene l'olio, che è davvero 100 g di grassi su 100 g", () => {
    const clean = sanitizeReading({
      kcal: 900,
      protein: 0,
      carbs: 0,
      fat: 100,
      saturatedFat: 15,
    });
    expect(clean.fat).toBe(100);
    expect(clean.kcal).toBe(900);
  });

  it("scarta gli zuccheri che superano i carboidrati", () => {
    const clean = sanitizeReading({ carbs: 12, sugars: 45 });
    expect(clean.sugars).toBeUndefined();
    expect(clean.carbs).toBe(12);
  });

  it("scarta i saturi che superano i grassi", () => {
    const clean = sanitizeReading({ fat: 3, saturatedFat: 9 });
    expect(clean.saturatedFat).toBeUndefined();
    expect(clean.fat).toBe(3);
  });

  it("scarta i macro se insieme superano i 100 g", () => {
    const clean = sanitizeReading({ protein: 60, carbs: 60, fat: 20 });
    expect(clean.protein).toBeUndefined();
    expect(clean.carbs).toBeUndefined();
    expect(clean.fat).toBeUndefined();
  });

  /** Senza tutti e tre i macro lo scarto non dice niente sull'energia. */
  it("non giudica le kcal con un macro mancante", () => {
    const clean = sanitizeReading({ kcal: 400, protein: 5, carbs: 10 });
    expect(clean.kcal).toBe(400);
  });
});

describe("cosa scrivere nel form", () => {
  const reading = (over: Partial<LabelReading> = {}): LabelReading => ({
    per100: { kcal: 57, protein: 10 },
    productName: "Yogurt greco 0%",
    servingG: 150,
    missing: ["carbs", "sugars", "fat", "saturatedFat", "fiber", "salt"],
    ...over,
  });

  it("riempie nome e porzione quando il form è vuoto", () => {
    const updates = labelUpdates(reading(), {
      name: "",
      defaultServingG: null,
    });
    expect(updates.name).toBe("Yogurt greco 0%");
    expect(updates.defaultServingG).toBe(150);
  });

  /**
   * Chi ha la scatola in mano e ha appena battuto il nome ne sa più
   * dell'OCR: sovrascriverglielo sarebbe la cosa più fastidiosa possibile.
   */
  it("non sovrascrive il nome già digitato", () => {
    const updates = labelUpdates(reading(), {
      name: "Yogurt della Nonna",
      defaultServingG: 125,
    });
    expect(updates.name).toBeNull();
    expect(updates.defaultServingG).toBeNull();
  });

  it("non propone niente per i nutrienti non letti", () => {
    const updates = labelUpdates(reading(), { name: "", defaultServingG: null });
    expect(updates.nutrients.carbs).toBeUndefined();
    expect(updates.nutrients.kcal).toBe(57);
  });

  it("riporta i campi mancanti così la schermata può dirlo", () => {
    const updates = labelUpdates(reading(), { name: "", defaultServingG: null });
    expect(updates.missing).toContain("fiber");
  });
});
