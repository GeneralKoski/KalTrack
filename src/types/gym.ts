/**
 * I gruppi muscolari: il SEME della migrazione 020, non piu' l'elenco
 * autorevole.
 *
 * L'elenco vero e' `muscle_groups` in SQLite, che il pull del catalogo
 * riscrive: un gruppo aggiunto dal pannello arriva senza un rilascio
 * dell'app, e un'union TypeScript non puo' rappresentarlo. Queste costanti
 * restano per tre cose e nessun'altra: seminare la tabella, dare a
 * `keys.test.ts` il minimo garantito da confrontare con i18n, e dire quali
 * slug hanno un'etichetta di ricaduta in `gym.muscle.*`.
 *
 * Chi filtra un valore che arriva da fuori NON usa piu' queste: il metro e'
 * la tassonomia (`knownSlugs` in `src/domain/taxonomy.ts`).
 */
export const MUSCLE_GROUPS = [
  "petto",
  "schiena",
  "spalle",
  "bicipiti",
  "tricipiti",
  "quadricipiti",
  "femorali",
  "glutei",
  "polpacci",
  "addome",
  "avambracci",
  "full_body",
] as const;

/**
 * Uno slug di gruppo muscolare.
 *
 * Era un'union dei dodici valori qui sopra. Adesso e' `string`, perche'
 * l'elenco vive in una tabella che il server riscrive: il compilatore non
 * puo' piu' garantirlo, e il controllo si fa a runtime contro la tassonomia.
 */
export type MuscleGroup = string;

/** Come MUSCLE_GROUPS: seme, non elenco autorevole. */
export const EQUIPMENT = [
  "corpo_libero",
  "bilanciere",
  "manubri",
  "kettlebell",
  "cavi",
  "macchina",
  "panca",
  "sbarra",
  "elastici",
  "trx",
  "cardio",
] as const;

/** Come `MuscleGroup`: era un'union degli undici valori qui sopra. */
export type Equipment = string;

/** Blocchi: è il livello che rende esprimibili superset, circuiti e dropset. */
export const BLOCK_KINDS = [
  "single",
  "superset",
  "circuit",
  "dropset",
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

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
  photo_uri: string | null;
  /**
   * L'identita' della voce nel catalogo comune, quando ne ha una.
   *
   * Null per un esercizio che nessuno ha mai proposto e per le righe scritte
   * prima della migrazione 019.
   */
  catalog_uid: string | null;
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

/**
 * Attrezzatura che c'e' sempre, ovunque.
 *
 * "corpo_libero" e' un valore vero della lista, non l'assenza di valori: un
 * piegamento ha `equipment: ["corpo_libero"]`, non un array vuoto. Chi
 * controlla solo `needed.length === 0` scarta ogni esercizio a corpo libero
 * appena l'utente dichiara la propria attrezzatura senza spuntare "corpo
 * libero", che e' l'ultima cosa a cui penserebbe.
 *
 * E' l'unico slug su cui questo codice fa un'affermazione propria invece di
 * leggere la tassonomia, e regge perche' sul server "corpo_libero" non e'
 * cancellabile: senza quella garanzia sarebbe un valore inventato qui.
 */
export const ALWAYS_AVAILABLE_EQUIPMENT: Equipment[] = ["corpo_libero"];

/** True se l'esercizio si puo' fare con l'attrezzatura indicata. */
export const canDoWith = (
  needed: Equipment[],
  available: ReadonlySet<string>,
): boolean =>
  needed.length === 0 ||
  needed.every(
    (item) =>
      available.has(item) ||
      (ALWAYS_AVAILABLE_EQUIPMENT as string[]).includes(item),
  );

export const exerciseEquipment = (row: ExerciseRow): Equipment[] =>
  parseStringArray(row.equipment) as Equipment[];

export const exerciseSecondary = (row: ExerciseRow): MuscleGroup[] =>
  parseStringArray(row.secondary_muscles) as MuscleGroup[];
