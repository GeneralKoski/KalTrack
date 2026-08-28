import {
  OpenFoodFactsError,
  searchByBarcode,
  searchByName,
} from "@/src/services/openFoodFacts";

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const respond = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const nutriments = {
  "energy-kcal_100g": 335,
  proteins_100g: 12.5,
  carbohydrates_100g: 61.2,
  sugars_100g: 3.1,
  fat_100g: 3.4,
  "saturated-fat_100g": 0.7,
  fiber_100g: 4.2,
  salt_100g: 1.3,
};

const lastUrl = (): string => String(fetchMock.mock.calls[0][0]);

describe("searchByBarcode", () => {
  it("mappa i nutrimenti OFF sul nostro Nutrients", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Pane integrale",
          brands: "Mulino",
          nutriments,
        },
      }),
    );

    const food = await searchByBarcode("8001234567890");

    expect(food).toEqual({
      name: "Pane integrale",
      brand: "Mulino",
      source: "off",
      barcode: "8001234567890",
      offId: "8001234567890",
      nutrients: {
        kcal: 335,
        protein: 12.5,
        carbs: 61.2,
        sugars: 3.1,
        fat: 3.4,
        saturatedFat: 0.7,
        fiber: 4.2,
        salt: 1.3,
      },
      isLiquid: false,
      defaultServingG: null,
    });
  });

  it("preferisce il nome italiano quando c'è", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Whole wheat bread",
          product_name_it: "Pane integrale",
          nutriments,
        },
      }),
    );

    expect((await searchByBarcode("123"))?.name).toBe("Pane integrale");
  });

  it("tratta i nutrimenti mancanti come 0", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Riso",
          nutriments: { "energy-kcal_100g": 130 },
        },
      }),
    );

    expect((await searchByBarcode("123"))?.nutrients).toEqual({
      kcal: 130,
      protein: 0,
      carbs: 0,
      sugars: 0,
      fat: 0,
      saturatedFat: 0,
      fiber: 0,
      salt: 0,
    });
  });

  it("accetta i valori numerici arrivati come stringa", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Riso",
          nutriments: { "energy-kcal_100g": "130", proteins_100g: "2.7" },
        },
      }),
    );

    const food = await searchByBarcode("123");
    expect(food?.nutrients.kcal).toBe(130);
    expect(food?.nutrients.protein).toBe(2.7);
  });

  it("prende solo la prima marca dell'elenco", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Riso",
          brands: "Scotti, Riso Scotti",
          nutriments,
        },
      }),
    );

    expect((await searchByBarcode("123"))?.brand).toBe("Scotti");
  });

  it("valorizza defaultServingG dalla porzione OFF", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: { product_name: "Yogurt", serving_quantity: 125, nutriments },
      }),
    );

    expect((await searchByBarcode("123"))?.defaultServingG).toBe(125);
  });

  it("converte l'energia dichiarata solo in kJ", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Biscotti",
          nutriments: { "energy-kj_100g": 1900, proteins_100g: 7 },
        },
      }),
    );

    expect((await searchByBarcode("123"))?.nutrients.kcal).toBe(454.1);
  });

  it("legge energy_100g come kJ, o come kcal se l'unità lo dice", async () => {
    fetchMock.mockResolvedValueOnce(
      respond({
        product: { product_name: "Snack", nutriments: { energy_100g: 2092 } },
      }),
    );
    expect((await searchByBarcode("123"))?.nutrients.kcal).toBe(500);

    fetchMock.mockResolvedValueOnce(
      respond({
        product: {
          product_name: "Snack",
          nutriments: { energy_100g: 500, energy_unit: "kcal" },
        },
      }),
    );
    expect((await searchByBarcode("123"))?.nutrients.kcal).toBe(500);
  });

  it("marca come liquido la porzione in millilitri invece di contarla in grammi", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Cola",
          serving_quantity: 330,
          serving_quantity_unit: "ml",
          nutriments,
        },
      }),
    );

    const food = await searchByBarcode("123");
    expect(food?.isLiquid).toBe(true);
    expect(food?.defaultServingG).toBe(330);
  });

  it("converte i centilitri in millilitri", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Birra",
          serving_quantity: 33,
          serving_quantity_unit: "cl",
          nutriments,
        },
      }),
    );

    expect((await searchByBarcode("123"))?.defaultServingG).toBe(330);
  });

  it("scarta la porzione in un'unità che non sa convertire", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: {
          product_name: "Cereali",
          serving_quantity: 2,
          serving_quantity_unit: "oz",
          nutriments,
        },
      }),
    );

    expect((await searchByBarcode("123"))?.defaultServingG).toBeNull();
  });

  it("scarta il prodotto senza kcal", async () => {
    fetchMock.mockResolvedValue(
      respond({
        product: { product_name: "Acqua", nutriments: { proteins_100g: 0 } },
      }),
    );

    expect(await searchByBarcode("123")).toBeNull();
  });

  it("scarta il prodotto senza nome", async () => {
    fetchMock.mockResolvedValue(respond({ product: { nutriments } }));

    expect(await searchByBarcode("123")).toBeNull();
  });

  it("ritorna null su 404", async () => {
    fetchMock.mockResolvedValue(respond({}, 404));

    expect(await searchByBarcode("000")).toBeNull();
  });

  it("ritorna null se la risposta non ha il prodotto", async () => {
    fetchMock.mockResolvedValue(respond({ status: 0 }));

    expect(await searchByBarcode("123")).toBeNull();
  });

  it("non chiama la rete con un barcode vuoto", async () => {
    expect(await searchByBarcode("   ")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("solleva OpenFoodFactsError su errore del server", async () => {
    fetchMock.mockResolvedValue(respond({}, 500));

    await expect(searchByBarcode("123")).rejects.toBeInstanceOf(
      OpenFoodFactsError,
    );
  });

  it("solleva OpenFoodFactsError se la rete fallisce", async () => {
    fetchMock.mockRejectedValue(new Error("Network request failed"));

    await expect(searchByBarcode("123")).rejects.toBeInstanceOf(
      OpenFoodFactsError,
    );
  });
});

describe("searchByName", () => {
  it("ritorna i prodotti utilizzabili e scarta gli altri", async () => {
    fetchMock.mockResolvedValue(
      respond({
        products: [
          { code: "1", product_name: "Pane integrale", nutriments },
          { code: "2", product_name: "Senza kcal", nutriments: {} },
          { code: "3", nutriments },
          "spazzatura",
          { code: "4", product_name: "Pane bianco", nutriments },
        ],
      }),
    );

    const foods = await searchByName("pane", 5);

    expect(foods.map((f) => f.name)).toEqual(["Pane integrale", "Pane bianco"]);
    expect(foods.every((f) => f.source === "off")).toBe(true);
  });

  it("ritorna [] se products non è una lista", async () => {
    fetchMock.mockResolvedValue(respond({ products: null }));

    expect(await searchByName("pane")).toEqual([]);
  });

  it("non chiama la rete con un termine vuoto", async () => {
    expect(await searchByName("  ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("codifica il termine e limita la page_size", async () => {
    fetchMock.mockResolvedValue(respond({ products: [] }));

    await searchByName("pane e olio", 999);

    expect(lastUrl()).toContain("search_terms=pane%20e%20olio");
    expect(lastUrl()).toContain("page_size=50");
  });
});

describe("richiesta HTTP", () => {
  const lastInit = (): RequestInit => fetchMock.mock.calls[0][1] as RequestInit;

  it("si identifica con uno User-Agent: senza, OFF applica il rate limit", async () => {
    fetchMock.mockResolvedValue(respond({ products: [] }));

    await searchByName("pane");

    const headers = lastInit().headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("KalTrack");
    expect(headers.Accept).toBe("application/json");
  });

  it("chiede solo i campi che usa, non il prodotto intero", async () => {
    fetchMock.mockResolvedValue(respond({ products: [] }));

    await searchByName("pane");

    const fields = new URL(lastUrl()).searchParams.get("fields") ?? "";
    expect(fields.split(",").sort()).toEqual([
      "brands",
      "code",
      "nutriments",
      "product_name",
      "product_name_it",
      "serving_quantity",
      "serving_quantity_unit",
    ]);
  });

  it("annulla la richiesta allo scadere del timeout e la traduce in errore OFF", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("Aborted")),
          );
        }),
    );

    const pending = searchByName("pane");
    const rejects = expect(pending).rejects.toBeInstanceOf(OpenFoodFactsError);

    const signal = lastInit().signal as AbortSignal;
    jest.advanceTimersByTime(7_999);
    expect(signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);

    await rejects;
    jest.useRealTimers();
  });
});
