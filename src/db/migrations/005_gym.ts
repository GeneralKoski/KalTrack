import type { Migration } from "@/src/db/migrations/types";

/**
 * Palestra. Il livello `routine_blocks` è quello che rende esprimibili superset,
 * circuiti e dropset senza casi speciali sparsi nel codice: un blocco ha un
 * `kind` e contiene 1..N esercizi.
 *
 * `workout_sessions` è separato dalla scheda di proposito: cosa era in programma
 * e cosa è stato fatto davvero sono due fatti distinti, e confonderli renderebbe
 * impossibile sia il confronto sia lo storico dei carichi.
 */
export const migration005: Migration = {
  version: 5,
  name: "gym",
  up: `
CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL DEFAULT '',
  muscle_group TEXT NOT NULL,
  secondary_muscles TEXT,
  equipment TEXT,
  is_custom INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  dislike_level INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  instructions TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (dislike_level BETWEEN 0 AND 2)
);
CREATE INDEX idx_exercises_name_norm ON exercises (name_norm);
CREATE INDEX idx_exercises_muscle ON exercises (muscle_group);

CREATE TABLE user_equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  generated_by_ai INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE routine_days (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines (id),
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_routine_days_routine ON routine_days (routine_id);

CREATE TABLE routine_blocks (
  id TEXT PRIMARY KEY,
  routine_day_id TEXT NOT NULL REFERENCES routine_days (id),
  kind TEXT NOT NULL DEFAULT 'single',
  sort INTEGER NOT NULL DEFAULT 0,
  rest_seconds INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (kind IN ('single', 'superset', 'circuit', 'dropset'))
);
CREATE INDEX idx_routine_blocks_day ON routine_blocks (routine_day_id);

CREATE TABLE block_exercises (
  id TEXT PRIMARY KEY,
  routine_block_id TEXT NOT NULL REFERENCES routine_blocks (id),
  exercise_id TEXT NOT NULL REFERENCES exercises (id),
  sort INTEGER NOT NULL DEFAULT 0,
  target_sets INTEGER,
  target_reps TEXT,
  target_weight REAL,
  tempo TEXT,
  rpe REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_block_exercises_block ON block_exercises (routine_block_id);

CREATE TABLE workout_sessions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  routine_day_id TEXT REFERENCES routine_days (id),
  started_at TEXT,
  ended_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_workout_sessions_date ON workout_sessions (date DESC);

CREATE TABLE session_sets (
  id TEXT PRIMARY KEY,
  workout_session_id TEXT NOT NULL REFERENCES workout_sessions (id),
  exercise_id TEXT NOT NULL REFERENCES exercises (id),
  block_ref TEXT,
  set_index INTEGER NOT NULL DEFAULT 0,
  reps INTEGER,
  weight REAL,
  rpe REAL,
  is_warmup INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_session_sets_session ON session_sets (workout_session_id);
CREATE INDEX idx_session_sets_exercise ON session_sets (exercise_id, done_at DESC);
`,
};
