import type { Migration } from "@/src/db/migrations/types";

/**
 * Traguardi raggiunti. Si registra SOLO ciò che è stato sbloccato, non tutto il
 * catalogo: le definizioni vivono nel codice, dove possono cambiare, mentre qui
 * resta il fatto storico con la data e il valore che l'ha fatto scattare.
 *
 * `value` serve a raccontare il traguardo ("primo giorno da 15.000 passi") e a
 * confrontare i progressi senza ricalcolare tutto lo storico.
 */
export const migration006: Migration = {
  version: 6,
  name: "achievements",
  up: `
CREATE TABLE achievements (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  value REAL,
  unlocked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_achievements_code ON achievements (code);
`,
};
