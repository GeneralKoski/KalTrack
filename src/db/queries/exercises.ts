import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import { normalizeText } from "@/src/domain/text";
import {
  canDoWith,
  EQUIPMENT,
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
  photoUri?: string | null;
  isCustom?: boolean;
  catalogUid?: string | null;
}

/** I campi che il catalogo possiede, e nessun altro. */
export interface CatalogExerciseFields {
  name: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  equipment: string[];
  instructions: string | null;
  photoUri: string | null;
}

export async function createExercise(input: ExerciseInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = nowIso();

  await db.runAsync(
    `INSERT INTO exercises (id, name, name_norm, muscle_group, secondary_muscles,
       equipment, is_custom, is_banned, dislike_level, notes, instructions,
       photo_uri, catalog_uid, usage_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 0, ?, ?)`,
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
      input.photoUri ?? null,
      input.catalogUid ?? null,
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

export async function setExerciseBanned(
  id: string,
  banned: boolean,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE exercises SET is_banned = ?, updated_at = ? WHERE id = ?",
    [banned ? 1 : 0, nowIso(), id],
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
 * tabella e conta come disponibile (vedi `listAvailableEquipment`), ma la
 * schermata deve comunque poter distinguere "esplicitamente si" da
 * "esplicitamente no" per disegnare i due stati dei chip.
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

/**
 * L'attrezzatura che si puo' usare: tutta, tranne quella tolta a mano.
 *
 * E' un elenco per eccezione e non per dichiarazione: un attrezzo mai
 * toccato conta come disponibile. Il contrario - partire da zero e chiedere
 * di spuntare quel che si ha - lasciava i chip tutti spenti al primo avvio, e
 * senza uno stato attivo visibile sembravano non rispondere al tocco.
 */
export async function listAvailableEquipment(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM user_equipment WHERE available = 0 AND deleted_at IS NULL",
  );
  const unavailable = new Set(rows.map((r) => r.name));
  return EQUIPMENT.filter((item) => !unavailable.has(item));
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
    // `listAvailableEquipment` e' gia' "tutto tranne quello tolto a mano":
    // non serve un caso speciale per l'elenco vuoto, il filtro si applica
    // sempre allo stesso modo.
    const available = new Set(await listAvailableEquipment());
    filtered = filtered.filter((row) =>
      canDoWith(exerciseEquipment(row), available),
    );
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
            equipment = ?, notes = ?, instructions = ?, photo_uri = ?, updated_at = ?
      WHERE id = ?`,
    [
      input.name,
      normalizeText(input.name),
      input.muscleGroup,
      JSON.stringify(input.secondaryMuscles),
      JSON.stringify(input.equipment),
      input.notes ?? null,
      input.instructions ?? null,
      input.photoUri ?? null,
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

/** La riga che porta questo uid di catalogo, cancellate escluse. */
export async function findExerciseByCatalogUid(
  uid: string,
): Promise<ExerciseRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ExerciseRow>(`${SELECT} AND catalog_uid = ?`, [uid]);
}

/**
 * Appiccica l'uid a una riga che non ce l'ha.
 *
 * E' il primo pull dopo l'aggiornamento, quando le righe gia' installate si
 * riconoscono solo dal nome normalizzato: da qui in poi quella riga si
 * aggancia per uid e una rinomina fatta dal pannello la aggiorna invece di
 * duplicarla.
 *
 * `updated_at` NON si tocca: l'uid non e' una modifica dei dati dell'utente,
 * e muoverlo rimanderebbe la riga al server a ogni primo pull di ogni
 * telefono.
 */
export async function setExerciseCatalogUid(
  id: string,
  uid: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE exercises SET catalog_uid = ? WHERE id = ?", [
    uid,
    id,
  ]);
}

/**
 * Riallinea una riga di catalogo ai valori del server.
 *
 * L'elenco delle colonne e' il confine, e va letto come tale: `notes`,
 * `dislike_level`, `is_banned` e `usage_count` NON ci sono e non devono
 * comparirci. Sono giudizi su un esercizio e storia di come lo si usa, non la
 * sua descrizione, e il catalogo non ne sa niente - riscriverli vorrebbe dire
 * che un aggiornamento del catalogo cancella "questo mi fa male alla spalla".
 *
 * `is_custom` non c'e' per il motivo opposto: chi chiama ha gia' verificato
 * che valga 0, e riscriverlo qui sarebbe l'unico modo di riportare sotto il
 * catalogo una riga che l'utente si e' preso.
 */
export async function applyCatalogExercise(
  id: string,
  uid: string,
  fields: CatalogExerciseFields,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE exercises
        SET name = ?, name_norm = ?, muscle_group = ?, secondary_muscles = ?,
            equipment = ?, instructions = ?, photo_uri = ?, catalog_uid = ?,
            updated_at = ?
      WHERE id = ?`,
    [
      fields.name,
      normalizeText(fields.name),
      fields.muscleGroup,
      JSON.stringify(fields.secondaryMuscles),
      JSON.stringify(fields.equipment),
      fields.instructions,
      fields.photoUri,
      uid,
      nowIso(),
      id,
    ],
  );
}

/**
 * La voce non e' piu' in catalogo: la riga resta, e diventa dell'utente.
 *
 * Non si cancella, e non e' una cautela: cancellandola, ogni allenamento
 * passato che la nominava perderebbe il nome di quel che si e' fatto. E'
 * la stessa ragione per cui `deleteRoutine` non cancella i giorni.
 *
 * L'uid resta in colonna. Cancellarlo sembrerebbe piu' pulito e sarebbe un
 * difetto: una voce ripristinata dal pannello non si riconoscerebbe piu' per
 * uid, il nome combacerebbe con una riga che ora e' `is_custom = 1` e quindi
 * intoccabile, e il pull finirebbe per inserirne un doppione.
 */
export async function detachExerciseFromCatalog(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE exercises SET is_custom = 1, updated_at = ? WHERE id = ?",
    [nowIso(), id],
  );
}
