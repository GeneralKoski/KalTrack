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
 * Riscrive la scheda per intero: giorni e blocchi sono un dettaglio interno,
 * e sostituirli è più prevedibile di un diff.
 *
 * La sostituzione è però LOGICA e non fisica, perché una cosa dall'esterno li
 * referenzia: `workout_sessions.routine_day_id` ricorda in quale giorno di
 * scheda è stato fatto un allenamento. Cancellarli davvero fa fallire la
 * foreign key, quindi dopo il primo allenamento la scheda non sarebbe più
 * modificabile; e riuscendoci si perderebbe comunque il legame con lo storico.
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
      "SELECT id FROM routine_days WHERE routine_id = ? AND deleted_at IS NULL",
      [id],
    );
    for (const day of days) {
      const blocks = await db.getAllAsync<{ id: string }>(
        "SELECT id FROM routine_blocks WHERE routine_day_id = ? AND deleted_at IS NULL",
        [day.id],
      );
      for (const block of blocks) {
        await db.runAsync(
          "UPDATE block_exercises SET deleted_at = ?, updated_at = ? WHERE routine_block_id = ?",
          [now, now, block.id],
        );
      }
      await db.runAsync(
        "UPDATE routine_blocks SET deleted_at = ?, updated_at = ? WHERE routine_day_id = ?",
        [now, now, day.id],
      );
    }
    await db.runAsync(
      "UPDATE routine_days SET deleted_at = ?, updated_at = ? WHERE routine_id = ? AND deleted_at IS NULL",
      [now, now, id],
    );

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

/**
 * Apre un allenamento, o riprende quello gia' aperto.
 *
 * Riprendere non e' un di piu': senza, ogni ritorno sulla schermata - uscire e
 * rientrare, chiudere l'app a meta' serie - lasciava dietro una sessione vuota
 * nello storico, e le serie finivano divise fra due allenamenti dello stesso
 * giorno. Una sessione e' aperta finche' non ha `ended_at`.
 */
export async function startSession(args: {
  date: string;
  routineDayId?: string | null;
}): Promise<string> {
  const db = await getDb();

  const open = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM workout_sessions
      WHERE date = ? AND ended_at IS NULL AND deleted_at IS NULL
        AND routine_day_id IS ?
      ORDER BY started_at DESC LIMIT 1`,
    [args.date, args.routineDayId ?? null],
  );
  if (open) return open.id;

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

/**
 * Cancella una sessione. Le sue serie non si toccano: ogni lettura aggregata
 * (`recentSessions`, `dailyExerciseSummary`, `exerciseSummaryInRange`) fa gia'
 * `JOIN` con `workout_sessions` e filtra `w.deleted_at IS NULL`, quindi
 * spariscono da sole appena la sessione e' cancellata - come i pasti con un
 * tipo cancellato in `getDayDiary`.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE workout_sessions SET deleted_at = ?, updated_at = ? WHERE id = ?",
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

export interface RecentSession {
  id: string;
  date: string;
  /** Nome del giorno di scheda seguito, null per un allenamento libero. */
  dayName: string | null;
  /** Serie di lavoro registrate; i riscaldamenti non contano. */
  workingSets: number;
  /** Volume totale in kg (carico per ripetizioni), 0 se a corpo libero. */
  volumeKg: number;
  /** Null se la sessione e' ancora aperta: e' quella da riprendere. */
  endedAt: string | null;
}

/**
 * Gli ultimi allenamenti, dal piu' recente.
 *
 * Una sessione senza `endedAt` non e' finita: chi apre la palestra e ne trova
 * una aperta vuole riprenderla, non cominciarne un'altra accanto.
 */
export async function recentSessions(limit = 5): Promise<RecentSession[]> {
  const db = await getDb();
  return db.getAllAsync<RecentSession>(
    `SELECT w.id,
            w.date,
            d.name AS dayName,
            w.ended_at AS endedAt,
            COALESCE(SUM(CASE WHEN s.id IS NULL THEN 0 ELSE 1 END), 0) AS workingSets,
            COALESCE(SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)), 0) AS volumeKg
       FROM workout_sessions w
       LEFT JOIN routine_days d
         ON d.id = w.routine_day_id AND d.deleted_at IS NULL
       LEFT JOIN session_sets s
         ON s.workout_session_id = w.id
        AND s.is_warmup = 0
        AND s.deleted_at IS NULL
      WHERE w.deleted_at IS NULL
      GROUP BY w.id
      ORDER BY w.date DESC, w.started_at DESC
      LIMIT ?`,
    [limit],
  );
}

/** Un esercizio di un giorno, gia' aggregato per essere condiviso. */
export interface DailyExerciseSummary {
  name: string;
  sets: number;
  totalReps: number;
  volumeKg: number;
  topWeightKg: number | null;
}

/**
 * Quel che si e' fatto in un giorno, un esercizio per riga.
 *
 * E' l'unica forma in cui la palestra esce dal telefono: nomi ed esercizi
 * aggregati, mai le serie singole. Il dettaglio di un allenamento resta qui
 * come il diario.
 *
 * Il NOME e non l'id, perche' gli id degli esercizi nascono su questo telefono
 * e sull'altro non vogliono dire niente.
 *
 * I riscaldamenti sono esclusi come dappertutto: non raccontano nulla sui
 * carichi di lavoro, e conterebbero come serie in piu' in un confronto.
 */
export async function dailyExerciseSummary(
  date: string,
): Promise<DailyExerciseSummary[]> {
  const db = await getDb();
  return db.getAllAsync<DailyExerciseSummary>(
    `SELECT e.name AS name,
            COUNT(s.id) AS sets,
            COALESCE(SUM(COALESCE(s.reps, 0)), 0) AS totalReps,
            COALESCE(SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)), 0) AS volumeKg,
            MAX(s.weight) AS topWeightKg
       FROM session_sets s
       JOIN workout_sessions w ON w.id = s.workout_session_id
       JOIN exercises e ON e.id = s.exercise_id
      WHERE w.date = ?
        AND s.is_warmup = 0
        AND s.deleted_at IS NULL
        AND w.deleted_at IS NULL
        AND e.deleted_at IS NULL
      GROUP BY e.name
      ORDER BY MIN(s.done_at)`,
    [date],
  );
}

/**
 * Gli esercizi di un intervallo, sommati per esercizio.
 *
 * Serie, ripetizioni e volume si sommano; il carico massimo e' il massimo del
 * periodo e non la somma - sommare i massimali direbbe che si e' alzato il
 * doppio di quel che si e' alzato. E' la stessa aggregazione che fa il server
 * (`ComparisonController::esercizi`), perche' le due colonne del confronto
 * devono voler dire la stessa cosa.
 */
export async function exerciseSummaryInRange(
  from: string,
  to: string,
): Promise<DailyExerciseSummary[]> {
  const db = await getDb();
  return db.getAllAsync<DailyExerciseSummary>(
    `SELECT e.name AS name,
            COUNT(s.id) AS sets,
            COALESCE(SUM(COALESCE(s.reps, 0)), 0) AS totalReps,
            COALESCE(SUM(COALESCE(s.weight, 0) * COALESCE(s.reps, 0)), 0) AS volumeKg,
            MAX(s.weight) AS topWeightKg
       FROM session_sets s
       JOIN workout_sessions w ON w.id = s.workout_session_id
       JOIN exercises e ON e.id = s.exercise_id
      WHERE w.date >= ? AND w.date <= ?
        AND s.is_warmup = 0
        AND s.deleted_at IS NULL
        AND w.deleted_at IS NULL
        AND e.deleted_at IS NULL
      GROUP BY e.name
      ORDER BY MIN(s.done_at)`,
    [from, to],
  );
}

/**
 * Quanti allenamenti in un intervallo.
 *
 * Conta nel database e non filtrando `recentSessions`: quel limite - cinquanta
 * sessioni, duecento - e' un numero arbitrario, e su uno storico piu' lungo il
 * conteggio di un periodo comincerebbe a mentire senza dirlo.
 */
export async function sessionCountInRange(
  from: string,
  to: string,
): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM workout_sessions
      WHERE date >= ? AND date <= ? AND deleted_at IS NULL`,
    [from, to],
  );
  return row?.n ?? 0;
}
