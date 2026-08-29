import type { Migration } from "@/src/db/migrations/types";

/**
 * Piano pasti settimanale e promemoria.
 *
 * Il piano è distinto dal diario di proposito: il diario dice cosa hai
 * mangiato, il piano cosa hai intenzione di mangiare. Confonderli renderebbe
 * impossibile sapere se hai seguito il piano, che è l'unica domanda
 * interessante che un piano permette di porre.
 */
export const migration008: Migration = {
  version: 8,
  name: "planning",
  up: `
CREATE TABLE meal_plan_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  meal_type_id TEXT NOT NULL REFERENCES meal_types (id),
  recipe_id TEXT REFERENCES recipes (id),
  food_id TEXT REFERENCES foods (id),
  label TEXT,
  quantity_g REAL,
  servings REAL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (
    recipe_id IS NOT NULL OR food_id IS NOT NULL OR label IS NOT NULL
  )
);
CREATE INDEX idx_meal_plan_date ON meal_plan_entries (date);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  /** Ora locale in formato HH:MM. */
  time TEXT NOT NULL,
  /** Giorni della settimana attivi, JSON array di 0..6 con 0 = domenica. */
  weekdays TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
  enabled INTEGER NOT NULL DEFAULT 1,
  /** Identificativo della notifica programmata, per poterla cancellare. */
  notification_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
`,
};
