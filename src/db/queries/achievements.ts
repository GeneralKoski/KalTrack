import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import {
  evaluateAchievements,
  type AchievementStats,
  type UnlockedAchievement,
} from "@/src/domain/achievements";

export interface AchievementRow {
  id: string;
  code: string;
  value: number | null;
  unlocked_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Le statistiche su cui si valutano i traguardi, raccolte dai dati esistenti.
 *
 * Si contano i GIORNI, non le righe: dieci voci in un giorno restano un giorno.
 * Un traguardo che si sblocca mangiando molte volte lo stesso giorno premierebbe
 * la cosa sbagliata.
 */
export async function collectStats(): Promise<AchievementStats> {
  const db = await getDb();

  const loggedRows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT m.date AS date FROM meals m
     JOIN meal_entries e ON e.meal_id = m.id AND e.deleted_at IS NULL
     WHERE m.deleted_at IS NULL
     ORDER BY m.date ASC`,
  );

  const workouts = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT w.date) AS n FROM workout_sessions w
     JOIN session_sets s ON s.workout_session_id = w.id AND s.deleted_at IS NULL
     WHERE w.deleted_at IS NULL`,
  );

  const steps = await db.getFirstAsync<{ total: number | null; best: number | null }>(
    "SELECT SUM(steps) AS total, MAX(steps) AS best FROM step_logs",
  );

  const weight = await db.getFirstAsync<{ best: number | null }>(
    "SELECT MIN(weight_kg) AS best FROM weight_logs",
  );

  return {
    loggedDays: loggedRows.length,
    loggedDates: loggedRows.map((r) => r.date),
    workoutDays: workouts?.n ?? 0,
    totalSteps: steps?.total ?? 0,
    bestDaySteps: steps?.best ?? 0,
    bestWeightKg: weight?.best ?? null,
  };
}

export async function listUnlocked(): Promise<AchievementRow[]> {
  const db = await getDb();
  return db.getAllAsync<AchievementRow>(
    "SELECT * FROM achievements WHERE deleted_at IS NULL ORDER BY unlocked_at DESC",
  );
}

/**
 * Valuta i traguardi e salva quelli nuovi. Idempotente: chiamarla a ogni avvio
 * è sicuro, e l'indice unico sul codice impedisce doppioni anche in caso di
 * chiamate concorrenti.
 */
export async function syncAchievements(): Promise<UnlockedAchievement[]> {
  const stats = await collectStats();
  const existing = await listUnlocked();
  const unlocked = evaluateAchievements(
    stats,
    existing.map((row) => row.code),
  );
  if (unlocked.length === 0) return [];

  const db = await getDb();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (const achievement of unlocked) {
      await db.runAsync(
        `INSERT INTO achievements (id, code, value, unlocked_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO NOTHING`,
        [newId(), achievement.code, achievement.value, now, now, now],
      );
    }
  });
  return unlocked;
}
