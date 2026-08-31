import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { addFoodEntry, addFreeEntry } from "@/src/db/queries/diary";
import { createExercise } from "@/src/db/queries/exercises";
import { createFood } from "@/src/db/queries/foods";
import { setSteps, setWeight } from "@/src/db/queries/tracking";
import { logSet, startSession } from "@/src/db/queries/workouts";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import {
  buildCsv,
  buildDatasetCsv,
  csvEscape,
  csvFileName,
  CSV_DELIMITER,
  exportCsvToFile,
  shareCsv,
  UTF8_BOM,
} from "@/src/services/csvExport";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

/**
 * Parser RFC 4180 minimo. Serve a verificare l'export leggendolo come lo
 * leggerebbe un foglio di calcolo, invece di confrontare stringhe intere:
 * un errore di quoting si vede solo se si prova a rimettere insieme le celle.
 */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (quoted) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === CSV_DELIMITER) {
      row.push(field);
      field = "";
    } else if (char === "\r" && content[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

const freshDb = async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
};

beforeEach(async () => {
  jest.clearAllMocks();
  await freshDb();
});
afterEach(() => __setDbForTesting(null));

describe("csvEscape", () => {
  it("lascia intatto un testo senza caratteri speciali", () => {
    expect(csvEscape("Petto di pollo")).toBe("Petto di pollo");
  });

  it("racchiude e raddoppia le virgolette di un nome italiano", () => {
    // Il caso vero: virgolette dentro il nome, più una virgola.
    expect(csvEscape('Insalata "mista", con tonno')).toBe(
      '"Insalata ""mista"", con tonno"',
    );
  });

  it("non tocca l'apostrofo, che non è un carattere speciale del CSV", () => {
    expect(csvEscape("Ricotta d'alpeggio")).toBe("Ricotta d'alpeggio");
  });

  it("racchiude un valore che contiene il separatore di campo", () => {
    expect(csvEscape("Pane; integrale")).toBe('"Pane; integrale"');
  });

  it("tiene una nota su più righe dentro il suo campo", () => {
    expect(csvEscape("prima riga\nseconda riga")).toBe(
      '"prima riga\nseconda riga"',
    );
  });

  it("racchiude un valore con spazi ai bordi, che altrimenti si perdono", () => {
    expect(csvEscape("  Riso  ")).toBe('"  Riso  "');
  });

  it("scrive i decimali con la virgola", () => {
    expect(csvEscape(12.5)).toBe("12,5");
    expect(csvEscape(0.333333)).toBe("0,33");
  });

  it("non aggiunge decimali inutili a un intero", () => {
    expect(csvEscape(358)).toBe("358");
  });

  it("distingue un dato assente da uno zero", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(0)).toBe("0");
  });

  it("non scrive uno zero col segno", () => {
    expect(csvEscape(-0.001)).toBe("0");
  });
});

describe("csvEscape: CSV injection", () => {
  // Excel valuta come formula una cella che inizia con =, +, - o @.
  it.each([
    ["=1+1", "'=1+1"],
    ["=cmd|'/c calc'!A1", "'=cmd|'/c calc'!A1"],
    ["+39 333 1234567", "'+39 333 1234567"],
    ["-tonno sott'olio", "'-tonno sott'olio"],
    ["@pranzo fuori", "'@pranzo fuori"],
    ["\tinizio con tab", "'\tinizio con tab"],
  ])("neutralizza %p", (input, expected) => {
    expect(csvEscape(input)).toBe(expected);
  });

  it("neutralizza anche quando il valore va comunque racchiuso", () => {
    expect(csvEscape('=CONCATENA("a";"b")')).toBe(
      '"\'=CONCATENA(""a"";""b"")"',
    );
  });

  it("non neutralizza un numero negativo, che resta un numero", () => {
    expect(csvEscape(-2.5)).toBe("-2,5");
  });
});

describe("buildCsv", () => {
  it("separa i record con CRLF e i campi col separatore scelto", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"]]);
    expect(csv).toBe("a;b\r\n1;2");
  });

  it("una cella con a capo non aggiunge un record", () => {
    const csv = buildCsv(["nota"], [["riga uno\nriga due"]]);
    expect(parseCsv(csv)).toEqual([["nota"], ["riga uno\nriga due"]]);
  });
});

describe("export del diario", () => {
  const seedDiary = async () => {
    const insalata = await createFood({
      name: 'Insalata "mista", con tonno',
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 120, protein: 9.5, carbs: 3.2, fat: 7 },
    });
    await addFoodEntry({
      date: "2026-08-20",
      mealTypeId: MEAL_TYPE_IDS.lunch,
      foodId: insalata,
      quantityG: 250,
    });
    await addFreeEntry({
      date: "2026-08-20",
      mealTypeId: MEAL_TYPE_IDS.dinner,
      label: "Pizza margherita; da Gennaro",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 850, protein: 30, carbs: 100, fat: 30 },
      isEstimated: true,
      note: "Bordo lasciato\nBirra piccola a parte",
    });
  };

  it("scrive una riga per voce con nome, quantità, kcal e macro", async () => {
    await seedDiary();
    const rows = parseCsv(await buildDatasetCsv("diary"));

    expect(rows).toHaveLength(3);
    const [headers, pranzo, cena] = rows;
    expect(headers.slice(0, 6)).toEqual([
      "data",
      "pasto",
      "alimento",
      "quantità",
      "unità",
      "kcal",
    ]);

    expect(pranzo[0]).toBe("2026-08-20");
    expect(pranzo[1]).toBe("Pranzo");
    expect(pranzo[2]).toBe('Insalata "mista", con tonno');
    expect(pranzo[3]).toBe("250");
    expect(pranzo[4]).toBe("g");
    expect(pranzo[5]).toBe("300");
    expect(pranzo[headers.indexOf("proteine_g")]).toBe("23,75");

    expect(cena[2]).toBe("Pizza margherita; da Gennaro");
    expect(cena[4]).toBe("porzioni");
    expect(cena[headers.indexOf("stimato")]).toBe("sì");
  });

  it("una nota su più righe resta in una sola riga di dati", async () => {
    await seedDiary();
    const csv = await buildDatasetCsv("diary");
    const rows = parseCsv(csv);

    const cena = rows[2];
    expect(cena[rows[0].indexOf("nota")]).toBe(
      "Bordo lasciato\nBirra piccola a parte",
    );
    // Ogni riga ha lo stesso numero di colonne: se il quoting cedesse,
    // l'a capo dentro la nota ne creerebbe una in più.
    for (const row of rows) expect(row).toHaveLength(rows[0].length);
  });

  it("un alimento che inizia con uguale non diventa una formula", async () => {
    const id = await createFood({
      name: "=1+1 formaggio",
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 300 },
    });
    await addFoodEntry({
      date: "2026-08-21",
      mealTypeId: MEAL_TYPE_IDS.snack,
      foodId: id,
      quantityG: 100,
    });

    const rows = parseCsv(await buildDatasetCsv("diary"));
    expect(rows[1][2]).toBe("'=1+1 formaggio");
  });

  it("esporta solo le intestazioni quando non c'è nulla", async () => {
    const rows = parseCsv(await buildDatasetCsv("diary"));
    expect(rows).toHaveLength(1);
  });
});

describe("export di peso e passi", () => {
  it("esporta il peso e lascia vuota la massa grassa non misurata", async () => {
    await setWeight("2026-08-20", 78.4, 18.2, "dopo colazione");
    await setWeight("2026-08-21", 78.15);

    const rows = parseCsv(await buildDatasetCsv("weight"));
    expect(rows[0]).toEqual(["data", "peso_kg", "massa_grassa_pct", "nota"]);
    expect(rows[1]).toEqual(["2026-08-20", "78,4", "18,2", "dopo colazione"]);
    // Assente, non zero: uno 0 qui sarebbe un crollo mai avvenuto.
    expect(rows[2]).toEqual(["2026-08-21", "78,15", "", ""]);
  });

  it("esporta i passi in ordine di data", async () => {
    await setSteps("2026-08-21", 12030);
    await setSteps("2026-08-20", 8500);

    const rows = parseCsv(await buildDatasetCsv("steps"));
    expect(rows[0]).toEqual(["data", "passi", "origine"]);
    expect(rows[1]).toEqual(["2026-08-20", "8500", "manual"]);
    expect(rows[2]).toEqual(["2026-08-21", "12030", "manual"]);
  });
});

describe("export degli allenamenti", () => {
  it("scrive una riga per serie, numerata da 1", async () => {
    const panca = await createExercise({
      name: "Panca piana con bilanciere",
      muscleGroup: "petto",
      secondaryMuscles: ["tricipiti"],
      equipment: ["bilanciere", "panca"],
    });
    const session = await startSession({ date: "2026-08-22" });
    await logSet({
      sessionId: session,
      exerciseId: panca,
      setIndex: 0,
      reps: 12,
      weight: 40,
      isWarmup: true,
    });
    await logSet({
      sessionId: session,
      exerciseId: panca,
      setIndex: 1,
      reps: 8,
      weight: 72.5,
      rpe: 8.5,
    });

    const rows = parseCsv(await buildDatasetCsv("workouts"));
    expect(rows).toHaveLength(3);

    const headers = rows[0];
    expect(rows[1][headers.indexOf("esercizio")]).toBe(
      "Panca piana con bilanciere",
    );
    expect(rows[1][headers.indexOf("serie")]).toBe("1");
    expect(rows[1][headers.indexOf("riscaldamento")]).toBe("sì");

    expect(rows[2][headers.indexOf("serie")]).toBe("2");
    expect(rows[2][headers.indexOf("peso_kg")]).toBe("72,5");
    expect(rows[2][headers.indexOf("rpe")]).toBe("8,5");
    expect(rows[2][headers.indexOf("riscaldamento")]).toBe("no");
  });

  it("una serie senza ripetizioni registrate lascia la cella vuota", async () => {
    const plank = await createExercise({
      name: "Plank",
      muscleGroup: "addome",
      secondaryMuscles: [],
      equipment: ["corpo_libero"],
    });
    const session = await startSession({ date: "2026-08-23" });
    await logSet({
      sessionId: session,
      exerciseId: plank,
      setIndex: 0,
      reps: null,
      weight: null,
    });

    const rows = parseCsv(await buildDatasetCsv("workouts"));
    const headers = rows[0];
    expect(rows[1][headers.indexOf("ripetizioni")]).toBe("");
    expect(rows[1][headers.indexOf("peso_kg")]).toBe("");
  });
});

describe("scrittura del file e condivisione", () => {
  it("scrive il CSV preceduto dal BOM UTF-8", async () => {
    await setSteps("2026-08-20", 8500);
    const path = await exportCsvToFile("steps");

    expect(path).toBe(`file:///documents/${csvFileName("steps")}`);
    const [, content] = jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0];
    expect(content.startsWith(UTF8_BOM)).toBe(true);
    expect(content.slice(1)).toBe(await buildDatasetCsv("steps"));
  });

  it("il nome del file porta la data dell'export", () => {
    expect(csvFileName("diary", new Date("2026-08-29T10:00:00.000Z"))).toBe(
      "kaltrack-diario-2026-08-29.csv",
    );
  });

  it("apre il foglio di condivisione sul file appena scritto", async () => {
    await shareCsv("weight");

    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      `file:///documents/${csvFileName("weight")}`,
      expect.objectContaining({ mimeType: "text/csv" }),
    );
  });

  it("segnala l'errore se la condivisione non è disponibile", async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    // Un tocco che non produce nulla è indistinguibile da un'app rotta.
    await expect(shareCsv("weight")).rejects.toThrow(/condivisione/);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

describe("nome del file", () => {
  /**
   * Il difetto che questo test blocca: la data usciva da toISOString(), cioè
   * in UTC. Un export fatto alle 00:30 italiane finiva in un file datato ieri.
   */
  it("usa la data del calendario locale, non UTC", () => {
    const justAfterMidnightInItaly = new Date(2026, 2, 15, 0, 30);
    expect(csvFileName("diary", justAfterMidnightInItaly)).toContain(
      "2026-03-15",
    );
  });
});
