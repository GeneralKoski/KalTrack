import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SEED_EXERCISES } from "../src/db/seed/exercises";
import { SEED_FOODS } from "../src/db/seed/foods";

/*
 * Il seed dell'app, in una forma che il server sa leggere.
 *
 * Il comando `catalog:seed` NON legge `src/db/seed/`: in produzione
 * `backend/` viene rsyncata da sola e quella cartella li' non esiste, quindi
 * il comando fallirebbe solo sul server e solo al primo tentativo. Legge
 * invece questi due JSON, che sono committati.
 *
 * Va rilanciato quando il seed cambia. A ricordarlo c'e' un test in
 * `src/db/seed/seed.test.ts` che confronta i conteggi: senza, un esercizio
 * aggiunto e non riesportato diventerebbe un doppione su ogni telefono.
 */

const OUT = join(__dirname, "..", "backend", "database", "seeders", "data");

const scrivi = (nome: string, dati: unknown): void => {
  const percorso = join(OUT, nome);
  mkdirSync(dirname(percorso), { recursive: true });
  writeFileSync(percorso, `${JSON.stringify(dati, null, 2)}\n`, "utf8");
  console.log(`${nome}: ${(dati as unknown[]).length} voci`);
};

scrivi(
  "exercises.json",
  SEED_EXERCISES.map((e) => ({
    uid: e.id,
    name: e.name,
    muscleGroup: e.muscleGroup,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
    instructions: e.instructions,
  })),
);

scrivi(
  "foods.json",
  SEED_FOODS.map((f) => ({
    uid: f.id,
    name: f.name,
    kcal: f.nutrients.kcal,
    protein: f.nutrients.protein,
    carbs: f.nutrients.carbs,
    sugars: f.nutrients.sugars,
    fat: f.nutrients.fat,
    saturatedFat: f.nutrients.saturatedFat,
    fiber: f.nutrients.fiber,
    salt: f.nutrients.salt,
    isLiquid: f.isLiquid ?? false,
    defaultServingG: f.defaultServingG ?? null,
    servingLabel: f.servingLabel ?? null,
  })),
);
