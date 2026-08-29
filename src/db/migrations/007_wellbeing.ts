import type { Migration } from "@/src/db/migrations/types";

/**
 * Acqua, misure corporee e digiuno intermittente.
 *
 * L'acqua è cumulativa dentro la giornata (si beve a più riprese), quindi a
 * differenza di peso e passi NON è una misura unica giornaliera: si registra
 * ogni bicchiere e si somma.
 *
 * Le misure corporee raccontano quello che la bilancia non dice: si può
 * dimagrire di centimetri restando fermi di peso.
 *
 * Il digiuno è una finestra, non un valore: ha un inizio e una fine, e una
 * finestra ancora aperta è un fatto legittimo, non un dato mancante.
 */
export const migration007: Migration = {
  version: 7,
  name: "wellbeing",
  up: `
CREATE TABLE water_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  ml INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_water_logs_date ON water_logs (date);

CREATE TABLE body_measurements (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  value_cm REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_body_measurements_date_site ON body_measurements (date, site);

CREATE TABLE progress_photos (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  uri TEXT NOT NULL,
  pose TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_progress_photos_date ON progress_photos (date DESC);

CREATE TABLE fasting_windows (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  target_hours REAL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_fasting_started ON fasting_windows (started_at DESC);
`,
};
