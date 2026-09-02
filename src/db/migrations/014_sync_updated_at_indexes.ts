import type { Migration } from "@/src/db/migrations/types";

/**
 * Un indice su `updated_at` per ogni tabella che si sincronizza.
 *
 * `collectChanges` interroga tutte le tabelle sincronizzate con
 * `WHERE updated_at > ? ORDER BY updated_at, rowid`, fino a venti giri per
 * sincronizzazione. Senza indice ognuna era una scansione completa piu' un
 * ordinamento in memoria, e con i cataloghi di serie si parte da oltre
 * duemilacinquecento righe fra alimenti ed esercizi: era la voce di costo piu'
 * grande di un'operazione che parte a ogni apertura dell'app.
 *
 * Fuori restano `settings`, che ha `key` come chiave primaria e poche righe, e
 * le due tabelle che non viaggiano (`ai_calls` e `app_logs`, che hanno gia' il
 * proprio indice su `created_at DESC`).
 *
 * `IF NOT EXISTS` perche' una migrazione va scritta per poter essere riletta:
 * se un domani una di queste tabelle nasce con l'indice addosso, questa non
 * deve fallire.
 */
export const migration014: Migration = {
  version: 14,
  name: "sync_updated_at_indexes",
  up: `
CREATE INDEX IF NOT EXISTS idx_meal_types_updated ON meal_types (updated_at);
CREATE INDEX IF NOT EXISTS idx_foods_updated ON foods (updated_at);
CREATE INDEX IF NOT EXISTS idx_recipes_updated ON recipes (updated_at);
CREATE INDEX IF NOT EXISTS idx_exercises_updated ON exercises (updated_at);
CREATE INDEX IF NOT EXISTS idx_routines_updated ON routines (updated_at);
CREATE INDEX IF NOT EXISTS idx_profile_updated ON profile (updated_at);
CREATE INDEX IF NOT EXISTS idx_targets_updated ON targets (updated_at);
CREATE INDEX IF NOT EXISTS idx_user_equipment_updated ON user_equipment (updated_at);
CREATE INDEX IF NOT EXISTS idx_weight_logs_updated ON weight_logs (updated_at);
CREATE INDEX IF NOT EXISTS idx_step_logs_updated ON step_logs (updated_at);
CREATE INDEX IF NOT EXISTS idx_water_logs_updated ON water_logs (updated_at);
CREATE INDEX IF NOT EXISTS idx_body_measurements_updated ON body_measurements (updated_at);
CREATE INDEX IF NOT EXISTS idx_progress_photos_updated ON progress_photos (updated_at);
CREATE INDEX IF NOT EXISTS idx_fasting_windows_updated ON fasting_windows (updated_at);
CREATE INDEX IF NOT EXISTS idx_achievements_updated ON achievements (updated_at);
CREATE INDEX IF NOT EXISTS idx_reminders_updated ON reminders (updated_at);
CREATE INDEX IF NOT EXISTS idx_recipe_items_updated ON recipe_items (updated_at);
CREATE INDEX IF NOT EXISTS idx_meals_updated ON meals (updated_at);
CREATE INDEX IF NOT EXISTS idx_meal_entries_updated ON meal_entries (updated_at);
CREATE INDEX IF NOT EXISTS idx_meal_plan_entries_updated ON meal_plan_entries (updated_at);
CREATE INDEX IF NOT EXISTS idx_routine_days_updated ON routine_days (updated_at);
CREATE INDEX IF NOT EXISTS idx_routine_blocks_updated ON routine_blocks (updated_at);
CREATE INDEX IF NOT EXISTS idx_block_exercises_updated ON block_exercises (updated_at);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_updated ON workout_sessions (updated_at);
CREATE INDEX IF NOT EXISTS idx_session_sets_updated ON session_sets (updated_at);
`,
};
