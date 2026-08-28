import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { toggleExerciseBan } from "@/src/db/queries/exercises";
import { deleteFood, searchFoods, updateFood } from "@/src/db/queries/foods";
import { applyExerciseSeeds, applySeeds } from "@/src/db/seed";
import { SEED_EXERCISES } from "@/src/db/seed/exercises";
import { SEED_FOODS } from "@/src/db/seed/foods";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

const countFoods = async (): Promise<number> => {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM foods",
  );
  return row?.n ?? 0;
};

describe("applySeeds", () => {
  it("inserisce tutti gli alimenti di seed", async () => {
    await applySeeds(db);
    expect(await countFoods()).toBe(SEED_FOODS.length);
  });

  it("è idempotente", async () => {
    await applySeeds(db);
    await applySeeds(db);
    expect(await countFoods()).toBe(SEED_FOODS.length);
  });

  it("marca gli alimenti come source 'seed'", async () => {
    await applySeeds(db);
    const row = await db.getFirstAsync<{ source: string }>(
      "SELECT source FROM foods WHERE id = ?",
      [SEED_FOODS[0].id],
    );
    expect(row?.source).toBe("seed");
  });

  it("popola il nome normalizzato, così la ricerca funziona subito", async () => {
    await applySeeds(db);
    const results = await searchFoods("");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.name_norm.length > 0)).toBe(true);
  });

  it("non resuscita un alimento di seed cancellato dall'utente", async () => {
    await applySeeds(db);
    await deleteFood(SEED_FOODS[0].id);
    await applySeeds(db);

    const row = await db.getFirstAsync<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM foods WHERE id = ?",
      [SEED_FOODS[0].id],
    );
    expect(row?.deleted_at).not.toBeNull();
  });

  it("non sovrascrive un valore corretto dall'utente", async () => {
    await applySeeds(db);
    await updateFood(SEED_FOODS[0].id, {
      name: SEED_FOODS[0].name,
      nutrients: { ...EMPTY_NUTRIENTS, kcal: 1 },
    });
    await applySeeds(db);

    const row = await db.getFirstAsync<{ kcal: number }>(
      "SELECT kcal FROM foods WHERE id = ?",
      [SEED_FOODS[0].id],
    );
    expect(row?.kcal).toBe(1);
  });

  it("inserisce solo quelli mancanti", async () => {
    await applySeeds(db);
    await db.runAsync("DELETE FROM foods WHERE id = ?", [SEED_FOODS[0].id]);
    await applySeeds(db);
    expect(await countFoods()).toBe(SEED_FOODS.length);
  });
});

describe("dati del seed", () => {
  it("copre almeno 150 alimenti", () => {
    expect(SEED_FOODS.length).toBeGreaterThanOrEqual(150);
  });

  it("gli id sono unici", () => {
    expect(new Set(SEED_FOODS.map((f) => f.id)).size).toBe(SEED_FOODS.length);
  });

  it("gli id sono slug ASCII con prefisso seed-", () => {
    for (const food of SEED_FOODS) {
      expect(food.id).toMatch(/^seed-[a-z0-9-]+$/);
    }
  });

  it("i nomi non sono vuoti", () => {
    for (const food of SEED_FOODS) {
      expect(food.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("nessun valore nutrizionale è negativo", () => {
    for (const food of SEED_FOODS) {
      for (const [key, value] of Object.entries(food.nutrients)) {
        expect(`${food.id}.${key}=${value}`).toBe(
          `${food.id}.${key}=${Math.abs(value)}`,
        );
      }
    }
  });

  it("gli zuccheri non superano i carboidrati", () => {
    for (const food of SEED_FOODS) {
      expect(`${food.id}: ${food.nutrients.sugars} <= ${food.nutrients.carbs}`).toBe(
        `${food.id}: ${Math.min(food.nutrients.sugars, food.nutrients.carbs)} <= ${food.nutrients.carbs}`,
      );
    }
  });

  it("i grassi saturi non superano i grassi totali", () => {
    for (const food of SEED_FOODS) {
      expect(`${food.id}: ${food.nutrients.saturatedFat} <= ${food.nutrients.fat}`).toBe(
        `${food.id}: ${Math.min(food.nutrients.saturatedFat, food.nutrients.fat)} <= ${food.nutrients.fat}`,
      );
    }
  });

  it("le calorie sono coerenti con i macro", () => {
    // Tolleranza ampia: fibra, polioli e arrotondamenti delle tabelle CREA.
    // Serve a intercettare i refusi nei valori inseriti a mano, non a imporre
    // la formula 4/4/9 al grammo.
    for (const food of SEED_FOODS) {
      const { kcal, protein, carbs, fat } = food.nutrients;
      const fromMacros = protein * 4 + carbs * 4 + fat * 9;
      const tolerance = kcal * 0.25 + 25;
      expect(`${food.id}: scarto ${Math.abs(fromMacros - kcal).toFixed(1)}`).toBe(
        `${food.id}: scarto ${Math.min(Math.abs(fromMacros - kcal), tolerance - 0.01).toFixed(1)}`,
      );
    }
  });

  it("l'etichetta della porzione c'è solo se c'è la porzione", () => {
    for (const food of SEED_FOODS) {
      if (food.servingLabel) {
        expect(`${food.id} ha defaultServingG`).toBe(
          `${food.id} ha ${food.defaultServingG ? "defaultServingG" : "NIENTE"}`,
        );
      }
    }
  });
});

describe("applyExerciseSeeds", () => {
  const countExercises = async (): Promise<number> => {
    const row = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM exercises",
    );
    return row?.n ?? 0;
  };

  it("inserisce tutti gli esercizi di seed", async () => {
    await applyExerciseSeeds(db);
    expect(await countExercises()).toBe(SEED_EXERCISES.length);
  });

  it("è idempotente", async () => {
    await applyExerciseSeeds(db);
    await applyExerciseSeeds(db);
    expect(await countExercises()).toBe(SEED_EXERCISES.length);
  });

  it("non resuscita un esercizio vietato dall'utente", async () => {
    await applyExerciseSeeds(db);
    await toggleExerciseBan(SEED_EXERCISES[0].id);
    await applyExerciseSeeds(db);

    const row = await db.getFirstAsync<{ is_banned: number }>(
      "SELECT is_banned FROM exercises WHERE id = ?",
      [SEED_EXERCISES[0].id],
    );
    expect(row?.is_banned).toBe(1);
  });

  it("li marca come non custom, così si distinguono dai tuoi", async () => {
    await applyExerciseSeeds(db);
    const row = await db.getFirstAsync<{ is_custom: number }>(
      "SELECT is_custom FROM exercises WHERE id = ?",
      [SEED_EXERCISES[0].id],
    );
    expect(row?.is_custom).toBe(0);
  });
});

describe("dati del seed esercizi", () => {
  it("copre almeno 150 esercizi", () => {
    expect(SEED_EXERCISES.length).toBeGreaterThanOrEqual(150);
  });

  it("gli id sono unici e conformi", () => {
    expect(new Set(SEED_EXERCISES.map((e) => e.id)).size).toBe(
      SEED_EXERCISES.length,
    );
    for (const exercise of SEED_EXERCISES) {
      expect(exercise.id).toMatch(/^ex-[a-z0-9-]+$/);
    }
  });

  it("i nomi sono unici", () => {
    const names = SEED_EXERCISES.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("nessun esercizio è senza attrezzatura dichiarata", () => {
    // Chi si allena a casa filtra su questo campo: lasciarlo vuoto lo
    // renderebbe invisibile o sempre proposto, entrambi sbagliati.
    for (const exercise of SEED_EXERCISES) {
      expect(`${exercise.id}: ${exercise.equipment.length}`).not.toBe(
        `${exercise.id}: 0`,
      );
    }
  });

  it("i muscoli secondari non ripetono il primario", () => {
    for (const exercise of SEED_EXERCISES) {
      expect(
        `${exercise.id}: ${exercise.secondaryMuscles.includes(exercise.muscleGroup)}`,
      ).toBe(`${exercise.id}: false`);
    }
  });

  it("ogni gruppo muscolare ha almeno un'opzione senza macchinari", () => {
    // Serve a poter generare una scheda anche per chi si allena a casa.
    const groups = new Set(SEED_EXERCISES.map((e) => e.muscleGroup));
    for (const group of groups) {
      const homeFriendly = SEED_EXERCISES.filter(
        (e) =>
          e.muscleGroup === group &&
          e.equipment.every((eq) =>
            ["corpo_libero", "elastici", "manubri", "kettlebell", "sbarra", "panca", "trx"].includes(eq),
          ),
      );
      expect(`${group}: ${homeFriendly.length > 0}`).toBe(`${group}: true`);
    }
  });
});
