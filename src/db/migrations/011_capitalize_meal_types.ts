import type { Migration } from "@/src/db/migrations/types";

/**
 * Capitalizza i nomi dei tipi di pasto predefiniti (es. "Colazione", "Pranzo", "Cena")
 * così da garantire uniformità visiva con la prima lettera maiuscola.
 */
export const migration011: Migration = {
  version: 11,
  name: "capitalize_meal_types",
  up: `
UPDATE meal_types SET name = 'Colazione' WHERE name = 'colazione';
UPDATE meal_types SET name = 'Brunch' WHERE name = 'brunch';
UPDATE meal_types SET name = 'Pranzo' WHERE name = 'pranzo';
UPDATE meal_types SET name = 'Snack' WHERE name = 'snack';
UPDATE meal_types SET name = 'Cena' WHERE name = 'cena';
`,
};
