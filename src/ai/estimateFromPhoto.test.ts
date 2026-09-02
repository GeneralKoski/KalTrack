import { AiResponseError } from "@/src/ai/errors";
import { estimateFromPhoto } from "@/src/ai/estimateFromPhoto";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createFood } from "@/src/db/queries/foods";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EMPTY_NUTRIENTS, scaleNutrients } from "@/src/domain/nutrition";
import { searchByName } from "@/src/services/openFoodFacts";

// Senza chiave il client lancia prima di arrivare a fetch: qui la rete è
// comunque finta, quindi basta far credere al client che la chiave ci sia.
jest.mock("@/src/ai/config", () => ({
  ...jest.requireActual("@/src/ai/config"),
  hasAiKey: () => true,
}));

// La cascata di risoluzione interroga OpenFoodFacts: qui interessa il
// catalogo locale, quindi OFF risponde a vuoto se non detto altrimenti.
jest.mock("@/src/services/openFoodFacts", () => ({
  ...jest.requireActual("@/src/services/openFoodFacts"),
  searchByName: jest.fn(),
}));

const searchByNameMock = searchByName as jest.MockedFunction<
  typeof searchByName
>;

const mockSaveAsync = jest.fn();
const mockRenderAsync = jest.fn();
const mockResize = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
  ImageManipulator: {
    manipulate: () => ({ resize: mockResize, renderAsync: mockRenderAsync }),
  },
}));

const VALID_RESPONSE = JSON.stringify({
  items: [
    {
      label: "Pasta al pomodoro",
      quantityG: 300,
      kcal: 480,
      protein: 15,
      carbs: 90,
      sugars: 8,
      fat: 8,
      saturatedFat: 1.5,
      fiber: 5,
      salt: 1.2,
      confidence: 0.6,
    },
    {
      label: "Insalata mista",
      quantityG: 80,
      kcal: 30,
      protein: 1,
      carbs: 3,
      fat: 1,
      confidence: 0.4,
    },
  ],
});

/**
 * Risposta dell'ultimo livello della cascata (stima AI per 100 g), diversa per
 * forma da quella della vision: se finisse in una voce del diario si vedrebbe.
 */
const FOOD_ESTIMATE_RESPONSE = JSON.stringify({
  label: "Alimento generico",
  kcal: 111,
  protein: 1,
  carbs: 1,
  sugars: 1,
  fat: 1,
  saturatedFat: 1,
  fiber: 1,
  salt: 1,
  confidence: 0.3,
});

/** Frammento del system prompt della vision, per distinguerne le richieste. */
const VISION_MARKER = "nutrition estimator for an Italian food diary";

let db: LocalDatabase;
const fetchMock = jest.fn();

const requestBodies = (): string[] =>
  fetchMock.mock.calls.map((call) =>
    String((call[1] as RequestInit | undefined)?.body ?? ""),
  );

/** Corpo JSON della chiamata alla vision, che non è per forza la prima né l'unica. */
function visionRequestBody(): string {
  return requestBodies().find((body) => body.includes(VISION_MARKER)) ?? "";
}

const httpOk = (content: string): unknown => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 900, completion_tokens: 120 },
  }),
  text: async () => content,
});

/**
 * Sulla stessa fetch passano due chiamate diverse: la stima dalla foto e la
 * stima per 100 g dell'ultimo livello della cascata. Si distinguono dal
 * system prompt, non dall'ordine.
 */
function respondWith(visionContent: string): void {
  fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) =>
    httpOk(
      String(init?.body ?? "").includes(VISION_MARKER)
        ? visionContent
        : FOOD_ESTIMATE_RESPONSE,
    ),
  );
}

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);

  searchByNameMock.mockReset().mockResolvedValue([]);

  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  mockResize.mockReset().mockImplementation(() => ({
    resize: mockResize,
    renderAsync: mockRenderAsync,
  }));
  mockRenderAsync
    .mockReset()
    .mockResolvedValue({ width: 4032, height: 3024, saveAsync: mockSaveAsync });
  mockSaveAsync.mockReset().mockResolvedValue({
    uri: "file:///cache/small.jpg",
    width: 1024,
    height: 768,
    base64: "AAAABBBB",
  });
});

afterEach(() => __setDbForTesting(null));

describe("estimateFromPhoto", () => {
  it("ridimensiona il lato lungo a 1024 e invia una data URL compressa", async () => {
    respondWith(VALID_RESPONSE);

    await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(mockResize).toHaveBeenCalledWith({ width: 1024 });
    expect(mockSaveAsync).toHaveBeenCalledWith(
      expect.objectContaining({ base64: true, compress: 0.7, format: "jpeg" }),
    );
    expect(visionRequestBody()).toContain("data:image/jpeg;base64,AAAABBBB");
  });

  it("ridimensiona sull'altezza quando la foto è verticale", async () => {
    respondWith(VALID_RESPONSE);
    mockRenderAsync.mockResolvedValue({
      width: 3024,
      height: 4032,
      saveAsync: mockSaveAsync,
    });

    await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(mockResize).toHaveBeenCalledWith({ height: 1024 });
  });

  it("non ridimensiona una foto già piccola", async () => {
    respondWith(VALID_RESPONSE);
    mockRenderAsync.mockResolvedValue({
      width: 800,
      height: 600,
      saveAsync: mockSaveAsync,
    });

    await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(mockResize).not.toHaveBeenCalled();
  });

  it("include la nota dell'utente nel prompt", async () => {
    respondWith(VALID_RESPONSE);

    await estimateFromPhoto({
      uri: "file:///cache/foto.jpg",
      note: "erano circa 300 g di pasta con olio",
    });

    expect(visionRequestBody()).toContain(
      "erano circa 300 g di pasta con olio",
    );
  });

  it("non inventa una nota quando l'utente non la scrive", async () => {
    respondWith(VALID_RESPONSE);

    await estimateFromPhoto({ uri: "file:///cache/foto.jpg", note: "   " });

    expect(visionRequestBody()).not.toContain("Nota dell'utente");
  });

  // La nota è in italiano e "due etti di pasta" è il modo normale di dirlo:
  // senza la conversione nel prompt il modello passa 2 invece di 200.
  it("spiega al modello le unità italiane della nota", async () => {
    respondWith(VALID_RESPONSE);

    await estimateFromPhoto({
      uri: "file:///cache/foto.jpg",
      note: "due etti di pasta",
    });

    const body = visionRequestBody();
    expect(body).toContain("1 etto = 100 g");
    expect(body).toContain('mezzo chilo\\" = 500 g');
    expect(body).toContain('un chilo\\" = 1000 g');
  });

  it("restituisce le voci attese da una risposta JSON valida", async () => {
    respondWith(VALID_RESPONSE);

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(estimate.items).toHaveLength(2);
    expect(estimate.items[0]).toMatchObject({
      label: "Pasta al pomodoro",
      quantityG: 300,
      confidence: 0.6,
    });
    expect(estimate.items[0].nutrientsForPortion).toEqual({
      kcal: 480,
      protein: 15,
      carbs: 90,
      sugars: 8,
      fat: 8,
      saturatedFat: 1.5,
      fiber: 5,
      salt: 1.2,
    });
    // I campi non dichiarati dal modello valgono zero, non undefined.
    expect(estimate.items[1].nutrientsForPortion.fiber).toBe(0);
    expect(estimate.totalNutrients.kcal).toBe(510);
    expect(estimate.totalNutrients.protein).toBe(16);
  });

  it("marca come stimate le voci che il catalogo non riconosce", async () => {
    respondWith(VALID_RESPONSE);

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(estimate.items.map((item) => item.isEstimated)).toEqual([
      true,
      true,
    ]);
    expect(estimate.items.map((item) => item.resolved)).toEqual([null, null]);
    // I 111 kcal/100 g dell'ultimo livello della cascata non entrano mai in una
    // voce da foto: lì il modello ha visto il piatto, la stima cieca no.
    expect(estimate.items[0].nutrientsForPortion.kcal).toBe(480);
  });

  it("prende i valori dal catalogo quando l'alimento è già in libreria", async () => {
    await createFood({
      name: "Pasta al pomodoro",
      source: "user",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 130, protein: 4, carbs: 25 },
    });
    respondWith(VALID_RESPONSE);

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    const [pasta, insalata] = estimate.items;
    expect(pasta.isEstimated).toBe(false);
    expect(pasta.resolved?.kind).toBe("food");
    // 300 g dei 130 kcal/100 g censiti dall'utente, non i 480 immaginati.
    expect(pasta.nutrientsForPortion.kcal).toBe(390);
    expect(pasta.nutrientsForPortion.carbs).toBe(75);
    expect(pasta.confidence).toBeLessThanOrEqual(0.6);
    expect(insalata.isEstimated).toBe(true);
    expect(estimate.totalNutrients.kcal).toBe(420);
  });

  // `per100` esiste perche' i grammi si possono correggere prima di salvare, e
  // riscalare partendo dai valori assoluti - che sono arrotondati a un decimale
  // - farebbe divergere lo stesso alimento aggiunto dalla foto da quello
  // aggiunto dalla ricerca.
  it("espone i valori per 100 g del catalogo, non quelli ricavati dalla porzione", async () => {
    await createFood({
      name: "Pasta al pomodoro",
      source: "user",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 130, protein: 4, carbs: 25 },
    });
    respondWith(VALID_RESPONSE);

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(estimate.items[0].per100.kcal).toBe(130);
    expect(estimate.items[0].per100.carbs).toBe(25);
  });

  it("per una voce stimata i valori per 100 g tornano alla porzione", async () => {
    respondWith(VALID_RESPONSE);

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    const voce = estimate.items[0];
    expect(voce.isEstimated).toBe(true);
    expect(
      scaleNutrients(voce.per100, voce.quantityG).kcal,
    ).toBeCloseTo(voce.nutrientsForPortion.kcal, 1);
  });

  it("non fa cadere la stima se la risoluzione dal catalogo fallisce", async () => {
    searchByNameMock.mockRejectedValue(new TypeError("rete assente"));
    respondWith(VALID_RESPONSE);

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(estimate.items[0].isEstimated).toBe(true);
    expect(estimate.items[0].nutrientsForPortion.kcal).toBe(480);
  });

  it("non mostra mai come avvertenza il testo del modello", async () => {
    respondWith(
      JSON.stringify({
        items: [
          {
            label: "Pasta",
            quantityG: 300,
            kcal: 480,
            protein: 15,
            carbs: 90,
            fat: 8,
            confidence: 0.5,
          },
        ],
        caveat: "Bel piatto di pasta al pomodoro.",
      }),
    );

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(estimate.caveat).not.toContain("Bel piatto");
    expect(estimate.caveat).toMatch(/stimat/i);
  });

  it("ripiega su una confidenza prudente quando il modello la sbaglia", async () => {
    respondWith(
      JSON.stringify({
        items: [
          {
            label: "Riso",
            quantityG: 200,
            kcal: 260,
            protein: 5,
            carbs: 56,
            fat: 1,
          },
          {
            label: "Pollo",
            quantityG: 150,
            kcal: 250,
            protein: 46,
            carbs: 0,
            fat: 6,
            confidence: 80,
          },
        ],
      }),
    );

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    // Confidenza assente e confidenza fuori scala sono lo stesso caso: il
    // modello non l'ha data. Clampare 80 a 1 la trasformava in certezza.
    expect(estimate.items[0].confidence).toBe(0.5);
    expect(estimate.items[1].confidence).toBe(0.5);
  });

  it("accetta numeri come stringhe e chiavi in snake_case", async () => {
    respondWith(
      JSON.stringify({
        items: [
          {
            label: "Frittata",
            quantity_g: "180",
            kcal: "290",
            protein: "20",
            carbs: "2",
            fat: "22",
            saturated_fat: "6",
            confidence: "0.5",
          },
        ],
      }),
    );

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(estimate.items[0].quantityG).toBe(180);
    expect(estimate.items[0].nutrientsForPortion.saturatedFat).toBe(6);
  });

  it("lancia AiResponseError se la risposta non è JSON", async () => {
    respondWith("Nella foto vedo un piatto di pasta.");

    await expect(
      estimateFromPhoto({ uri: "file:///cache/foto.jpg" }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it("lancia AiResponseError se manca l'elenco delle voci", async () => {
    respondWith(JSON.stringify({ caveat: "boh" }));

    await expect(
      estimateFromPhoto({ uri: "file:///cache/foto.jpg" }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  // Foto senza cibo riconoscibile: deve fallire, non produrre un pasto da
  // zero calorie che l'utente può salvare in diario.
  it("lancia AiResponseError se non riconosce nessun alimento", async () => {
    respondWith(JSON.stringify({ items: [] }));

    await expect(
      estimateFromPhoto({ uri: "file:///cache/foto.jpg" }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it("lancia AiResponseError invece di restituire una voce a metà", async () => {
    respondWith(
      JSON.stringify({
        items: [{ label: "Pasta", quantityG: 300, protein: 15, carbs: 90 }],
      }),
    );

    await expect(
      estimateFromPhoto({ uri: "file:///cache/foto.jpg" }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it("lancia AiResponseError se una voce non ha nome", async () => {
    respondWith(
      JSON.stringify({
        items: [{ quantityG: 300, kcal: 480, protein: 15, carbs: 90, fat: 8 }],
      }),
    );

    await expect(
      estimateFromPhoto({ uri: "file:///cache/foto.jpg" }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  // Un negativo clampato a 0 produceva 0 kcal con 492 kcal di macro.
  it("lancia AiResponseError su un valore obbligatorio negativo", async () => {
    respondWith(
      JSON.stringify({
        items: [
          {
            label: "Pasta",
            quantityG: 300,
            kcal: -50,
            protein: 15,
            carbs: 90,
            fat: 8,
          },
        ],
      }),
    );

    await expect(
      estimateFromPhoto({ uri: "file:///cache/foto.jpg" }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it("lancia AiResponseError su una voce a 0 kcal con macro consistenti", async () => {
    respondWith(
      JSON.stringify({
        items: [
          {
            label: "Pasta",
            quantityG: 300,
            kcal: 0,
            protein: 15,
            carbs: 90,
            fat: 8,
          },
        ],
      }),
    );

    await expect(
      estimateFromPhoto({ uri: "file:///cache/foto.jpg" }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  // quantityG è il divisore di ogni riscalatura a valle.
  it("lancia AiResponseError su una quantità nulla", async () => {
    respondWith(
      JSON.stringify({
        items: [
          {
            label: "Pasta",
            quantityG: 0,
            kcal: 480,
            protein: 15,
            carbs: 90,
            fat: 8,
          },
        ],
      }),
    );

    await expect(
      estimateFromPhoto({ uri: "file:///cache/foto.jpg" }),
    ).rejects.toBeInstanceOf(AiResponseError);
  });

  it("accetta una voce senza calorie ma anche senza macro", async () => {
    respondWith(
      JSON.stringify({
        items: [
          {
            label: "Tisana",
            quantityG: 250,
            kcal: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            confidence: 0.9,
          },
        ],
      }),
    );

    const estimate = await estimateFromPhoto({ uri: "file:///cache/foto.jpg" });

    expect(estimate.items[0].nutrientsForPortion.kcal).toBe(0);
    expect(estimate.totalNutrients.kcal).toBe(0);
  });
});
