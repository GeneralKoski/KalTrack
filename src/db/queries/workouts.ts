import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import { epley1RM } from "@/src/domain/strength";
import type {
  BlockKind,
  BlockExerciseRow,
  ExerciseRow,
  RoutineBlockRow,
  RoutineDayRow,
  RoutineRow,
  SessionSetRow,
} from "@/src/types/gym";

export interface BlockExerciseInput {
  exerciseId: string;
  targetSets?: number | null;
  targetReps?: string | null;
  targetWeight?: number | null;
  tempo?: string | null;
  rpe?: number | null;
  notes?: string | null;
}

export interface BlockInput {
  kind: BlockKind;
  restSeconds?: number | null;
  notes?: string | null;
  exercises: BlockExerciseInput[];
}

export interface DayInput {
  name: string;
  blocks: BlockInput[];
}

export interface RoutineInput {
  name: string;
  notes?: string | null;
  generatedByAi?: boolean;
  days: DayInput[];
}

/** Un blocco con dentro gli esercizi già risolti, pronto da mostrare. */
export interface ResolvedBlock {
  block: RoutineBlockRow;
  kind: BlockKind;
  exercises: { row: BlockExerciseRow; exercise: ExerciseRow }[];
}

export interface ResolvedDay {
  day: RoutineDayRow;
  name: string;
  blocks: ResolvedBlock[];
}

export async function listRoutines(): Promise<RoutineRow[]> {
  const db = await getDb();
  return db.getAllAsync<RoutineRow>(
    "SELECT * FROM routines WHERE deleted_at IS NULL ORDER BY is_active DESC, name ASC",
  );
}

export async function getActiveRoutine(): Promise<RoutineRow | null> {
  const db = await getDb();
  return db.getFirstAsync<RoutineRow>(
    "SELECT * FROM routines WHERE is_active = 1 AND deleted_at IS NULL LIMIT 1",
  );
}

/** Una sola scheda alla volta è attiva: attivarne una disattiva le altre. */
export async function activateRoutine(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE routines SET is_active = 0, updated_at = ?", [now]);
    await db.runAsync(
      "UPDATE routines SET is_active = 1, updated_at = ? WHERE id = ?",
      [now, id],
    );
  });
}

async function insertDays(
  db: Awaited<ReturnType<typeof getDb>>,
  routineId: string,
  days: DayInput[],
  now: string,
): Promise<void> {
  let daySort = 0;
  for (const day of days) {
    const dayId = newId();
    await db.runAsync(
      `INSERT INTO routine_days (id, routine_id, name, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dayId, routineId, day.name, daySort++, now, now],
    );

    let blockSort = 0;
    for (const block of day.blocks) {
      const blockId = newId();
      await db.runAsync(
        `INSERT INTO routine_blocks (id, routine_day_id, kind, sort, rest_seconds,
           notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          blockId,
          dayId,
          block.kind,
          blockSort++,
          block.restSeconds ?? null,
          block.notes ?? null,
          now,
          now,
        ],
      );

      let exerciseSort = 0;
      for (const exercise of block.exercises) {
        await db.runAsync(
          `INSERT INTO block_exercises (id, routine_block_id, exercise_id, sort,
             target_sets, target_reps, target_weight, tempo, rpe, notes,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            blockId,
            exercise.exerciseId,
            exerciseSort++,
            exercise.targetSets ?? null,
            exercise.targetReps ?? null,
            exercise.targetWeight ?? null,
            exercise.tempo ?? null,
            exercise.rpe ?? null,
            exercise.notes ?? null,
            now,
            now,
          ],
        );
      }
    }
  }
}

export async function createRoutine(input: RoutineInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO routines (id, name, is_active, notes, generated_by_ai,
         created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?, ?)`,
      [id, input.name, input.notes ?? null, input.generatedByAi ? 1 : 0, now, now],
    );
    await insertDays(db, id, input.days, now);
  });
  return id;
}

/**
 * Riscrive la scheda per intero. Giorni e blocchi sono un dettaglio interno
 * alla scheda: niente li referenzia dall'esterno, quindi sostituirli è più
 * semplice e più prevedibile di un diff.
 */
export async function updateRoutine(
  id: string,
  input: RoutineInput,
): Promise<void> {
  const db = await getDb();
  const now = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE routines SET name = ?, notes = ?, updated_at = ? WHERE id = ?",
      [input.name, input.notes ?? null, now, id],
    );

    const days = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM routine_days WHERE routine_id = ?",
      [id],
    );
    for (const day of days) {
      const blocks = await db.getAllAsync<{ id: string }>(
        "SELECT id FROM routine_blocks WHERE routine_day_id = ?",
        [day.id],
      );
      for (const block of blocks) {
        await db.runAsync("DELETE FROM block_exercises WHERE routine_block_id = ?", [
          block.id,
        ]);
      }
      await db.runAsync("DELETE FROM routine_blocks WHERE routine_day_id = ?", [
        day.id,
      ]);
    }
    await db.runAsync("DELETE FROM routine_days WHERE routine_id = ?", [id]);

    await insertDays(db, id, input.days, now);
  });
}

export async function deleteRoutine(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE routines SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function listRoutineDays(
  routineId: string,
): Promise<RoutineDayRow[]> {
  const db = await getDb();
  return db.getAllAsync<RoutineDayRow>(
    "SELECT * FROM routine_days WHERE routine_id = ? AND deleted_at IS NULL ORDER BY sort ASC",
    [routineId],
  );
}

/**
 * Un giorno con tutto risolto. Gli esercizi cancellati vengono saltati: togliere
 * un esercizio dal catalogo non deve rendere la scheda inutilizzabile.
 */
export async function getRoutineDay(
  routineId: string,
  dayIndex: number,
): Promise<ResolvedDay | null> {
  const days = await listRoutineDays(routineId);
  const day = days[dayIndex];
  if (!day) return null;

  const db = await getDb();
  const blockRows = await db.getAllAsync<RoutineBlockRow>(
    "SELECT * FROM routine_blocks WHERE routine_day_id = ? AND deleted_at IS NULL ORDER BY sort ASC",
    [day.id],
  );

  const blocks: ResolvedBlock[] = [];
  for (const block of blockRows) {
    const rows = await db.getAllAsync<BlockExerciseRow>(
      "SELECT * FROM block_exercises WHERE routine_block_id = ? AND deleted_at IS NULL ORDER BY sort ASC",
      [block.id],
    );

    const exercises: ResolvedBlock["exercises"] = [];
    for (const row of rows) {
      const exercise = await db.getFirstAsync<ExerciseRow>(
        "SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL",
        [row.exercise_id],
      );
      if (!exercise) continue;
      exercises.push({ row, exercise });
    }
    blocks.push({ block, kind: block.kind, exercises });
  }

  return { day, name: day.name, blocks };
}

export async function startSession(args: {
  date: string;
  routineDayId?: string | null;
}): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO workout_sessions (id, date, routine_day_id, started_at,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, args.date, args.routineDayId ?? null, now, now, now],
  );
  return id;
}

export async function endSession(sessionId: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE workout_sessions SET ended_at = ?, updated_at = ? WHERE id = ?",
    [now, now, sessionId],
  );
}

export async function logSet(args: {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number | null;
  weight: number | null;
  rpe?: number | null;
  isWarmup?: boolean;
  blockRef?: string | null;
}): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();
  await db.runAsync(
    `INSERT INTO session_sets (id, workout_session_id, exercise_id, block_ref,
       set_index, reps, weight, rpe, is_warmup, done_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      args.sessionId,
      args.exerciseId,
      args.blockRef ?? null,
      args.setIndex,
      args.reps,
      args.weight,
      args.rpe ?? null,
      args.isWarmup ? 1 : 0,
      now,
      now,
      now,
    ],
  );
  await db.runAsync(
    "UPDATE exercises SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?",
    [now, args.exerciseId],
  );
  return id;
}

/**
 * Le serie dell'ULTIMA sessione in cui l'esercizio è stato fatto, non tutte:
 * servono a precompilare la prossima volta, e la storia intera sarebbe rumore.
 * Il riscaldamento è escluso: non racconta nulla sui carichi di lavoro.
 */
export async function lastSetsFor(
  exerciseId: string,
): Promise<SessionSetRow[]> {
  const db = await getDb();
  const last = await db.getFirstAsync<{ workout_session_id: string }>(
    `SELECT s.workout_session_id FROM session_sets s
     JOIN workout_sessions w ON w.id = s.workout_session_id
     WHERE s.exercise_id = ? AND s.is_warmup = 0
       AND s.deleted_at IS NULL AND w.deleted_at IS NULL
     ORDER BY w.date DESC, s.done_at DESC LIMIT 1`,
    [exerciseId],
  );
  if (!last) return [];

  return db.getAllAsync<SessionSetRow>(
    `SELECT * FROM session_sets
     WHERE workout_session_id = ? AND exercise_id = ? AND is_warmup = 0
       AND deleted_at IS NULL
     ORDER BY set_index ASC`,
    [last.workout_session_id, exerciseId],
  );
}

export interface PersonalBest {
  weight: number;
  reps: number;
  estimated1RM: number;
  doneAt: string | null;
}

/**
 * Il record personale, per massimale STIMATO e non per carico: otto ripetizioni
 * con 80 kg valgono più di una con 100, e premiare il carico nudo spingerebbe a
 * fare singole pesanti invece di allenarsi.
 */
export async function personalBest(
  exerciseId: string,
): Promise<PersonalBest | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionSetRow>(
    `SELECT * FROM session_sets
     WHERE exercise_id = ? AND is_warmup = 0 AND deleted_at IS NULL
       AND weight IS NOT NULL AND reps IS NOT NULL`,
    [exerciseId],
  );

  let best: PersonalBest | null = null;
  for (const row of rows) {
    const estimate = epley1RM(row.weight ?? 0, row.reps ?? 0);
    if (estimate === null) continue;
    if (!best || estimate > best.estimated1RM) {
      best = {
        weight: row.weight ?? 0,
        reps: row.reps ?? 0,
        estimated1RM: estimate,
        doneAt: row.done_at,
      };
    }
  }
  return best;
}
