import { chat } from "@/src/ai/client";
import { AiResponseError } from "@/src/ai/errors";
import {
  generateRoutine,
  RoutineGenerationError,
  type RoutinePreferences,
} from "@/src/ai/generateRoutine";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createExercise, toggleExerciseBan } from "@/src/db/queries/exercises";
import { setWeight } from "@/src/db/queries/tracking";
import {
  logSet,
  startSession,
  type RoutineInput,
} from "@/src/db/queries/workouts";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import type { Equipment, MuscleGroup } from "@/src/types/gym";

jest.mock("@/src/ai/client");

const chatMock = chat as jest.MockedFunction<typeof chat>;

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  chatMock.mockReset();
});

afterEach(() => __setDbForTesting(null));

const PREFERENCES: RoutinePreferences = {
  goal: "ipertrofia",
  daysPerWeek: 2,
  sessionMinutes: 60,
  availableEquipment: ["bilanciere", "panca"],
  level: "intermedio",
};

const addExercise = (
  name: string,
  muscleGroup: MuscleGroup = "petto",
  equipment: Equipment[] = [],
): Promise<string> =>
  createExercise({ name, muscleGroup, secondaryMuscles: [], equipment });

const aiRoutine = (routine: unknown): void => {
  chatMock.mockResolvedValue({
    content: JSON.stringify(routine),
    toolCalls: [],
    usage: null,
  });
};

/** L'unico id di esercizio citato dalla scheda, per le asserzioni di presenza. */
const routineExerciseIds = (routine: {
  days: { blocks: { exercises: { exerciseId: string }[] }[] }[];
}): string[] =>
  routine.days.flatMap((day) =>
    day.blocks.flatMap((block) =>
      block.exercises.map((exercise) => exercise.exerciseId),
    ),
  );

const singleBlock = (exerciseId: string): unknown => ({
  kind: "single",
  restSeconds: 90,
  exercises: [{ exerciseId, targetSets: 4, targetReps: "8-10", rpe: 8 }],
});

describe("generateRoutine, esito normale", () => {
  it("costruisce la scheda e la marca come generata dall'AI", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    const squat = await addExercise("Squat", "quadricipiti", ["bilanciere"]);
    aiRoutine({
      name: "Spinta e gambe",
      notes: "Due sedute a settimana.",
      days: [
        { name: "Spinta", blocks: [singleBlock(panca)] },
        { name: "Gambe", blocks: [singleBlock(squat)] },
      ],
    });

    const routine = await generateRoutine(PREFERENCES);

    expect(routine.name).toBe("Spinta e gambe");
    expect(routine.generatedByAi).toBe(true);
    expect(routine.days).toHaveLength(2);
    expect(routineExerciseIds(routine)).toEqual([panca, squat]);
    expect(routine.days[0].blocks[0].exercises[0]).toMatchObject({
      targetSets: 4,
      targetReps: "8-10",
      rpe: 8,
    });
    expect(routine.days[0].blocks[0].restSeconds).toBe(90);
  });

  it("accetta i numeri mandati come stringa e le ripetizioni numeriche", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({
      name: "Scheda",
      days: [
        {
          name: "A",
          blocks: [
            {
              kind: "single",
              restSeconds: "120",
              exercises: [
                { exerciseId: panca, targetSets: "3", targetReps: 12, rpe: "7" },
              ],
            },
          ],
        },
      ],
    });

    const routine = await generateRoutine(PREFERENCES);

    expect(routine.days[0].blocks[0].restSeconds).toBe(120);
    expect(routine.days[0].blocks[0].exercises[0]).toMatchObject({
      targetSets: 3,
      targetReps: "12",
      rpe: 7,
    });
  });

  it("usa nomi di ripiego quando il modello non li fornisce", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({ days: [{ blocks: [singleBlock(panca)] }] });

    const routine = await generateRoutine(PREFERENCES);

    expect(routine.name).toBe("Scheda ipertrofia 2 giorni");
    expect(routine.days[0].name).toBe("Giorno 1");
    expect(routine.notes).toBeNull();
  });

  it("degrada a single un superset rimasto con un solo esercizio valido", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({
      name: "Scheda",
      days: [
        {
          name: "A",
          blocks: [
            {
              kind: "superset",
              exercises: [
                { exerciseId: panca, targetSets: 3, targetReps: "10" },
                { exerciseId: "ex-inventato", targetSets: 3, targetReps: "10" },
              ],
            },
          ],
        },
      ],
    });

    const routine = await generateRoutine(PREFERENCES);

    expect(routine.days[0].blocks[0].kind).toBe("single");
    expect(routine.days[0].blocks[0].exercises).toHaveLength(1);
  });
});

describe("generateRoutine, validazione locale della risposta", () => {
  it("non inserisce un esercizio vietato proposto dal modello", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    const vietato = await addExercise("Croci ai cavi", "petto", ["bilanciere"]);
    await toggleExerciseBan(vietato);
    aiRoutine({
      name: "Scheda",
      days: [
        {
          name: "A",
          blocks: [
            {
              kind: "superset",
              exercises: [
                { exerciseId: panca, targetSets: 4, targetReps: "8" },
                { exerciseId: vietato, targetSets: 3, targetReps: "12" },
              ],
            },
          ],
        },
      ],
    });

    const routine = await generateRoutine(PREFERENCES);

    expect(routineExerciseIds(routine)).toEqual([panca]);
    expect(routineExerciseIds(routine)).not.toContain(vietato);
  });

  it("non manda al modello gli esercizi vietati o fuori attrezzatura", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    const vietato = await addExercise("Croci ai cavi", "petto", ["cavi"]);
    await toggleExerciseBan(vietato);
    const senzaAttrezzo = await addExercise("Leg press", "quadricipiti", ["macchina"]);
    aiRoutine({ name: "Scheda", days: [{ name: "A", blocks: [singleBlock(panca)] }] });

    await generateRoutine(PREFERENCES);

    const prompt = String(chatMock.mock.calls[0][0].messages[1].content);
    expect(prompt).toContain(panca);
    expect(prompt).not.toContain(vietato);
    expect(prompt).not.toContain(senzaAttrezzo);
  });

  it("scarta un giorno rimasto senza esercizi validi", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({
      name: "Scheda",
      days: [
        { name: "Buono", blocks: [singleBlock(panca)] },
        { name: "Vuoto", blocks: [singleBlock("ex-inventato")] },
      ],
    });

    const routine = await generateRoutine(PREFERENCES);

    expect(routine.days).toHaveLength(1);
    expect(routine.days[0].name).toBe("Buono");
  });

  it("solleva un errore invece di restituire una scheda vuota", async () => {
    await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({
      name: "Scheda",
      days: [{ name: "A", blocks: [singleBlock("ex-inventato")] }],
    });

    await expect(generateRoutine(PREFERENCES)).rejects.toThrow(
      RoutineGenerationError,
    );
  });

  it("rifiuta una risposta che non è JSON valido", async () => {
    await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    chatMock.mockResolvedValue({
      content: "non sono JSON",
      toolCalls: [],
      usage: null,
    });

    await expect(generateRoutine(PREFERENCES)).rejects.toThrow(AiResponseError);
  });

  it("rifiuta una risposta senza giorni", async () => {
    await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({ name: "Scheda" });

    await expect(generateRoutine(PREFERENCES)).rejects.toThrow(AiResponseError);
  });
});

describe("generateRoutine, preferenze non valide", () => {
  it("rifiuta un numero di giorni fuori scala senza chiamare il modello", async () => {
    await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);

    await expect(
      generateRoutine({ ...PREFERENCES, daysPerWeek: 9 }),
    ).rejects.toThrow(RoutineGenerationError);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("rifiuta una durata di sessione non plausibile", async () => {
    await expect(
      generateRoutine({ ...PREFERENCES, sessionMinutes: 5 }),
    ).rejects.toThrow(RoutineGenerationError);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it("rifiuta la generazione se nessun esercizio è alla portata dell'attrezzatura", async () => {
    await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);

    await expect(
      generateRoutine({ ...PREFERENCES, availableEquipment: [] }),
    ).rejects.toThrow(RoutineGenerationError);
    expect(chatMock).not.toHaveBeenCalled();
  });
});

describe("generateRoutine, i carichi proposti", () => {
  const withWeight = (exerciseId: string, targetWeight: unknown): unknown => ({
    kind: "single",
    restSeconds: 90,
    exercises: [
      { exerciseId, targetSets: 4, targetReps: "8-10", targetWeight },
    ],
  });

  const firstExercise = (routine: RoutineInput) =>
    routine.days[0].blocks[0].exercises[0];

  it("tiene il carico proposto per un esercizio mai fatto", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({ name: "Scheda", days: [{ name: "A", blocks: [withWeight(panca, 60)] }] });

    expect(firstExercise(await generateRoutine(PREFERENCES)).targetWeight).toBe(60);
  });

  it("lo storico vince sul carico proposto dal modello", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    const session = await startSession({ date: "2026-09-01" });
    await logSet({ sessionId: session, exerciseId: panca, setIndex: 0, reps: 8, weight: 100 });
    aiRoutine({ name: "Scheda", days: [{ name: "A", blocks: [withWeight(panca, 60)] }] });

    // Il modello ha dedotto 60 kg da "intermedio"; il telefono sa che l'ultima
    // volta erano 100.
    expect(firstExercise(await generateRoutine(PREFERENCES)).targetWeight).toBe(100);
  });

  it("scarta un carico impossibile invece di correggerlo", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({ name: "Scheda", days: [{ name: "A", blocks: [withWeight(panca, 4000)] }] });

    const routine = await generateRoutine(PREFERENCES);
    expect(firstExercise(routine).targetWeight).toBeNull();
    // La scheda arriva lo stesso: un carico assurdo non la butta via.
    expect(routine.days).toHaveLength(1);
  });

  it("un esercizio senza carico resta senza, e non a zero", async () => {
    const piegamenti = await addExercise("Piegamenti", "petto", ["corpo_libero"]);
    aiRoutine({
      name: "Scheda",
      days: [{ name: "A", blocks: [withWeight(piegamenti, undefined)] }],
    });

    expect(firstExercise(await generateRoutine(PREFERENCES)).targetWeight).toBeNull();
  });

  it("manda al modello il peso corporeo quando c'e', e lo dichiara assente quando no", async () => {
    const panca = await addExercise("Panca piana", "petto", ["bilanciere", "panca"]);
    aiRoutine({ name: "Scheda", days: [{ name: "A", blocks: [withWeight(panca, 60)] }] });

    await generateRoutine(PREFERENCES);
    expect(String(chatMock.mock.calls[0][0].messages[1].content)).toContain(
      "Peso corporeo: non disponibile",
    );

    await setWeight("2026-09-01", 82.5);
    await generateRoutine(PREFERENCES);
    expect(String(chatMock.mock.calls[1][0].messages[1].content)).toContain(
      "Peso corporeo: 82.5 kg",
    );
  });
});
