import type { SeedExercise } from "@/src/db/seed/exercises";
import type { SeedFood } from "@/src/db/seed/foods";

/*
 * La mappatura verso la forma che il catalogo del server legge, in un solo
 * posto. Sia lo script di export (`scripts/export-seed.ts`) sia il test che
 * lo sorveglia (`seed.test.ts`) la importano da qui: se la trasformazione
 * vivesse in due copie, potrebbero divergere senza che nessun test se ne
 * accorga - esattamente il difetto che questo modulo esiste per evitare.
 *
 * Puro apposta: nessuna lettura o scrittura su disco, o importarlo da un
 * test scriverebbe file come effetto collaterale.
 */

export interface CatalogExercise {
  uid: string;
  name: string;
  muscleGroup: SeedExercise["muscleGroup"];
  secondaryMuscles: SeedExercise["secondaryMuscles"];
  equipment: SeedExercise["equipment"];
  instructions: string;
}

export interface CatalogFood {
  uid: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  sugars: number;
  fat: number;
  saturatedFat: number;
  fiber: number;
  salt: number;
  isLiquid: boolean;
  defaultServingG: number | null;
  servingLabel: string | null;
}

export const toCatalogExercises = (
  exercises: SeedExercise[],
): CatalogExercise[] =>
  exercises.map((e) => ({
    uid: e.id,
    name: e.name,
    muscleGroup: e.muscleGroup,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
    instructions: e.instructions,
  }));

export const toCatalogFoods = (foods: SeedFood[]): CatalogFood[] =>
  foods.map((f) => ({
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
  }));
