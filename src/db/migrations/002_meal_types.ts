import type { Migration } from "@/src/db/migrations/types";

/** Id costanti: referenziabili da seed, test e (in Fase 2) dai tool vocali. */
export const MEAL_TYPE_IDS = {
  breakfast: "mt-breakfast",
  brunch: "mt-brunch",
  lunch: "mt-lunch",
  snack: "mt-snack",
  dinner: "mt-dinner",
} as const;

const row = (id: string, name: string, icon: string, sort: number) =>
  `INSERT INTO meal_types (id, name, icon, sort, is_custom, created_at, updated_at)
   VALUES ('${id}', '${name}', '${icon}', ${sort}, 0, datetime('now'), datetime('now'));`;

export const migration002: Migration = {
  version: 2,
  name: "meal_types",
  up: [
    row(MEAL_TYPE_IDS.breakfast, "colazione", "coffee", 10),
    row(MEAL_TYPE_IDS.brunch, "brunch", "egg", 20),
    row(MEAL_TYPE_IDS.lunch, "pranzo", "utensils", 30),
    row(MEAL_TYPE_IDS.snack, "snack", "apple", 40),
    row(MEAL_TYPE_IDS.dinner, "cena", "moon", 50),
  ].join("\n"),
};
