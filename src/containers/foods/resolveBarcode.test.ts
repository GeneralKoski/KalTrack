import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createFood, getFood } from "@/src/db/queries/foods";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { resolveBarcode } from "@/src/containers/foods/resolveBarcode";
import { OpenFoodFactsError } from "@/src/services/openFoodFacts";
import type { FoodInput } from "@/src/types/nutrition";

// Il prefisso `mock` e' obbligatorio: jest.mock viene issato in cima al file.
const mockSearchByBarcode = jest.fn();
jest.mock("@/src/services/openFoodFacts", () => {
  const actual = jest.requireActual("@/src/services/openFoodFacts");
  return {
    ...actual,
    searchByBarcode: (...args: unknown[]) => mockSearchByBarcode(...args),
  };
});

const CODE = "8001234567890";

const offProduct = (over: Partial<FoodInput> = {}): FoodInput => ({
  name: "Fette biscottate",
  brand: "Marca",
  barcode: CODE,
  nutrients: { ...EMPTY_NUTRIENTS, kcal: 412, protein: 13.5 },
  ...over,
});

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  jest.clearAllMocks();
  mockSearchByBarcode.mockResolvedValue(null);
});

afterEach(() => __setDbForTesting(null));

describe("resolveBarcode", () => {
  it("apre l'alimento che la libreria ha gia'", async () => {
    const id = await createFood({
      name: "Fette biscottate mie",
      barcode: CODE,
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 400 },
    });

    const esito = await resolveBarcode(CODE);

    expect(esito).toEqual({ kind: "library", id });
    // La libreria vince: l'archivio non viene nemmeno interrogato.
    expect(mockSearchByBarcode).not.toHaveBeenCalled();
  });

  /**
   * La precedenza e' la stessa di `resolveFood`, e non e' cosmetica: un
   * prodotto corretto a mano non deve essere riscritto dai valori pubblici,
   * che sono compilati da chiunque.
   */
  it("la libreria vince anche quando l'archivio conosce il prodotto", async () => {
    const id = await createFood({
      name: "Fette biscottate mie",
      barcode: CODE,
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 400 },
    });
    mockSearchByBarcode.mockResolvedValue(offProduct());

    expect(await resolveBarcode(CODE)).toEqual({ kind: "library", id });

    const salvato = await getFood(id);
    expect(salvato?.kcal).toBe(400);
  });

  it("salva in libreria il prodotto trovato in archivio", async () => {
    mockSearchByBarcode.mockResolvedValue(offProduct());

    const esito = await resolveBarcode(CODE);

    if (esito.kind !== "off") throw new Error(`esito inatteso: ${esito.kind}`);
    const salvato = await getFood(esito.id);
    expect(salvato?.name).toBe("Fette biscottate");
    expect(salvato?.barcode).toBe(CODE);
    // `source` dice da dove vengono i valori, e serve a non ripubblicarli
    // come propri nel catalogo comune.
    expect(salvato?.source).toBe("off");
  });

  /**
   * Il terzo esito e' un modulo vuoto col codice dentro: chi ha il prodotto in
   * mano ha l'etichetta davanti, e la scansione successiva lo trovera' in
   * libreria - purche' il codice venga salvato, che e' il motivo per cui
   * `FoodFormScreen` ora lo include.
   */
  it("quando nessuno lo conosce torna il codice da compilare", async () => {
    expect(await resolveBarcode(CODE)).toEqual({
      kind: "unknown",
      barcode: CODE,
    });
  });

  it("l'archivio irraggiungibile non e' un errore, e' un codice ignoto", async () => {
    mockSearchByBarcode.mockRejectedValue(
      new OpenFoodFactsError("rete assente"),
    );

    expect(await resolveBarcode(CODE)).toEqual({
      kind: "unknown",
      barcode: CODE,
    });
  });

  /**
   * Un difetto nostro - un TypeError, un errore di parsing - non deve
   * travestirsi da "prodotto non trovato": e' la stessa distinzione che fa
   * `resolveFood`.
   */
  it("un errore che non viene dall'archivio risale", async () => {
    mockSearchByBarcode.mockRejectedValue(new TypeError("undefined non e' una funzione"));

    await expect(resolveBarcode(CODE)).rejects.toThrow(TypeError);
  });

  it("uno spazio in mezzo o intorno non cambia il codice", async () => {
    const id = await createFood({
      name: "Fette biscottate mie",
      barcode: CODE,
      nutrients: EMPTY_NUTRIENTS,
    });

    expect(await resolveBarcode(`  ${CODE} `)).toEqual({
      kind: "library",
      id,
    });
  });

  it("un codice vuoto non interroga niente", async () => {
    expect(await resolveBarcode("   ")).toEqual({
      kind: "unknown",
      barcode: "",
    });
    expect(mockSearchByBarcode).not.toHaveBeenCalled();
  });
});
