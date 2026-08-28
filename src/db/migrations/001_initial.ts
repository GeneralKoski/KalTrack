import type { Migration } from "@/src/db/migrations/types";

export const migration001: Migration = {
  version: 1,
  name: "initial",
  up: `
CREATE TABLE foods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  source TEXT NOT NULL DEFAULT 'user',
  barcode TEXT,
  off_id TEXT,
  kcal REAL NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  sugars REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  saturated_fat REAL NOT NULL DEFAULT 0,
  fiber REAL NOT NULL DEFAULT 0,
  salt REAL NOT NULL DEFAULT 0,
  is_liquid INTEGER NOT NULL DEFAULT 0,
  default_serving_g REAL,
  serving_label TEXT,
  image_uri TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_estimated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_foods_name ON foods (name);
CREATE INDEX idx_foods_barcode ON foods (barcode);
CREATE INDEX idx_foods_usage ON foods (usage_count DESC);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photo_uri TEXT,
  servings REAL NOT NULL DEFAULT 1,
  notes TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_recipes_name ON recipes (name);

CREATE TABLE recipe_items (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes (id),
  food_id TEXT REFERENCES foods (id),
  child_recipe_id TEXT REFERENCES recipes (id),
  quantity_g REAL,
  servings REAL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (
    (food_id IS NOT NULL AND child_recipe_id IS NULL AND quantity_g IS NOT NULL)
    OR
    (food_id IS NULL AND child_recipe_id IS NOT NULL AND servings IS NOT NULL)
  )
);
CREATE INDEX idx_recipe_items_recipe ON recipe_items (recipe_id);

CREATE TABLE meal_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  is_custom INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  meal_type_id TEXT NOT NULL REFERENCES meal_types (id),
  name TEXT,
  time TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_meals_date ON meals (date);

CREATE TABLE meal_entries (
  id TEXT PRIMARY KEY,
  meal_id TEXT NOT NULL REFERENCES meals (id),
  source_kind TEXT NOT NULL,
  food_id TEXT REFERENCES foods (id),
  recipe_id TEXT REFERENCES recipes (id),
  label TEXT,
  quantity_g REAL,
  servings REAL,
  kcal REAL NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  sugars REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  saturated_fat REAL NOT NULL DEFAULT 0,
  fiber REAL NOT NULL DEFAULT 0,
  salt REAL NOT NULL DEFAULT 0,
  is_estimated INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  note TEXT,
  photo_uri TEXT,
  created_via TEXT NOT NULL DEFAULT 'manual',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (source_kind IN ('food', 'recipe', 'free'))
);
CREATE INDEX idx_meal_entries_meal ON meal_entries (meal_id);

CREATE TABLE profile (
  id TEXT PRIMARY KEY,
  sex TEXT,
  birthdate TEXT,
  height_cm REAL,
  activity_level TEXT,
  goal TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE targets (
  id TEXT PRIMARY KEY,
  valid_from TEXT NOT NULL,
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_targets_valid_from ON targets (valid_from DESC);

CREATE TABLE weight_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  body_fat_pct REAL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_weight_logs_date ON weight_logs (date);

CREATE TABLE step_logs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  steps INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX idx_step_logs_date ON step_logs (date);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
};
