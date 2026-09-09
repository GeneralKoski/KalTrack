import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  deleteSteps,
  deleteWeight,
  getSteps,
  getWeight,
  latestWeight,
  listSteps,
  listWeights,
  setSteps,
  setWeight,
  stepsInRange,
} from "@/src/db/queries/tracking";

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("setSteps", () => {
  it("salva e rilegge", async () => {
    await setSteps("2026-08-28", 8432);
    expect((await getSteps("2026-08-28"))?.steps).toBe(8432);
  });

  it("riscrivere lo stesso giorno sostituisce invece di sommare", async () => {
    await setSteps("2026-08-28", 8000);
    await setSteps("2026-08-28", 12000);

    expect((await getSteps("2026-08-28"))?.steps).toBe(12000);
    expect(await listSteps("2026-08-01", "2026-08-31")).toHaveLength(1);
  });

  it("registra la sorgente", async () => {
    await setSteps("2026-08-28", 9000, "voice");
    expect((await getSteps("2026-08-28"))?.source).toBe("voice");
  });

  /**
   * `StepsHistoryScreen` corregge un giorno chiamando `setSteps(date, value)`
   * a due argomenti: senza questa garanzia, correggere un valore arrivato da
   * Health Connect o dalla voce ne riscriverebbe la sorgente a "manual" in
   * silenzio, perdendo la provenienza di un dato che nessuno intendeva
   * toccare.
   */
  it("correggere il valore senza indicare una sorgente non tocca quella già scritta", async () => {
    await setSteps("2026-08-28", 8000, "health");
    await setSteps("2026-08-28", 8200);
    expect((await getSteps("2026-08-28"))?.source).toBe("health");
  });

  /**
   * L'altra metà della garanzia sopra: il parametro legato due volte serve a
   * distinguere "non fornito" (preserva) da "fornito" (sostituisce), e senza
   * questo test solo la prima metà era pinnata - una COALESCE scritta al
   * contrario (che ignorasse sempre il terzo argomento) avrebbe superato la
   * suite lo stesso. Un giorno scritto da Health Connect e poi corretto
   * dall'assistente (voce) deve finire "voice", non restare "health".
   */
  it("correggere indicando esplicitamente un'altra sorgente la sostituisce", async () => {
    await setSteps("2026-08-28", 8000, "health");
    await setSteps("2026-08-28", 8200, "voice");
    expect((await getSteps("2026-08-28"))?.source).toBe("voice");
  });

  /**
   * `updated_at` e' quel che decide se una correzione viaggia: il push
   * seleziona per quella colonna, e chi corregge il valore di un giorno gia'
   * scritto (§ Storico passi in CLAUDE.md) si aspetta che l'altro telefono lo
   * veda. Senza `updated_at = excluded.updated_at` nell'upsert, una riscrittura
   * lascerebbe la colonna com'era e la correzione resterebbe locale per
   * sempre, senza nessun segno a schermo.
   */
  it("una correzione sposta updated_at in avanti, o non viaggia", async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));
      await setSteps("2026-08-28", 8000);
      const first = await getSteps("2026-08-28");

      jest.setSystemTime(new Date("2026-08-28T09:00:00.000Z"));
      await setSteps("2026-08-28", 8500);
      const second = await getSteps("2026-08-28");

      expect(Date.parse(second!.updated_at)).toBeGreaterThan(
        Date.parse(first!.updated_at),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("un giorno senza dati ritorna null, non zero", async () => {
    // Distinguere "non ho camminato" da "non ho registrato" conta appena
    // compaiono le medie settimanali.
    expect(await getSteps("2026-08-28")).toBeNull();
  });

  it("rifiuta un valore negativo", async () => {
    await expect(setSteps("2026-08-28", -5)).rejects.toThrow();
  });
});

describe("listSteps", () => {
  it("filtra per intervallo, estremi inclusi, in ordine di data", async () => {
    await setSteps("2026-08-23", 100);
    await setSteps("2026-08-24", 200);
    await setSteps("2026-08-30", 300);

    const rows = await listSteps("2026-08-24", "2026-08-30");
    expect(rows.map((r) => r.steps)).toEqual([200, 300]);
  });

  it("su un intervallo vuoto ritorna lista vuota", async () => {
    expect(await listSteps("2026-01-01", "2026-01-31")).toEqual([]);
  });
});

describe("deleteSteps", () => {
  it("rimuove la misura del giorno", async () => {
    await setSteps("2026-08-28", 8000);
    await deleteSteps("2026-08-28");
    expect(await getSteps("2026-08-28")).toBeNull();
  });

  it("dopo la cancellazione il giorno si può reinserire", async () => {
    await setSteps("2026-08-28", 8000);
    await deleteSteps("2026-08-28");
    await setSteps("2026-08-28", 3000);
    expect((await getSteps("2026-08-28"))?.steps).toBe(3000);
  });
});

describe("setWeight", () => {
  it("salva peso e percentuale di grasso", async () => {
    await setWeight("2026-08-28", 78.5, 14.2);
    const row = await getWeight("2026-08-28");
    expect(row?.weight_kg).toBe(78.5);
    expect(row?.body_fat_pct).toBe(14.2);
  });

  it("riscrivere lo stesso giorno sostituisce", async () => {
    await setWeight("2026-08-28", 78.5);
    await setWeight("2026-08-28", 78.1);
    expect((await getWeight("2026-08-28"))?.weight_kg).toBe(78.1);
    expect(await listWeights("2026-08-01", "2026-08-31")).toHaveLength(1);
  });

  it("rifiuta un peso non positivo", async () => {
    await expect(setWeight("2026-08-28", 0)).rejects.toThrow();
  });

  /**
   * `WeightHistoryScreen` corregge un giorno chiamando `setWeight(date, value)`
   * a due argomenti: senza questa garanzia, correggere solo il peso di un
   * giorno che portava già percentuale di grasso e nota le cancellerebbe in
   * silenzio, senza un modo per tornare indietro.
   */
  it("correggere il peso senza indicare grasso o nota non li cancella", async () => {
    await setWeight("2026-08-28", 78.5, 18, "dopo la corsa");
    await setWeight("2026-08-28", 78.8);
    const row = await getWeight("2026-08-28");
    expect(row?.weight_kg).toBe(78.8);
    expect(row?.body_fat_pct).toBe(18);
    expect(row?.note).toBe("dopo la corsa");
  });

  /**
   * L'altra metà: il COALESCE preserva quel che non è fornito, ma non deve
   * bloccare una correzione che indica esplicitamente un grasso o una nota
   * diversi - senza questo test una COALESCE scritta al contrario (che
   * ignorasse sempre i nuovi valori) avrebbe superato la suite lo stesso.
   */
  it("correggere indicando esplicitamente grasso o nota diversi li sostituisce", async () => {
    await setWeight("2026-08-28", 78.5, 18, "dopo la corsa");
    await setWeight("2026-08-28", 78.8, 20, "a digiuno");
    const row = await getWeight("2026-08-28");
    expect(row?.weight_kg).toBe(78.8);
    expect(row?.body_fat_pct).toBe(20);
    expect(row?.note).toBe("a digiuno");
  });

  /**
   * Come per `setSteps`: senza `updated_at = excluded.updated_at` nell'upsert,
   * correggere il peso di un giorno gia' scritto (§ Storico peso) lascerebbe
   * la colonna com'era e la correzione non viaggerebbe verso l'altro
   * telefono, senza nessun segno a schermo.
   */
  it("una correzione sposta updated_at in avanti, o non viaggia", async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-08-28T08:00:00.000Z"));
      await setWeight("2026-08-28", 78.5);
      const first = await getWeight("2026-08-28");

      jest.setSystemTime(new Date("2026-08-28T09:00:00.000Z"));
      await setWeight("2026-08-28", 78.1);
      const second = await getWeight("2026-08-28");

      expect(Date.parse(second!.updated_at)).toBeGreaterThan(
        Date.parse(first!.updated_at),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("latestWeight", () => {
  it("ritorna la misura più recente", async () => {
    await setWeight("2026-08-20", 79);
    await setWeight("2026-08-28", 78.2);
    expect((await latestWeight())?.weight_kg).toBe(78.2);
  });

  it("senza misure ritorna null", async () => {
    expect(await latestWeight()).toBeNull();
  });

  it("ignora le misure cancellate", async () => {
    await setWeight("2026-08-20", 79);
    await setWeight("2026-08-28", 78.2);
    await deleteWeight("2026-08-28");
    expect((await latestWeight())?.weight_kg).toBe(79);
  });
});

describe("stepsInRange", () => {
  it("somma i passi dei giorni nell'intervallo", async () => {
    await setSteps("2026-08-24", 8000);
    await setSteps("2026-08-27", 4000);
    await setSteps("2026-09-02", 99000);

    expect(await stepsInRange("2026-08-24", "2026-08-30")).toBe(12000);
  });

  /**
   * Null e non zero: "non ho registrato" e "ho fatto zero passi" restano due
   * fatti diversi anche su una settimana intera.
   */
  it("senza nessuna registrazione torna null", async () => {
    expect(await stepsInRange("2026-08-24", "2026-08-30")).toBeNull();
  });
});
