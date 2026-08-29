import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createExercise } from "@/src/db/queries/exercises";
import {
  activateRoutine,
  endSession,
  createRoutine,
  getActiveRoutine,
  getRoutineDay,
  lastSetsFor,
  listRoutineDays,
  listRoutines,
  logSet,
  personalBest,
  recentSessions,
  startSession,
  updateRoutine,
} from "@/src/db/queries/workouts";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;
let benchId: string;
let squatId: string;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  benchId = await createExercise({
    name: "Panca piana",
    muscleGroup: "petto",
    secondaryMuscles: [],
    equipment: ["bilanciere", "panca"],
  });
  squatId = await createExercise({
    name: "Squat",
    muscleGroup: "quadricipiti",
    secondaryMuscles: ["glutei"],
    equipment: ["bilanciere"],
  });
});

afterEach(() => __setDbForTesting(null));

const pushDay = () => ({
  name: "Scheda push/pull",
  days: [
    {
      name: "Push A",
      blocks: [
        {
          kind: "single" as const,
          restSeconds: 120,
          exercises: [
            { exerciseId: benchId, targetSets: 4, targetReps: "8-10" },
          ],
        },
        {
          kind: "superset" as const,
          restSeconds: 90,
          exercises: [
            { exerciseId: benchId, targetSets: 3, targetReps: "12" },
            { exerciseId: squatId, targetSets: 3, targetReps: "12" },
          ],
        },
      ],
    },
  ],
});

describe("createRoutine", () => {
  it("salva giorni, blocchi ed esercizi annidati", async () => {
    const id = await createRoutine(pushDay());
    const routine = (await listRoutines()).find((r) => r.id === id);
    expect(routine?.name).toBe("Scheda push/pull");

    const day = await getRoutineDay(id, 0);
    expect(day?.name).toBe("Push A");
    expect(day?.blocks).toHaveLength(2);
    expect(day?.blocks[1].kind).toBe("superset");
    expect(day?.blocks[1].exercises).toHaveLength(2);
  });

  it("mantiene l'ordine di blocchi ed esercizi", async () => {
    const id = await createRoutine(pushDay());
    const day = await getRoutineDay(id, 0);
    expect(day?.blocks[0].kind).toBe("single");
    expect(day?.blocks[1].exercises[0].exercise.name).toBe("Panca piana");
    expect(day?.blocks[1].exercises[1].exercise.name).toBe("Squat");
  });

  it("salta gli esercizi cancellati invece di rompere la scheda", async () => {
    const id = await createRoutine(pushDay());
    await db.runAsync("UPDATE exercises SET deleted_at = ? WHERE id = ?", [
      "2026-01-01T00:00:00.000Z",
      squatId,
    ]);
    const day = await getRoutineDay(id, 0);
    expect(day?.blocks[1].exercises).toHaveLength(1);
  });
});

describe("activateRoutine", () => {
  it("una sola scheda alla volta è attiva", async () => {
    const first = await createRoutine(pushDay());
    const second = await createRoutine({ ...pushDay(), name: "Altra" });

    await activateRoutine(first);
    await activateRoutine(second);

    expect((await getActiveRoutine())?.id).toBe(second);
  });

  it("senza schede attive ritorna null", async () => {
    await createRoutine(pushDay());
    expect(await getActiveRoutine()).toBeNull();
  });
});

describe("updateRoutine", () => {
  it("riscrive giorni e blocchi per intero", async () => {
    const id = await createRoutine(pushDay());
    await updateRoutine(id, {
      name: "Rifatta",
      days: [
        {
          name: "Full body",
          blocks: [
            {
              kind: "single",
              restSeconds: 60,
              exercises: [{ exerciseId: squatId, targetSets: 5, targetReps: "5" }],
            },
          ],
        },
      ],
    });

    const day = await getRoutineDay(id, 0);
    expect(day?.name).toBe("Full body");
    expect(day?.blocks).toHaveLength(1);
  });
});

describe("sessioni e serie", () => {
  it("registra le serie svolte", async () => {
    const sessionId = await startSession({ date: "2026-08-28" });
    await logSet({ sessionId, exerciseId: benchId, setIndex: 0, reps: 10, weight: 60 });
    await logSet({ sessionId, exerciseId: benchId, setIndex: 1, reps: 9, weight: 60 });

    const sets = await lastSetsFor(benchId);
    expect(sets).toHaveLength(2);
  });

  it("lastSetsFor ritorna le serie dell'ultima sessione, non tutte", async () => {
    const older = await startSession({ date: "2026-08-20" });
    await logSet({ sessionId: older, exerciseId: benchId, setIndex: 0, reps: 8, weight: 50 });

    const recent = await startSession({ date: "2026-08-28" });
    await logSet({ sessionId: recent, exerciseId: benchId, setIndex: 0, reps: 10, weight: 60 });

    const sets = await lastSetsFor(benchId);
    expect(sets).toHaveLength(1);
    expect(sets[0].weight).toBe(60);
  });

  it("esclude le serie di riscaldamento dallo storico dei carichi", async () => {
    const sessionId = await startSession({ date: "2026-08-28" });
    await logSet({ sessionId, exerciseId: benchId, setIndex: 0, reps: 12, weight: 20, isWarmup: true });
    await logSet({ sessionId, exerciseId: benchId, setIndex: 1, reps: 10, weight: 60 });

    const sets = await lastSetsFor(benchId);
    expect(sets).toHaveLength(1);
    expect(sets[0].weight).toBe(60);
  });

  it("senza serie precedenti ritorna lista vuota", async () => {
    expect(await lastSetsFor(benchId)).toEqual([]);
  });
});

describe("personalBest", () => {
  it("è la serie col massimale stimato più alto, non col carico più alto", async () => {
    const sessionId = await startSession({ date: "2026-08-28" });
    // 100x1 stima 100 kg, 80x8 stima 101,3: vince la seconda.
    await logSet({ sessionId, exerciseId: benchId, setIndex: 0, reps: 1, weight: 100 });
    await logSet({ sessionId, exerciseId: benchId, setIndex: 1, reps: 8, weight: 80 });

    const best = await personalBest(benchId);
    expect(best?.weight).toBe(80);
    expect(best?.estimated1RM).toBeCloseTo(80 * (1 + 8 / 30));
  });

  it("senza serie ritorna null", async () => {
    expect(await personalBest(benchId)).toBeNull();
  });

  it("ignora il riscaldamento", async () => {
    const sessionId = await startSession({ date: "2026-08-28" });
    await logSet({ sessionId, exerciseId: benchId, setIndex: 0, reps: 5, weight: 200, isWarmup: true });
    await logSet({ sessionId, exerciseId: benchId, setIndex: 1, reps: 5, weight: 60 });

    expect((await personalBest(benchId))?.weight).toBe(60);
  });
});

describe("updateRoutine con storico", () => {
  it("una scheda già allenata resta modificabile", async () => {
    // routine_days è referenziata da workout_sessions: una cancellazione fisica
    // farebbe fallire la foreign key e la scheda non si salverebbe più.
    const id = await createRoutine(pushDay());
    const days = await listRoutineDays(id);
    const session = await startSession({
      date: "2026-08-28",
      routineDayId: days[0].id,
    });
    await logSet({ sessionId: session, exerciseId: benchId, setIndex: 0, reps: 8, weight: 60 });

    await expect(
      updateRoutine(id, {
        name: "Modificata dopo l'allenamento",
        days: [
          {
            name: "Nuovo giorno",
            blocks: [
              {
                kind: "single",
                restSeconds: 60,
                exercises: [{ exerciseId: squatId, targetSets: 3, targetReps: "10" }],
              },
            ],
          },
        ],
      }),
    ).resolves.toBeUndefined();

    const day = await getRoutineDay(id, 0);
    expect(day?.name).toBe("Nuovo giorno");
  });

  it("lo storico dell'allenamento sopravvive alla modifica della scheda", async () => {
    const id = await createRoutine(pushDay());
    const days = await listRoutineDays(id);
    const session = await startSession({
      date: "2026-08-28",
      routineDayId: days[0].id,
    });
    await logSet({ sessionId: session, exerciseId: benchId, setIndex: 0, reps: 8, weight: 60 });

    await updateRoutine(id, { name: "Rifatta", days: [] });

    // Le serie restano: cosa è stato fatto non dipende da come è fatta la scheda oggi.
    expect(await lastSetsFor(benchId)).toHaveLength(1);
  });
});

describe("recentSessions", () => {
  it("elenca dal piu' recente, col volume e le serie di lavoro", async () => {
    const older = await startSession({ date: "2026-08-20" });
    await logSet({
      sessionId: older,
      exerciseId: benchId,
      setIndex: 0,
      reps: 10,
      weight: 60,
    });
    await endSession(older);

    const recent = await startSession({ date: "2026-08-28" });
    await logSet({
      sessionId: recent,
      exerciseId: squatId,
      setIndex: 0,
      reps: 5,
      weight: 100,
    });
    await logSet({
      sessionId: recent,
      exerciseId: squatId,
      setIndex: 1,
      reps: 5,
      weight: 100,
    });

    const list = await recentSessions();
    expect(list.map((s) => s.date)).toEqual(["2026-08-28", "2026-08-20"]);
    expect(list[0].workingSets).toBe(2);
    expect(list[0].volumeKg).toBe(1000);
    // Ancora aperta: e' quella che la palestra propone di riprendere.
    expect(list[0].endedAt).toBeNull();
    expect(list[1].endedAt).not.toBeNull();
  });

  /** Una sessione senza serie esiste comunque: e' stata aperta. */
  it("conta zero serie invece di sparire quando non ne ha nessuna", async () => {
    await startSession({ date: "2026-08-28" });
    const list = await recentSessions();
    expect(list).toHaveLength(1);
    expect(list[0].workingSets).toBe(0);
    expect(list[0].volumeKg).toBe(0);
  });

  it("non conta i riscaldamenti tra le serie di lavoro", async () => {
    const id = await startSession({ date: "2026-08-28" });
    await logSet({
      sessionId: id,
      exerciseId: benchId,
      setIndex: 0,
      reps: 12,
      weight: 20,
      isWarmup: true,
    });
    await logSet({
      sessionId: id,
      exerciseId: benchId,
      setIndex: 1,
      reps: 8,
      weight: 60,
    });

    const [session] = await recentSessions();
    expect(session.workingSets).toBe(1);
    expect(session.volumeKg).toBe(480);
  });

  it("porta il nome del giorno di scheda quando c'e'", async () => {
    const routineId = await createRoutine(pushDay());
    const days = await listRoutineDays(routineId);
    await startSession({ date: "2026-08-28", routineDayId: days[0].id });

    const [session] = await recentSessions();
    expect(session.dayName).toBe("Push A");
  });
});

describe("riprendere un allenamento", () => {
  /**
   * Il difetto che questo test blocca: ogni ritorno sulla schermata apriva una
   * sessione nuova. Uscire e rientrare due volte lasciava tre "Giorno 1" nello
   * stesso giorno, due dei quali vuoti, e le serie finivano divise.
   */
  it("riprende la sessione aperta dello stesso giorno di scheda", async () => {
    const routineId = await createRoutine(pushDay());
    const days = await listRoutineDays(routineId);

    const first = await startSession({
      date: "2026-08-28",
      routineDayId: days[0].id,
    });
    const second = await startSession({
      date: "2026-08-28",
      routineDayId: days[0].id,
    });
    expect(second).toBe(first);
    expect(await recentSessions()).toHaveLength(1);
  });

  it("ne apre una nuova dopo che la precedente e' finita", async () => {
    const first = await startSession({ date: "2026-08-28" });
    await endSession(first);
    const second = await startSession({ date: "2026-08-28" });

    expect(second).not.toBe(first);
    expect(await recentSessions()).toHaveLength(2);
  });

  it("tiene separati giorni di scheda diversi nello stesso giorno", async () => {
    const routineId = await createRoutine({
      ...pushDay(),
      days: [
        { ...pushDay().days[0], name: "Push A" },
        { ...pushDay().days[0], name: "Pull B" },
      ],
    });
    const days = await listRoutineDays(routineId);

    const push = await startSession({
      date: "2026-08-28",
      routineDayId: days[0].id,
    });
    const pull = await startSession({
      date: "2026-08-28",
      routineDayId: days[1].id,
    });
    expect(pull).not.toBe(push);
  });

  /** Un allenamento libero non si confonde con uno di scheda. */
  it("non riprende una sessione di scheda per un allenamento libero", async () => {
    const routineId = await createRoutine(pushDay());
    const days = await listRoutineDays(routineId);
    const planned = await startSession({
      date: "2026-08-28",
      routineDayId: days[0].id,
    });
    const free = await startSession({ date: "2026-08-28" });

    expect(free).not.toBe(planned);
  });
});
