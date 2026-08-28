import type { Migration } from "@/src/db/migrations/types";

/**
 * Nome normalizzato per la ricerca: LIKE di SQLite è case-insensitive solo su
 * ASCII, quindi senza questa colonna cercare "caffe" non troverebbe "Caffè".
 * La colonna è popolata dal codice a ogni scrittura, non da SQL.
 */
export const migration003: Migration = {
  version: 3,
  name: "name_norm",
  up: `
ALTER TABLE foods ADD COLUMN name_norm TEXT NOT NULL DEFAULT '';
ALTER TABLE recipes ADD COLUMN name_norm TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_foods_name_norm ON foods (name_norm);
CREATE INDEX idx_recipes_name_norm ON recipes (name_norm);
`,
};
