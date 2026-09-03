import { chat } from "@/src/ai/client";
import { hasAiKey } from "@/src/ai/config";
import { AiRequestError } from "@/src/ai/errors";
import { rankAlternatives } from "@/src/ai/rankAlternatives";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  createExercise,
  setEquipmentAvailability,
  setExerciseDislike,
  toggleExerciseBan,
} from "@/src/db/queries/exercises";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import type { Equipment } from "@/src/types/gym";

jest.mock("@/src/ai/client");
jest.mock("@/src/ai/config", () => ({
  ...jest.requireActual("@/src/ai/config"),
  hasAiKey: jest.fn(),
}));

const chatMock = chat as jest.MockedFunction<typeof chat>;
const hasAiKeyMock = hasAiKey as jest.MockedFunction<typeof hasAiKey>;

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  chatMock.mockReset();
  hasAiKeyMock.mockReset();
  hasAiKeyMock.mockReturnValue(true);
});

afterEach(() => __setDbForTesting(null));

/** A corpo libero salvo diversa indicazione: così il filtro attrezzatura non interferisce. */
const addExercise = (
  name: string,
  equipment: Equipment[] = [],
): Promise<string> =>
  createExercise({
    name,
    muscleGroup: "petto",
    secondaryMuscles: [],
    equipment,
  });

const aiRanking = (ranking: unknown): void => {
  chatMock.mockResolvedValue({
    content: JSON.stringify({ ranking }),
    toolCalls: [],
    usage: null,
  });
};

/** Tre candidati a corpo libero, in ordine locale alfabetico. */
async function seedScenario(): Promise<{
  source: string;
  alpha: string;
  beta: string;
  gamma: string;
}> {
  const source = await addExercise("Zulu esercizio di partenza");
  const alpha = await addExercise("Alpha piegamenti");
  const beta = await addExercise("Beta dip");
  const gamma = await addExercise("Gamma croci");
  return { source, alpha, beta, gamma };
}

const ids = (result: { exercise: { id: string } }[]): string[] =>
  result.map((entry) => entry.exercise.id);

describe("rankAlternatives senza AI", () => {
  it("restituisce i candidati locali quando manca la chiave, senza chiamare il modello", async () => {
    const { source, alpha, beta, gamma } = await seedScenario();
    hasAiKeyMock.mockReturnValue(false);

    const result = await rankAlternatives({ exerciseId: source });

    expect(ids(result)).toEqual([alpha, beta, gamma]);
    expect(result.every((entry) => entry.reason === null)).toBe(true);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("ripiega sull'ordine locale se la chiamata AI fallisce", async () => {
    const { source, alpha, beta, gamma } = await seedScenario();
    chatMock.mockRejectedValue(new AiRequestError("Nessuna risposta"));

    const result = await rankAlternatives({ exerciseId: source });

    expect(ids(result)).toEqual([alpha, beta, gamma]);
    expect(result.every((entry) => entry.reason === null)).toBe(true);
  });

  it("ripiega sull'ordine locale se la risposta non è JSON valido", async () => {
    const { source, alpha, beta, gamma } = await seedScenario();
    chatMock.mockResolvedValue({
      content: "non sono JSON",
      toolCalls: [],
      usage: null,
    });

    const result = await rankAlternatives({ exerciseId: source });

    expect(ids(result)).toEqual([alpha, beta, gamma]);
  });
});

describe("rankAlternatives con AI", () => {
  it("applica l'ordine del modello e conserva le motivazioni", async () => {
    const { source, alpha, beta, gamma } = await seedScenario();
    aiRanking([
      { id: gamma, reason: "Stesso angolo di lavoro sul petto." },
      { id: alpha, reason: "Movimento simile, carico progressivo facile." },
      { id: beta, reason: "Più esigente sulle spalle." },
    ]);

    const result = await rankAlternatives({ exerciseId: source });

    expect(ids(result)).toEqual([gamma, alpha, beta]);
    expect(result[0].reason).toBe("Stesso angolo di lavoro sul petto.");
  });

  it("scarta un id che il modello si è inventato", async () => {
    const { source, alpha, beta, gamma } = await seedScenario();
    aiRanking([
      { id: "ex-inventato-dal-modello", reason: "Non esiste." },
      { id: alpha, reason: "Buon sostituto." },
    ]);

    const result = await rankAlternatives({ exerciseId: source });

    expect(ids(result)).not.toContain("ex-inventato-dal-modello");
    // I candidati ignorati dal modello restano, in coda e in ordine locale.
    expect(ids(result)).toEqual([alpha, beta, gamma]);
    expect(result[0].reason).toBe("Buon sostituto.");
    expect(result[1].reason).toBeNull();
  });

  it("non reintroduce un esercizio vietato proposto dal modello", async () => {
    const { source, alpha, beta, gamma } = await seedScenario();
    const vietato = await addExercise("Aaa esercizio vietato");
    await toggleExerciseBan(vietato);
    aiRanking([
      { id: vietato, reason: "Sarebbe il migliore." },
      { id: alpha, reason: "Ripiego." },
    ]);

    const result = await rankAlternatives({ exerciseId: source });

    expect(ids(result)).toEqual([alpha, beta, gamma]);
  });

  it("ignora i duplicati e le voci malformate del modello", async () => {
    const { source, alpha, beta, gamma } = await seedScenario();
    aiRanking([
      { id: beta, reason: "Primo." },
      { id: beta, reason: "Ripetuto." },
      null,
      { reason: "Senza id." },
      { id: alpha, reason: "   " },
    ]);

    const result = await rankAlternatives({ exerciseId: source });

    expect(ids(result)).toEqual([beta, alpha, gamma]);
    // Una motivazione fatta di soli spazi non è una motivazione.
    expect(result[1].reason).toBeNull();
  });

  it("rispetta il limite e passa al modello solo i candidati locali", async () => {
    const { source, alpha, beta } = await seedScenario();
    aiRanking([{ id: beta, reason: "Meglio." }]);

    const result = await rankAlternatives({ exerciseId: source, limit: 2 });

    expect(ids(result)).toEqual([beta, alpha]);
    const prompt = String(chatMock.mock.calls[0][0].messages[1].content);
    expect(prompt).toContain(alpha);
    expect(prompt).toContain(beta);
  });
});

describe("rankAlternatives, casi limite", () => {
  it("restituisce una lista vuota se l'esercizio di partenza non esiste", async () => {
    const result = await rankAlternatives({ exerciseId: "ex-inesistente" });

    expect(result).toEqual([]);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("esclude i candidati che richiedono attrezzatura non posseduta", async () => {
    const source = await addExercise("Zulu esercizio di partenza");
    const corpoLibero = await addExercise("Alpha piegamenti");
    await addExercise("Beta panca", ["bilanciere", "panca"]);
    // Tutto e' disponibile per eccezione: va tolta esplicitamente "panca".
    await setEquipmentAvailability("panca", false);
    hasAiKeyMock.mockReturnValue(false);

    const result = await rankAlternatives({ exerciseId: source });

    // "panca" non è disponibile: l'esercizio che la richiede non è proponibile.
    expect(ids(result)).toEqual([corpoLibero]);
  });

  it("mette in coda gli sgraditi anche quando l'AI non è disponibile", async () => {
    const { source, alpha, beta, gamma } = await seedScenario();
    await setExerciseDislike(alpha, 2);
    hasAiKeyMock.mockReturnValue(false);

    const result = await rankAlternatives({ exerciseId: source });

    expect(ids(result)).toEqual([beta, gamma, alpha]);
  });
});
