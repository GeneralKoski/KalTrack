import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import { normalizeText } from "@/src/domain/text";
import {
  canDoWith,
  exerciseEquipment,
  type Equipment,
  type ExerciseRow,
  type MuscleGroup,
} from "@/src/types/gym";

const SELECT = "SELECT * FROM exercises WHERE deleted_at IS NULL";

export interface ExerciseInput {
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment[];
  instructions?: string | null;
  notes?: string | null;
  isCustom?: boolean;
}

export async function createExercise(input: ExerciseInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();

  await db.runAsync(
    `INSERT INTO exercises (id, name, name_norm, muscle_group, secondary_muscles,
       equipment, is_custom, is_banned, dislike_level, notes, instructions,
       usage_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?)`,
    [
      id,
      input.name,
      normalizeText(input.name),
      input.muscleGroup,
      JSON.stringify(input.secondaryMuscles),
      JSON.stringify(input.equipment),
      input.isCustom === false ? 0 : 1,
      input.notes ?? null,
      input.instructions ?? null,
      now,
      now,
    ],
  );
  return id;
}

export async function getExercise(id: string): Promise<ExerciseRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ExerciseRow>(`${SELECT} AND id = ?`, [id]);
}

/**
 * Ricerca esercizi. Gli esercizi vietati sono esclusi per default: `is_banned`
 * significa "non propormelo mai", quindi non deve nemmeno comparire in elenco
 * salvo che si stia esplicitamente gestendo la lista dei vietati.
 */
export async function searchExercises(args: {
  term?: string;
  muscleGroup?: MuscleGroup;
  includeBanned?: boolean;
  limit?: number;
}): Promise<ExerciseRow[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const normalized = normalizeText(args.term ?? "");
  if (normalized !== "") {
    clauses.push("name_norm LIKE ?");
    params.push(`%${normalized}%`);
  }
  if (args.muscleGroup) {
    clauses.push("muscle_group = ?");
    params.push(args.muscleGroup);
  }
  if (!args.includeBanned) clauses.push("is_banned = 0");

  const where = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
  params.push(args.limit ?? 100);

  return db.getAllAsync<ExerciseRow>(
    `${SELECT}${where} ORDER BY dislike_level ASC, usage_count DESC, name ASC LIMIT ?`,
    params,
  );
}

export async function toggleExerciseBan(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE exercises SET is_banned = 1 - is_banned, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}

/** 0 = va bene, 1 = preferirei evitarlo, 2 = solo come ultima risorsa. */
export async function setExerciseDislike(
  id: string,
  level: 0 | 1 | 2,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE exercises SET dislike_level = ?, updated_at = ? WHERE id = ?",
    [level, nowIso(), id],
  );
}

export async function incrementExerciseUsage(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE exercises SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}

export async function setEquipmentAvailability(
  name: Equipment | string,
  available: boolean,
): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM user_equipment WHERE name = ? AND deleted_at IS NULL",
    [name],
  );

  if (existing) {
    await db.runAsync(
      "UPDATE user_equipment SET available = ?, updated_at = ? WHERE id = ?",
      [available ? 1 : 0, now, existing.id],
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO user_equipment (id, name, available, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [newId(), name, available ? 1 : 0, now, now],
  );
}

/**
 * Lo stato di OGNI attrezzo, non solo di quelli disponibili.
 *
 * Serve alla schermata che li fa spuntare: un attrezzo mai toccato non e' in
 * tabella, e senza questa distinzione non si potrebbe mostrare la differenza
 * fra "non ce l'ho" e "non l'ho ancora detto".
 */
export async function listEquipmentAvailability(): Promise<
  Record<string, boolean>
> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string; available: number }>(
    "SELECT name, available FROM user_equipment WHERE deleted_at IS NULL",
  );
  const state: Record<string, boolean> = {};
  for (const row of rows) state[row.name] = row.available === 1;
  return state;
}

export async function listAvailableEquipment(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM user_equipment WHERE available = 1 AND deleted_at IS NULL",
  );
  return rows.map((r) => r.name);
}

/**
 * Alternative a un esercizio, filtrate LOCALMENTE.
 *
 * Il filtro locale viene prima di qualunque AI di proposito: in palestra senza
 * campo la funzione deve restare usabile, e l'AI serve solo a ordinare e
 * spiegare, non a decidere cosa è possibile.
 *
 * I vietati non compaiono mai. Gli sgraditi sì, ma in fondo: "non mi piace" non
 * è "non esiste", e come ultima risorsa vanno comunque offerti.
 */
export async function suggestAlternatives(
  exerciseId: string,
  options: { onlyAvailableEquipment?: boolean; limit?: number } = {},
): Promise<ExerciseRow[]> {
  const source = await getExercise(exerciseId);
  if (!source) return [];

  const candidates = await searchExercises({
    muscleGroup: source.muscle_group,
    limit: 200,
  });

  let filtered = candidates.filter((row) => row.id !== exerciseId);

  if (options.onlyAvailableEquipment) {
    const available = new Set(await listAvailableEquipment());
    // Un elenco vuoto significa "non ho ancora detto cosa ho", non "non ho
    // niente": filtrare su di esso lasciava passare solo il corpo libero e
    // faceva sembrare che non esistessero alternative.
    if (available.size > 0) {
      filtered = filtered.filter((row) =>
        canDoWith(exerciseEquipment(row), available),
      );
    }
  }

  return filtered
    .sort(
      (a, b) =>
        a.dislike_level - b.dislike_level || b.usage_count - a.usage_count,
    )
    .slice(0, options.limit ?? 10);
}

/** Un esercizio esistente con lo stesso nome, a meno di maiuscole e accenti. */
export async function findExerciseByName(
  name: string,
): Promise<ExerciseRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ExerciseRow>(`${SELECT} AND name_norm = ?`, [
    normalizeText(name),
  ]);
}

/**
 * Aggiorna un esercizio.
 *
 * Solo i campi che si possono correggere da fuori: `is_banned`,
 * `dislike_level` e `usage_count` sono lo storico di come lo si usa, e non
 * hanno niente a che vedere con la sua descrizione.
 */
export async function updateExercise(
  id: string,
  input: ExerciseInput,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE exercises
        SET name = ?, name_norm = ?, muscle_group = ?, secondary_muscles = ?,
            equipment = ?, notes = ?, instructions = ?, updated_at = ?
      WHERE id = ?`,
    [
      input.name,
      normalizeText(input.name),
      input.muscleGroup,
      JSON.stringify(input.secondaryMuscles),
      JSON.stringify(input.equipment),
      input.notes ?? null,
      input.instructions ?? null,
      nowIso(),
      id,
    ],
  );
}

/**
 * Toglie un esercizio.
 *
 * `deleted_at` e mai `DELETE FROM`: e' una tabella sincronizzata, e una riga
 * tolta davvero non avrebbe modo di dire all'altro dispositivo che e' stata
 * tolta - il server rimanderebbe la sua copia e l'esercizio risorgerebbe.
 *
 * Le serie gia' registrate NON si toccano: puntano a questo id, e cancellarle
 * vorrebbe dire riscrivere la storia di un allenamento che e' stato fatto.
 */
export async function deleteExercise(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}
