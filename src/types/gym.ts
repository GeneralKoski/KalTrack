export type MuscleGroup =
  | "petto"
  | "schiena"
  | "spalle"
  | "bicipiti"
  | "tricipiti"
  | "quadricipiti"
  | "femorali"
  | "glutei"
  | "polpacci"
  | "addome"
  | "avambracci"
  | "full_body";

export type Equipment =
  | "corpo_libero"
  | "bilanciere"
  | "manubri"
  | "kettlebell"
  | "cavi"
  | "macchina"
  | "panca"
  | "sbarra"
  | "elastici"
  | "trx"
  | "cardio";

/** Blocchi: è il livello che rende esprimibili superset, circuiti e dropset. */
export type BlockKind = "single" | "superset" | "circuit" | "dropset";

export interface ExerciseRow {
  id: string;
  name: string;
  name_norm: string;
  muscle_group: MuscleGroup;
  /** JSON array di MuscleGroup. */
  secondary_muscles: string | null;
  /** JSON array di Equipment. */
  equipment: string | null;
  is_custom: number;
  is_banned: number;
  /** 0 = nessun problema, 1 = preferirei evitarlo, 2 = solo come ultima risorsa. */
  dislike_level: number;
  notes: string | null;
  instructions: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserEquipmentRow {
  id: string;
  name: string;
  available: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RoutineRow {
  id: string;
  name: string;
  is_active: number;
  notes: string | null;
  generated_by_ai: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RoutineDayRow {
  id: string;
  routine_id: string;
  name: string;
  sort: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface RoutineBlockRow {
  id: string;
  routine_day_id: string;
  kind: BlockKind;
  sort: number;
  rest_seconds: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BlockExerciseRow {
  id: string;
  routine_block_id: string;
  exercise_id: string;
  sort: number;
  target_sets: number | null;
  target_reps: string | null;
  target_weight: number | null;
  tempo: string | null;
  rpe: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkoutSessionRow {
  id: string;
  date: string;
  routine_day_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SessionSetRow {
  id: string;
  workout_session_id: string;
  exercise_id: string;
  block_ref: string | null;
  set_index: number;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  is_warmup: number;
  done_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Parsing dei campi JSON, tolleranti a dati sporchi o assenti. */
export const parseStringArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

export const exerciseEquipment = (row: ExerciseRow): Equipment[] =>
  parseStringArray(row.equipment) as Equipment[];

export const exerciseSecondary = (row: ExerciseRow): MuscleGroup[] =>
  parseStringArray(row.secondary_muscles) as MuscleGroup[];
