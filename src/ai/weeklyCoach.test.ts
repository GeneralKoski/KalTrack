import { chat } from "@/src/ai/client";
import { hasGroqKey } from "@/src/ai/config";
import {
  MIN_LOGGED_DAYS,
  weeklyReview,
  weeklyStats,
} from "@/src/ai/weeklyCoach";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { addFreeEntry } from "@/src/db/queries/diary";
import { createExercise } from "@/src/db/queries/exercises";
import { saveTargets } from "@/src/db/queries/settings";
import { setSteps, setWeight } from "@/src/db/queries/tracking";
import { logSet, startSession } from "@/src/db/queries/workouts";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";

jest.mock("@/src/ai/client");
jest.mock("@/src/ai/config", () => ({
  ...jest.requireActual("@/src/ai/config"),
  hasGroqKey: jest.fn(),
}));

const chatMock = chat as jest.MockedFunction<typeof chat>;
const hasGroqKeyMock = hasGroqKey as jest.MockedFunction<typeof hasGroqKey>;

/** Ultimo giorno della finestra: la settimana va dal 22 al 28 agosto. */
const TODAY = "2026-08-28";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  chatMock.mockReset();
  hasGroqKeyMock.mockReset();
  hasGroqKeyMock.mockReturnValue(true);
});

afterEach(() => __setDbForTesting(null));

const logDay = (date: string, kcal: number, protein: number): Promise<string> =>
  addFreeEntry({
    date,
    mealTypeId: MEAL_TYPE_IDS.lunch,
    label: "Pasto",
    nutrients: { ...EMPTY_NUTRIENTS, kcal, protein },
  });

const setTargets = (): Promise<void> =>
  saveTargets({
    validFrom: "2026-01-01",
    kcal: 2000,
    proteinG: 140,
    carbsG: 200,
    fatG: 70,
    steps: 10000,
  });

async function logWorkout(date: string): Promise<void> {
  const exerciseId = await createExercise({
    name: `Panca ${date}`,
    muscleGroup: "petto",
    secondaryMuscles: [],
    equipment: [],
  });
  const sessionId = await startSession({ date });
  await logSet({ sessionId, exerciseId, setIndex: 1, reps: 8, weight: 60 });
}

/** La settimana di riferimento usata da quasi tutti i casi. */
async function seedFullWeek(): Promise<void> {
  await setTargets();
  await logDay("2026-08-24", 2000, 100);
  await logDay("2026-08-26", 2200, 110);
  await logDay(TODAY, 2400, 120);
  await setSteps("2026-08-24", 8000);
  await setSteps(TODAY, 10000);
  await setWeight("2026-08-22", 80);
  await setWeight(TODAY, 79.4);
  await logWorkout("2026-08-23");
  await logWorkout("2026-08-27");
}

const aiComment = (payload: unknown): void => {
  chatMock.mockResolvedValue({
    content: JSON.stringify(payload),
    toolCalls: [],
    usage: null,
  });
};

const COMMENT = {
  summary: "Settimana registrata a metà, con le calorie sopra l'obiettivo.",
  observations: ["Tre giorni su sette hanno un diario.", "Due allenamenti."],
  suggestion: "Registra anche la colazione nei giorni feriali.",
};

/** Il testo che è finito nel messaggio utente della chiamata. */
const promptOf = (call: number): string =>
  String(chatMock.mock.calls[call][0].messages[1].content);

describe("weeklyStats, calcolo locale", () => {
  it("media solo i giorni misurati: un giorno non registrato non è uno zero", async () => {
    await seedFullWeek();

    const stats = await weeklyStats(TODAY);

    expect(stats.from).toBe("2026-08-22");
    expect(stats.to).toBe(TODAY);
    expect(stats.loggedDays).toBe(3);
    // (2000 + 2200 + 2400) / 3, non diviso sette.
    expect(stats.kcal.average).toBeCloseTo(2200);
    expect(stats.kcal.days).toBe(3);
    expect(stats.protein.average).toBeCloseTo(110);
    expect(stats.steps.average).toBeCloseTo(9000);
    expect(stats.steps.days).toBe(2);
  });

  it("calcola lo scostamento dagli obiettivi in vigore", async () => {
    await seedFullWeek();

    const stats = await weeklyStats(TODAY);

    expect(stats.kcal.target).toBe(2000);
    expect(stats.kcal.deviation).toBeCloseTo(200);
    expect(stats.protein.deviation).toBeCloseTo(-30);
    expect(stats.steps.deviation).toBeCloseTo(-1000);
  });

  it("senza obiettivi non inventa uno scostamento", async () => {
    await logDay(TODAY, 2000, 100);

    const stats = await weeklyStats(TODAY);

    expect(stats.kcal.target).toBeNull();
    expect(stats.kcal.deviation).toBeNull();
  });

  it("conta i giorni di allenamento nella finestra, non le sessioni", async () => {
    await logWorkout("2026-08-23");
    await logWorkout("2026-08-23");
    await logWorkout("2026-08-27");
    // Fuori finestra: la settimana parte dal 22.
    await logWorkout("2026-08-10");

    const stats = await weeklyStats(TODAY);

    expect(stats.workoutDays).toBe(2);
  });

  it("calcola la variazione di peso fra la prima e l'ultima pesata", async () => {
    await seedFullWeek();

    const stats = await weeklyStats(TODAY);

    expect(stats.weight.first).toBeCloseTo(80);
    expect(stats.weight.last).toBeCloseTo(79.4);
    expect(stats.weight.changeKg).toBeCloseTo(-0.6);
    expect(stats.weight.days).toBe(2);
  });

  it("con una sola pesata non c'è variazione da mostrare", async () => {
    await setWeight(TODAY, 79.4);

    const stats = await weeklyStats(TODAY);

    expect(stats.weight.last).toBeCloseTo(79.4);
    expect(stats.weight.changeKg).toBeNull();
  });

  it("una settimana vuota non produce zeri ma assenze", async () => {
    const stats = await weeklyStats(TODAY);

    expect(stats.loggedDays).toBe(0);
    expect(stats.kcal.average).toBeNull();
    expect(stats.steps.average).toBeNull();
    expect(stats.weight.last).toBeNull();
    expect(stats.workoutDays).toBe(0);
  });
});

describe("weeklyReview, dati insufficienti", () => {
  it("con meno di tre giorni registrati NON chiama il modello", async () => {
    await setTargets();
    await logDay("2026-08-26", 2000, 100);
    await logDay(TODAY, 2200, 110);

    const review = await weeklyReview({ today: TODAY });

    expect(review.status).toBe("not_enough_data");
    expect(review.comment).toBeNull();
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("restituisce comunque le statistiche dei pochi giorni che ci sono", async () => {
    await logDay(TODAY, 2200, 110);

    const review = await weeklyReview({ today: TODAY });

    expect(review.status).toBe("not_enough_data");
    expect(review.stats.loggedDays).toBe(1);
    expect(review.stats.kcal.average).toBeCloseTo(2200);
  });

  it("la soglia è di tre giorni: al terzo il modello viene interpellato", async () => {
    await seedFullWeek();
    aiComment(COMMENT);

    const review = await weeklyReview({ today: TODAY });

    expect(review.stats.loggedDays).toBe(MIN_LOGGED_DAYS);
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(review.status).toBe("commented");
  });
});

describe("weeklyReview, senza chiave", () => {
  it("restituisce le statistiche senza tentare la rete", async () => {
    hasGroqKeyMock.mockReturnValue(false);
    await seedFullWeek();

    const review = await weeklyReview({ today: TODAY });

    expect(review.status).toBe("no_key");
    expect(review.comment).toBeNull();
    expect(chatMock).not.toHaveBeenCalled();
    expect(review.stats.kcal.average).toBeCloseTo(2200);
    expect(review.stats.steps.average).toBeCloseTo(9000);
    expect(review.stats.workoutDays).toBe(2);
    expect(review.stats.weight.changeKg).toBeCloseTo(-0.6);
  });
});

describe("weeklyReview, contenuto del prompt", () => {
  it("passa al modello le statistiche già calcolate in locale", async () => {
    await seedFullWeek();
    aiComment(COMMENT);

    await weeklyReview({ today: TODAY });

    const prompt = promptOf(0);
    expect(prompt).toContain("Giorni con diario compilato: 3 su 7");
    expect(prompt).toContain(
      "Calorie medie al giorno: 2200 kcal | obiettivo 2000 kcal | scostamento +200 kcal | misurato in 3 giorni su 7",
    );
    expect(prompt).toContain(
      "Proteine medie al giorno: 110 g | obiettivo 140 g | scostamento -30 g",
    );
    expect(prompt).toContain(
      "Passi medi al giorno: 9000 | obiettivo 10000 | scostamento -1000 | misurato in 2 giorni su 7",
    );
    expect(prompt).toContain("Giorni di allenamento: 2 su 7");
    expect(prompt).toContain(
      "Peso: da 80,0 kg a 79,4 kg | variazione -0,6 kg | 2 pesate",
    );
  });

  it("dichiara assente ciò che non è stato misurato, non zero", async () => {
    await logDay("2026-08-24", 2000, 100);
    await logDay("2026-08-26", 2200, 110);
    await logDay(TODAY, 2400, 120);
    aiComment(COMMENT);

    await weeklyReview({ today: TODAY });

    const prompt = promptOf(0);
    expect(prompt).toContain("Passi medi al giorno: non registrato");
    expect(prompt).toContain("Peso: non registrato");
    expect(prompt).toContain("obiettivo non impostato");
    expect(prompt).not.toContain("Passi medi al giorno: 0");
  });

  it("il prompt di sistema vieta l'aritmetica e i consigli medici", async () => {
    await seedFullWeek();
    aiComment(COMMENT);

    await weeklyReview({ today: TODAY });

    const system = String(chatMock.mock.calls[0][0].messages[0].content);
    expect(system).toContain("NEVER do arithmetic");
    expect(system).toContain("No medical advice");
  });
});

describe("weeklyReview, risposta del modello", () => {
  it("restituisce sintesi, osservazioni e suggerimento", async () => {
    await seedFullWeek();
    aiComment(COMMENT);

    const review = await weeklyReview({ today: TODAY });

    expect(review.status).toBe("commented");
    expect(review.comment).toEqual(COMMENT);
  });

  it("tiene al massimo quattro osservazioni e scarta le righe vuote", async () => {
    await seedFullWeek();
    aiComment({
      ...COMMENT,
      observations: ["a", "  ", "b", "c", "d", "e", "f"],
    });

    const review = await weeklyReview({ today: TODAY });

    expect(review.comment?.observations).toEqual(["a", "b", "c", "d"]);
  });

  it("accetta un commento senza suggerimento invece di buttarlo", async () => {
    await seedFullWeek();
    aiComment({ ...COMMENT, suggestion: "   " });

    const review = await weeklyReview({ today: TODAY });

    expect(review.status).toBe("commented");
    expect(review.comment?.suggestion).toBeNull();
  });

  it("senza sintesi il commento non è un commento: restano le statistiche", async () => {
    await seedFullWeek();
    aiComment({ observations: ["a"], suggestion: "b" });

    const review = await weeklyReview({ today: TODAY });

    expect(review.status).toBe("unavailable");
    expect(review.comment).toBeNull();
    expect(review.stats.kcal.average).toBeCloseTo(2200);
  });

  it("una risposta che non è JSON non fa fallire la card", async () => {
    await seedFullWeek();
    chatMock.mockResolvedValue({
      content: "non sono JSON",
      toolCalls: [],
      usage: null,
    });

    const review = await weeklyReview({ today: TODAY });

    expect(review.status).toBe("unavailable");
    expect(review.stats.loggedDays).toBe(3);
  });

  it("un errore di rete lascia comunque le statistiche", async () => {
    await seedFullWeek();
    chatMock.mockRejectedValue(new Error("offline"));

    const review = await weeklyReview({ today: TODAY });

    expect(review.status).toBe("unavailable");
    expect(review.comment).toBeNull();
    expect(review.stats.kcal.average).toBeCloseTo(2200);
    expect(review.stats.workoutDays).toBe(2);
  });
});

describe("weeklyReview, statistiche già calcolate", () => {
  it("commenta le statistiche ricevute senza rileggere il database", async () => {
    await seedFullWeek();
    aiComment(COMMENT);
    const stats = await weeklyStats(TODAY);

    // Il diario cambia DOPO la lettura: il commento deve parlare della
    // fotografia che il chiamante ha già a schermo.
    await logDay("2026-08-25", 3000, 150);

    const review = await weeklyReview({ stats });

    expect(review.stats).toBe(stats);
    expect(promptOf(0)).toContain("Giorni con diario compilato: 3 su 7");
  });
});
