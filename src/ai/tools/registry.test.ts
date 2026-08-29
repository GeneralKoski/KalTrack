import { chat } from "@/src/ai/client";
import { AiResponseError } from "@/src/ai/errors";
import { createTools, TOOL_COUNT, toolDefinitions } from "@/src/ai/tools/registry";
import type { JsonSchema, RegisteredTool } from "@/src/ai/tools/types";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { getDayDiary } from "@/src/db/queries/diary";
import { createFood } from "@/src/db/queries/foods";
import { createRecipe } from "@/src/db/queries/recipes";
import { getTargetsFor, saveTargets } from "@/src/db/queries/settings";
import { getSteps, getWeight, setSteps } from "@/src/db/queries/tracking";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { searchByName } from "@/src/services/openFoodFacts";

import { navigationRef } from "@/src/navigation/navigationRef";

jest.mock("@/src/ai/client");

// La navigazione vive fuori dall'albero React: il tool la raggiunge col ref, e
// qui interessa che lo chiami davvero, non cosa fa React Navigation.
// La factory di jest.mock non puo' riferirsi a variabili esterne: i mock si
// creano dentro e si rileggono dal modulo.
jest.mock("@/src/navigation/navigationRef", () => ({
  navigationRef: {
    navigate: jest.fn(),
    isReady: jest.fn(() => true),
  },
}));
jest.mock("@/src/services/openFoodFacts", () => {
  const actual = jest.requireActual("@/src/services/openFoodFacts");
  return { ...actual, searchByName: jest.fn() };
});

const chatMock = chat as jest.MockedFunction<typeof chat>;
const searchByNameMock = searchByName as jest.MockedFunction<typeof searchByName>;

const DATE = "2026-08-28";

/**
 * Un'interazione dell'assistente: `runAssistant` crea i tool UNA volta e usa
 * quella stessa istanza per anteprima ed esecuzione. I test devono fare lo
 * stesso, altrimenti verificano un flusso che non esiste.
 */
const interaction = (referenceDate = DATE) => {
  const tools = createTools({ referenceDate, resolutionCache: new Map() });
  return (name: string): RegisteredTool => {
    const found = tools.find((item) => item.name === name);
    if (!found) throw new Error(`Tool ${name} non registrato`);
    return found;
  };
};

/** Interazione usa e getta, per i test che fanno una sola chiamata. */
const tool = (name: string, referenceDate = DATE): RegisteredTool =>
  interaction(referenceDate)(name);

const riceNutrients = {
  ...EMPTY_NUTRIENTS,
  kcal: 130,
  protein: 2.7,
  carbs: 28,
};

const createRice = (): Promise<string> =>
  createFood({ name: "Riso", nutrients: riceNutrients });

/** Stima AI: ultimo livello della cascata, per 100 g. */
const aiEstimate = (label: string, kcal: number): void => {
  chatMock.mockResolvedValueOnce({
    content: JSON.stringify({ label, kcal, protein: 8, confidence: 0.5 }),
    toolCalls: [],
    usage: null,
  });
};

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  chatMock.mockReset();
  searchByNameMock.mockReset();
  searchByNameMock.mockResolvedValue([]);
});

afterEach(() => __setDbForTesting(null));

describe("toolDefinitions", () => {
  it("espone ogni tool del registro nel formato del client", () => {
    const definitions = toolDefinitions();

    expect(definitions).toHaveLength(TOOL_COUNT);
    expect(definitions.map((d) => d.function.name).sort()).toEqual([
      "add_meal_entries",
      "delete_entry",
      "log_steps",
      "log_weight",
      "navigate",
      "query_summary",
      "set_target",
    ]);
  });

  it("non offre al modello nessun campo per i valori nutrizionali", () => {
    const entries = tool("add_meal_entries").parameters.properties?.entries;
    const item: JsonSchema | undefined = entries?.items;

    expect(Object.keys(item?.properties ?? {}).sort()).toEqual([
      "foodId",
      "name",
      "quantityG",
      "recipeId",
      "servings",
    ]);
    // Il modello dice COSA e QUANTO: senza `name` la cascata non ha su cosa
    // lavorare e resterebbe solo l'aggancio per id.
    expect(item?.required).toEqual(["name"]);
  });

  it("classifica il rischio: le cancellazioni sono distruttive, le letture no", () => {
    expect(tool("delete_entry").riskLevel).toBe("destructive");
    expect(tool("query_summary").riskLevel).toBe("read");
    expect(tool("navigate").riskLevel).toBe("read");
    expect(tool("add_meal_entries").riskLevel).toBe("write");
  });
});

describe("giorno di riferimento", () => {
  it("senza data scrive sul giorno che l'utente sta guardando, non su oggi", async () => {
    const yesterday = "2026-08-27";

    await tool("log_steps", yesterday).execute({ days: [{ steps: 8000 }] });

    expect((await getSteps(yesterday))?.steps).toBe(8000);
    expect(await getSteps(DATE)).toBeNull();
  });
});

describe("log_steps", () => {
  it("registra più giorni detti in una frase sola", async () => {
    const args = {
      days: [
        { date: "2026-08-24", steps: 8000 },
        { date: "2026-08-25", steps: 12000 },
      ],
    };

    const preview = await tool("log_steps").preview(args);
    expect(preview.lines).toEqual(["24/08: 8000 passi", "25/08: 12000 passi"]);

    const result = await tool("log_steps").execute(args);
    expect(result.message).toContain("2 giorni");
    expect((await getSteps("2026-08-24"))?.steps).toBe(8000);
    expect((await getSteps("2026-08-25"))?.steps).toBe(12000);
  });

  it("rifiuta un elenco vuoto invece di scrivere niente in silenzio", async () => {
    await expect(tool("log_steps").preview({ days: [] })).rejects.toThrow(
      AiResponseError,
    );
  });

  it("rifiuta una data che non è in formato ISO", async () => {
    await expect(
      tool("log_steps").execute({ days: [{ date: "24/08/2026", steps: 100 }] }),
    ).rejects.toThrow(AiResponseError);
  });

  it("rifiuta passi non interi invece di arrotondarli di nascosto", async () => {
    await expect(
      tool("log_steps").execute({ days: [{ date: DATE, steps: 8000.7 }] }),
    ).rejects.toThrow(AiResponseError);
    expect(await getSteps(DATE)).toBeNull();
  });
});

describe("log_weight", () => {
  it("salva peso e massa grassa", async () => {
    const args = { date: DATE, weightKg: 78.5, bodyFatPct: 14 };

    expect((await tool("log_weight").preview(args)).lines).toEqual([
      "28/08: 78,5 kg",
      "Massa grassa: 14%",
    ]);

    await tool("log_weight").execute(args);
    const saved = await getWeight(DATE);
    expect(saved?.weight_kg).toBe(78.5);
    expect(saved?.body_fat_pct).toBe(14);
  });

  it("rifiuta un peso non positivo", async () => {
    await expect(
      tool("log_weight").execute({ date: DATE, weightKg: 0 }),
    ).rejects.toThrow(AiResponseError);
  });

  it("rifiuta una massa grassa fuori scala", async () => {
    await expect(
      tool("log_weight").execute({ date: DATE, weightKg: 78, bodyFatPct: 900 }),
    ).rejects.toThrow(AiResponseError);
    expect(await getWeight(DATE)).toBeNull();
  });
});

describe("add_meal_entries", () => {
  it("scrive gli alimenti già risolti e mostra i macro calcolati", async () => {
    const foodId = await createRice();
    const args = {
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      entries: [{ name: "riso", foodId, quantityG: 150 }],
    };

    const preview = await tool("add_meal_entries").preview(args);
    expect(preview.title).toBe("Aggiungo a pranzo (28/08)");
    expect(preview.lines[0]).toContain("Riso - 150 g - 195 kcal");

    const result = await tool("add_meal_entries").execute(args);
    expect(result.message).toBe("Aggiunta 1 voce a pranzo.");

    const diary = await getDayDiary(DATE);
    expect(Math.round(diary.totals.kcal)).toBe(195);
    expect(diary.meals[0].type.id).toBe(MEAL_TYPE_IDS.lunch);
  });

  it("aggancia una ricetta in porzioni e somma il totale in anteprima", async () => {
    const foodId = await createRice();
    const recipeId = await createRecipe({
      name: "Iper pizza proteica",
      servings: 2,
      items: [{ foodId, quantityG: 200 }],
    });

    const preview = await tool("add_meal_entries").preview({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.dinner,
      entries: [
        { name: "iper pizza", recipeId, servings: 1 },
        { name: "riso", foodId, quantityG: 100 },
      ],
    });

    // 200 g di riso su 2 porzioni = 130 kcal a porzione, più 100 g = 130 kcal.
    expect(preview.lines[0]).toContain("Iper pizza proteica - 1 porzione - 130 kcal");
    expect(preview.lines[2]).toBe("Totale: 260 kcal, P 5,4 g");
  });

  it("risolve un nome libero sulla libreria dell'utente invece di stimarlo", async () => {
    await createRice();
    const args = {
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      entries: [{ name: "riso", quantityG: 150 }],
    };

    const preview = await tool("add_meal_entries").preview(args);
    expect(preview.lines[0]).toContain("Riso - 150 g - 195 kcal");

    await tool("add_meal_entries").execute(args);

    const entry = (await getDayDiary(DATE)).meals[0].entries[0];
    // La cascata ha agganciato l'alimento dell'utente: non è una voce libera
    // con i numeri del modello.
    expect(entry.food_id).not.toBeNull();
    expect(entry.is_estimated).toBe(0);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("rifiuta i valori nutrizionali passati dal modello", async () => {
    await expect(
      tool("add_meal_entries").preview({
        mealTypeId: MEAL_TYPE_IDS.lunch,
        entries: [
          {
            name: "piadina del bar",
            quantityG: 200,
            nutrients: { kcal: 320, protein: 12 },
          },
        ],
      }),
    ).rejects.toThrow(AiResponseError);
  });

  it("rifiuta un etto non convertito invece di registrare 2 g di riso", async () => {
    const foodId = await createRice();

    await expect(
      tool("add_meal_entries").preview({
        date: DATE,
        mealTypeId: MEAL_TYPE_IDS.lunch,
        entries: [{ name: "riso", foodId, quantityG: 2 }],
      }),
    ).rejects.toThrow(AiResponseError);
  });

  it("chiede la quantità invece di indovinarla", async () => {
    await createRice();

    await expect(
      tool("add_meal_entries").preview({
        date: DATE,
        mealTypeId: MEAL_TYPE_IDS.lunch,
        entries: [{ name: "riso" }],
      }),
    ).rejects.toThrow(/Quantità mancante/);
  });

  it("stima un alimento sconosciuto scalando i valori per 100 g sulla quantità", async () => {
    aiEstimate("Piadina del bar", 300);
    const args = {
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      entries: [{ name: "piadina del bar", quantityG: 200 }],
    };

    // Stessa interazione per anteprima ed esecuzione, come fa runAssistant.
    const current = interaction();
    const preview = await current("add_meal_entries").preview(args);
    expect(preview.lines[0]).toContain("Piadina del bar (stima) - 200 g - 600 kcal");

    // Una seconda stima con numeri diversi: l'esecuzione deve scrivere quello
    // che l'utente ha confermato, non un nuovo tiro di dadi.
    aiEstimate("Piadina del bar", 900);
    await current("add_meal_entries").execute(args);

    const diary = await getDayDiary(DATE);
    expect(Math.round(diary.totals.kcal)).toBe(600);
    expect(diary.meals[0].entries[0].is_estimated).toBe(1);
  });

  it("una NUOVA interazione ripassa dalla cascata invece di riusare la stima vecchia", async () => {
    // La memoria delle risoluzioni vale per una frase sola: se nel frattempo
    // l'alimento entra in libreria, la volta dopo deve vincere il match locale.
    aiEstimate("Piadina del bar", 300);
    const args = {
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      entries: [{ name: "piadina del bar", quantityG: 200 }],
    };
    await interaction()("add_meal_entries").execute(args);

    aiEstimate("Piadina del bar", 900);
    await interaction()("add_meal_entries").execute(args);

    const diary = await getDayDiary(DATE);
    // 600 dalla prima stima + 1800 dalla seconda: la memoria non ha attraversato
    // le due interazioni.
    expect(Math.round(diary.totals.kcal)).toBe(2400);
  });

  it("rifiuta un tipo di pasto inesistente", async () => {
    const foodId = await createRice();
    await expect(
      tool("add_meal_entries").preview({
        mealTypeId: "mt-inventato",
        entries: [{ name: "riso", foodId, quantityG: 100 }],
      }),
    ).rejects.toThrow(AiResponseError);
  });

  it("rifiuta porzioni non positive invece di scrivere una riga a zero", async () => {
    const foodId = await createRice();
    const recipeId = await createRecipe({
      name: "Iper pizza proteica",
      servings: 2,
      items: [{ foodId, quantityG: 200 }],
    });

    await expect(
      tool("add_meal_entries").execute({
        date: DATE,
        mealTypeId: MEAL_TYPE_IDS.dinner,
        entries: [{ name: "iper pizza", recipeId, servings: -1 }],
      }),
    ).rejects.toThrow(AiResponseError);
    expect((await getDayDiary(DATE)).meals).toHaveLength(0);
  });
});

describe("delete_entry", () => {
  const addRice = async (): Promise<string> => {
    const foodId = await createRice();
    await tool("add_meal_entries").execute({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      entries: [{ name: "riso", foodId, quantityG: 150 }],
    });
    return (await getDayDiary(DATE)).meals[0].entries[0].id;
  };

  it("cancella la riga e nomina in anteprima quello che sparisce", async () => {
    const entryId = await addRice();

    const args = { date: DATE, entryId, label: "riso" };
    const preview = await tool("delete_entry").preview(args);
    expect(preview.lines[0]).toBe("Riso - 195 kcal (pranzo del 28/08)");

    const result = await tool("delete_entry").execute(args);
    expect(result.message).toBe("Eliminato: Riso.");
    expect((await getDayDiary(DATE)).meals).toHaveLength(0);
  });

  it("un id inventato non arriva alla richiesta di conferma", async () => {
    await addRice();

    await expect(
      tool("delete_entry").preview({ date: DATE, entryId: "entry-inventato" }),
    ).rejects.toThrow(AiResponseError);
  });

  it("non dice Eliminato quando non c'è niente da eliminare", async () => {
    const entryId = await addRice();
    await tool("delete_entry").execute({ date: DATE, entryId });

    await expect(
      tool("delete_entry").execute({ date: DATE, entryId }),
    ).rejects.toThrow(AiResponseError);
  });
});

describe("query_summary", () => {
  it("dice quanto manca a obiettivo su calorie, macro e passi", async () => {
    const foodId = await createRice();
    await saveTargets({
      validFrom: "2026-01-01",
      kcal: 2200,
      proteinG: 160,
      carbsG: 250,
      fatG: 70,
      steps: 10000,
    });
    await setSteps(DATE, 6200);
    await tool("add_meal_entries").execute({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      entries: [{ name: "riso", foodId, quantityG: 1000 }],
    });

    const result = await tool("query_summary").execute({ date: DATE });

    expect(result.message).toContain("Calorie: 1300 su 2200 (mancano 900)");
    expect(result.message).toContain("Passi: 6200 su 10000 (mancano 3800)");
  });

  it("senza obiettivi riporta i totali invece di fingere un residuo", async () => {
    const result = await tool("query_summary").execute({ date: DATE });
    expect(result.message).toContain("Nessun obiettivo impostato");
  });

  it("sforare si legge come tale", async () => {
    const foodId = await createRice();
    await saveTargets({
      validFrom: "2026-01-01",
      kcal: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
      steps: 1,
    });
    await tool("add_meal_entries").execute({
      date: DATE,
      mealTypeId: MEAL_TYPE_IDS.lunch,
      entries: [{ name: "riso", foodId, quantityG: 200 }],
    });

    expect((await tool("query_summary").execute({ date: DATE })).message).toContain(
      "sforato di 160",
    );
  });

  it("a obiettivo centrato non dice sforato di 0", async () => {
    await saveTargets({
      validFrom: "2026-01-01",
      kcal: 2200,
      proteinG: 160,
      carbsG: 250,
      fatG: 70,
      steps: 10000,
    });
    await setSteps(DATE, 10000);

    const message = (await tool("query_summary").execute({ date: DATE })).message;

    expect(message).toContain("Passi: 10000 su 10000 (obiettivo raggiunto)");
    expect(message).not.toContain("sforato di 0");
  });
});

describe("set_target", () => {
  beforeEach(async () => {
    await saveTargets({
      validFrom: "2026-01-01",
      kcal: 2200,
      proteinG: 160,
      carbsG: 250,
      fatG: 70,
      steps: 10000,
    });
  });

  it("cambia solo il valore detto e conserva gli altri", async () => {
    const args = { validFrom: DATE, kcal: 2400 };

    const preview = await tool("set_target").preview(args);
    expect(preview.lines).toEqual(["Calorie: 2200 → 2400"]);

    await tool("set_target").execute(args);
    const saved = await getTargetsFor(DATE);
    expect(saved?.kcal).toBe(2400);
    expect(saved?.protein_g).toBe(160);
    expect(saved?.valid_from).toBe(DATE);
  });

  it("rifiuta una chiamata che non cambia nulla", async () => {
    await expect(tool("set_target").execute({ validFrom: DATE })).rejects.toThrow(
      AiResponseError,
    );
  });
});

describe("add_meal_entries con un pasto", () => {
  /**
   * Il difetto che questo test blocca: i grammi mandati insieme a un recipeId
   * venivano scartati in silenzio, e "duecento grammi della mia pizza"
   * finiva in diario come una porzione intera.
   */
  it("rifiuta i grammi su un pasto invece di ignorarli", async () => {
    await expect(
      tool("add_meal_entries").execute({
        date: DATE,
        mealTypeId: MEAL_TYPE_IDS.lunch,
        entries: [{ recipeId: "qualunque", quantityG: 200 }],
      }),
    ).rejects.toThrow(AiResponseError);
  });
});

describe("navigate", () => {
  const navigateMock = jest.mocked(navigationRef.navigate);
  const isReadyMock = jest.mocked(navigationRef.isReady);

  beforeEach(() => {
    navigateMock.mockClear();
    isReadyMock.mockClear().mockReturnValue(true);
  });

  /**
   * Il difetto che questo test blocca: il tool si limitava a rispondere "Apro
   * Oggi" contando su una UI che leggesse l'intento, e nessun componente lo
   * faceva. L'assistente prometteva una navigazione che non avveniva mai.
   */
  it("apre davvero la schermata, e non scrive niente", async () => {
    const preview = await tool("navigate").preview({ screen: "TodayTab" });
    expect(preview.lines).toEqual(["Apro Oggi."]);

    const result = await tool("navigate").execute({ screen: "TodayTab" });
    expect(result.message).toBe("Apro Oggi.");
    expect(navigateMock).toHaveBeenCalledWith("TodayTab", undefined);
    expect((await getDayDiary(DATE)).meals).toHaveLength(0);
  });

  it("passa i parametri della rotta", async () => {
    await tool("navigate").execute({
      screen: "FoodForm",
      params: { id: "abc" },
    });
    expect(navigateMock).toHaveBeenCalledWith("FoodForm", { id: "abc" });
  });

  it("non finge di navigare se la navigazione non e' pronta", async () => {
    isReadyMock.mockReturnValueOnce(false);
    await expect(
      tool("navigate").execute({ screen: "TodayTab" }),
    ).rejects.toThrow(AiResponseError);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("rifiuta una schermata che non esiste", async () => {
    await expect(
      tool("navigate").execute({ screen: "PaginaInventata" }),
    ).rejects.toThrow(AiResponseError);
  });
});
