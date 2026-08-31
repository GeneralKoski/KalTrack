import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { addFreeEntry } from "@/src/db/queries/diary";
import { setSteps, setWeight } from "@/src/db/queries/tracking";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { createExercise } from "@/src/db/queries/exercises";
import { logSet, startSession } from "@/src/db/queries/workouts";
import {
  buildSharedDays,
  buildSharedWorkoutDays,
} from "@/src/services/shareSync";

const DATE = "2026-08-29";

const allOff = {
  calories: false,
  steps: false,
  weight: false,
  workouts: false,
  gym: false,
};

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);

  await addFreeEntry({
    date: DATE,
    mealTypeId: MEAL_TYPE_IDS.lunch,
    label: "Pizza",
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 800, protein: 30 },
  });
  await setSteps(DATE, 9450);
  await setWeight(DATE, 78.5);
});

afterEach(() => __setDbForTesting(null));

const dayFor = async (shares: Partial<typeof allOff>) => {
  const days = await buildSharedDays({ ...allOff, ...shares }, { today: DATE });
  return days[0];
};

describe("cosa parte dal telefono", () => {
  /**
   * La regola centrale: il filtro sta QUI, prima della rete. Un dato che non
   * deve essere visto non deve nemmeno partire. Il server ha il suo controllo,
   * ma questa e' la prima difesa e non deve dipendere dall'altra.
   */
  it("non manda niente di quel che non e' condiviso", async () => {
    const day = await dayFor({});

    expect(day.kcal).toBeNull();
    expect(day.steps).toBeNull();
    expect(day.weightKg).toBeNull();
    expect(day.workouts).toBeNull();
  });

  it("manda solo il campo acceso", async () => {
    const day = await dayFor({ steps: true });

    expect(day.steps).toBe(9450);
    expect(day.kcal).toBeNull();
    expect(day.weightKg).toBeNull();
  });

  it("manda le calorie come totale del giorno, non le voci", async () => {
    const day = await dayFor({ calories: true });

    expect(day.kcal).toBe(800);
    // Il diario non parte: qui c'e' un numero, non "Pizza".
    expect(JSON.stringify(day)).not.toContain("Pizza");
  });

  it("manda il peso quando e' condiviso", async () => {
    const day = await dayFor({ weight: true });
    expect(day.weightKg).toBe(78.5);
  });

  /**
   * Non registrato resta null anche quando la condivisione e' accesa: uno zero
   * direbbe "ha camminato zero passi", che e' un fatto diverso.
   */
  it("lascia null il giorno senza dati, anche se condiviso", async () => {
    const days = await buildSharedDays(
      { ...allOff, steps: true, weight: true },
      { today: "2026-08-30" },
    );

    const vuoto = days[days.length - 1];
    expect(vuoto.date).toBe("2026-08-30");
    expect(vuoto.steps).toBeNull();
    expect(vuoto.weightKg).toBeNull();
  });

  /**
   * Non piu' una finestra di N giorni: lo storico intero, e il suo inizio e' il
   * primo dato scritto. Contare da una data fissa vorrebbe dire interrogare e
   * spedire giornate vuote che non sono mai esistite.
   */
  it("parte dal primo giorno scritto e arriva a oggi", async () => {
    await setSteps("2026-08-27", 3000);

    const days = await buildSharedDays(allOff, { today: "2026-08-30" });

    expect(days.map((d) => d.date)).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("con il database vuoto manda il solo giorno di oggi", async () => {
    const vuoto = createTestDb();
    await runMigrations(vuoto);
    __setDbForTesting(vuoto);

    const days = await buildSharedDays(allOff, { today: DATE });

    expect(days.map((d) => d.date)).toEqual([DATE]);
  });
});

/**
 * La palestra e' l'unica cosa che fa uscire CONTENUTO e non un totale. Il
 * filtro sta qui prima che sulla rete, come per tutto il resto.
 */
describe("cosa parte della palestra", () => {
  const conAllenamento = async () => {
    const benchId = await createExercise({
      name: "Panca piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
    });
    const sessionId = await startSession({ date: DATE });
    await logSet({ sessionId, exerciseId: benchId, setIndex: 0, reps: 10, weight: 60 });
  };

  it("a interruttore spento non parte niente, nemmeno i giorni vuoti", async () => {
    await conAllenamento();

    const days = await buildSharedWorkoutDays(allOff, { today: DATE });

    // Nemmeno una lista di giorni senza esercizi: direbbe comunque "questa
    // settimana non mi sono allenato" a chi non ha diritto di saperlo.
    expect(days).toEqual([]);
  });

  it("acceso, manda gli esercizi aggregati e non le serie", async () => {
    await conAllenamento();

    const days = await buildSharedWorkoutDays(
      { ...allOff, gym: true },
      { today: DATE },
    );

    expect(days).toEqual([
      {
        date: DATE,
        exercises: [
          {
            name: "Panca piana",
            sets: 1,
            totalReps: 10,
            volumeKg: 600,
            topWeightKg: 60,
          },
        ],
      },
    ]);
  });

  it("un giorno senza allenamento parte con la lista vuota", async () => {
    const days = await buildSharedWorkoutDays(
      { ...allOff, gym: true },
      { today: DATE },
    );

    // E' l'unico modo che il telefono ha per dire "quel giorno non c'e' piu'".
    expect(days).toEqual([{ date: DATE, exercises: [] }]);
  });

  it("copre lo storico intero, come i totali", async () => {
    await setSteps("2026-08-27", 3000);

    const days = await buildSharedWorkoutDays(
      { ...allOff, gym: true },
      { today: DATE },
    );

    expect(days.map((d) => d.date)).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });
});
