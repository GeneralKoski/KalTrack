import { addDays } from "@/src/domain/date";

export type AchievementMetric =
  | "loggedDays"
  | "workoutDays"
  | "totalSteps"
  | "bestDaySteps"
  | "bestWeightKg";

export interface AchievementDefinition {
  code: string;
  metric: AchievementMetric;
  threshold: number;
  /**
   * Vero quando la soglia si supera SCENDENDO. Il peso è l'unico caso: un
   * traguardo di dimagrimento scatta andando sotto, non sopra.
   */
  lowerIsBetter?: boolean;
}

/**
 * Il catalogo vive nel codice, non nel database: le definizioni cambiano con
 * l'app, mentre a database resta solo il fatto storico di averle raggiunte.
 */
export const ACHIEVEMENTS: AchievementDefinition[] = [
  { code: "logged_days_1", metric: "loggedDays", threshold: 1 },
  { code: "logged_days_7", metric: "loggedDays", threshold: 7 },
  { code: "logged_days_30", metric: "loggedDays", threshold: 30 },
  { code: "logged_days_100", metric: "loggedDays", threshold: 100 },
  { code: "logged_days_365", metric: "loggedDays", threshold: 365 },

  { code: "workout_days_1", metric: "workoutDays", threshold: 1 },
  { code: "workout_days_10", metric: "workoutDays", threshold: 10 },
  { code: "workout_days_50", metric: "workoutDays", threshold: 50 },
  { code: "workout_days_100", metric: "workoutDays", threshold: 100 },

  { code: "total_steps_100k", metric: "totalSteps", threshold: 100_000 },
  { code: "total_steps_1m", metric: "totalSteps", threshold: 1_000_000 },
  { code: "total_steps_5m", metric: "totalSteps", threshold: 5_000_000 },

  { code: "day_steps_10k", metric: "bestDaySteps", threshold: 10_000 },
  { code: "day_steps_15k", metric: "bestDaySteps", threshold: 15_000 },
  { code: "day_steps_20k", metric: "bestDaySteps", threshold: 20_000 },

  { code: "weight_under_90", metric: "bestWeightKg", threshold: 90, lowerIsBetter: true },
  { code: "weight_under_80", metric: "bestWeightKg", threshold: 80, lowerIsBetter: true },
  { code: "weight_under_70", metric: "bestWeightKg", threshold: 70, lowerIsBetter: true },
];

export interface AchievementStats {
  loggedDays: number;
  workoutDays: number;
  totalSteps: number;
  bestDaySteps: number;
  /** Peso più basso mai registrato. Null se non ci sono pesate. */
  bestWeightKg: number | null;
  /** Date con almeno un pasto registrato, per la serie. */
  loggedDates: string[];
}

export interface UnlockedAchievement {
  code: string;
  metric: AchievementMetric;
  value: number;
}

/**
 * I traguardi appena raggiunti, esclusi quelli già sbloccati.
 *
 * Valuta TUTTE le soglie superate, non solo la successiva: chi importa un
 * backup di mesi deve ricevere subito quello che ha già ottenuto, non uno al
 * giorno.
 */
export function evaluateAchievements(
  stats: AchievementStats,
  alreadyUnlocked: string[],
): UnlockedAchievement[] {
  const known = new Set(alreadyUnlocked);

  return ACHIEVEMENTS.filter((definition) => {
    if (known.has(definition.code)) return false;

    const value = stats[definition.metric];
    if (value === null) return false;

    return definition.lowerIsBetter
      ? value <= definition.threshold
      : value >= definition.threshold;
  }).map((definition) => ({
    code: definition.code,
    metric: definition.metric,
    value: stats[definition.metric] as number,
  }));
}

/**
 * Giorni consecutivi registrati fino a oggi.
 *
 * Parte da ieri se oggi non è ancora stato registrato: alle nove del mattino la
 * serie non è ancora persa, e azzerarla lì sarebbe scoraggiante oltre che falso.
 */
export function currentStreak(loggedDates: string[], today: string): number {
  if (loggedDates.length === 0) return 0;

  const days = new Set(loggedDates);
  let cursor = days.has(today) ? today : addDays(today, -1);
  if (!days.has(cursor)) return 0;

  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
