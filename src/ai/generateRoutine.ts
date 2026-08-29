import { chat } from "@/src/ai/client";
import { MODELS } from "@/src/ai/config";
import { AiResponseError } from "@/src/ai/errors";
import { searchExercises } from "@/src/db/queries/exercises";
import type {
  BlockExerciseInput,
  BlockInput,
  DayInput,
  RoutineInput,
} from "@/src/db/queries/workouts";
import {
  exerciseEquipment,
  type BlockKind,
  type Equipment,
  type ExerciseRow,
} from "@/src/types/gym";
import { logger } from "@/src/utils/logger";

export type RoutineGoal =
  | "forza"
  | "ipertrofia"
  | "dimagrimento"
  | "resistenza";

export type RoutineLevel = "principiante" | "intermedio" | "avanzato";

export interface RoutinePreferences {
  goal: RoutineGoal;
  daysPerWeek: number;
  sessionMinutes: number;
  availableEquipment: Equipment[];
  level: RoutineLevel;
}

/** La generazione non ha prodotto niente di utilizzabile. */
export class RoutineGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutineGenerationError";
  }
}

const MIN_DAYS = 1;
const MAX_DAYS = 7;
const MIN_SESSION_MINUTES = 15;
const MAX_SESSION_MINUTES = 240;

/**
 * Tetto sul catalogo mandato al modello. Il seed ne ha 200 e il filtro per
 * attrezzatura ne toglie una parte: serve a non far esplodere il prompt se un
 * giorno il catalogo cresce, non a selezionare.
 */
const MAX_CATALOG = 300;

const BLOCK_KINDS: readonly BlockKind[] = [
  "single",
  "superset",
  "circuit",
  "dropset",
];

const MAX_SETS = 12;
const MAX_REST_SECONDS = 600;
const MAX_RPE = 10;
const MAX_NAME_LEN = 80;
const MAX_NOTES_LEN = 240;

/**
 * Inglese di proposito: i modelli seguono le istruzioni in inglese meglio che
 * in italiano. Nomi dei giorni, note e ripetizioni li leggerà l'utente, quindi
 * il contenuto è italiano.
 */
const SYSTEM_PROMPT = `You are a strength coach building a weekly training plan.
You are given the athlete's goal, level, days per week, session length, and a CLOSED catalog
of exercises they can actually perform (their equipment, minus what they refuse to do).

Rules:
- Use ONLY exercise ids from the catalog, copied exactly. Never invent an id and never add an
  exercise that is not in the catalog: anything else is discarded and the plan comes out short.
- Produce exactly the requested number of training days.
- Fit each day inside the session length: roughly 3 minutes per working set, warm-up included.
- Cover the whole body across the week and never train the same muscle group hard on two
  consecutive days.
- Match sets and reps to the goal: forza 3-6 reps with long rest, ipertrofia 6-12,
  dimagrimento and resistenza 12-20 with short rest. Adjust the volume to the level:
  principiante fewer sets and simpler movements, avanzato more.
- Block "kind": "single" for a normal exercise, "superset" for two exercises back to back,
  "circuit" for three or more, "dropset" for drop sets. A superset block holds 2+ exercises,
  a single block holds exactly 1.
- Day names, the plan name and any notes are written in ITALIAN, short and concrete
  ("Spinta", "Gambe e core"). "targetReps" is a string in Italian, like "8-10" or "12".

Reply with a single JSON object and nothing else:
{"name":"<nome scheda in italiano>",
 "notes":"<una riga in italiano, opzionale>",
 "days":[{"name":"<nome giorno>","blocks":[
   {"kind":"single","restSeconds":90,"exercises":[
     {"exerciseId":"<id dal catalogo>","targetSets":4,"targetReps":"8-10","rpe":8,
      "notes":"<opzionale, italiano>"}]}]}]}`;

function checkPreferences(preferences: RoutinePreferences): void {
  const { daysPerWeek, sessionMinutes } = preferences;
  if (
    !Number.isInteger(daysPerWeek) ||
    daysPerWeek < MIN_DAYS ||
    daysPerWeek > MAX_DAYS
  ) {
    throw new RoutineGenerationError(
      `Giorni a settimana non validi: ${daysPerWeek}`,
    );
  }
  if (
    !Number.isFinite(sessionMinutes) ||
    sessionMinutes < MIN_SESSION_MINUTES ||
    sessionMinutes > MAX_SESSION_MINUTES
  ) {
    throw new RoutineGenerationError(
      `Durata della sessione non plausibile: ${sessionMinutes} minuti`,
    );
  }
}

/**
 * Esercizi che l'utente può davvero fare: mai i vietati (searchExercises li
 * esclude da sé) e solo quelli coperti dall'attrezzatura dichiarata.
 *
 * Senza attrezzatura richiesta l'esercizio è a corpo libero, quindi sempre
 * fattibile: stessa regola di suggestAlternatives.
 */
async function eligibleExercises(
  availableEquipment: Equipment[],
): Promise<ExerciseRow[]> {
  const rows = await searchExercises({ limit: MAX_CATALOG });
  const available = new Set<string>(availableEquipment);
  return rows.filter((row) => {
    const needed = exerciseEquipment(row);
    return needed.length === 0 || needed.every((item) => available.has(item));
  });
}

/** Riga compatta per il prompt: id, nome e gruppo bastano a scegliere. */
const compact = (row: ExerciseRow): string =>
  `${row.id} | ${row.name} | ${row.muscle_group}`;

function text(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trimEnd() : trimmed;
}

/**
 * I modelli mandano spesso i numeri come stringa ("4"): rifiutarli
 * butterebbe una scheda per un dettaglio di serializzazione.
 */
function numberIn(value: unknown, min: number, max: number): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/** "8-10" o 12: entrambe le forme sono ripetizioni valide. */
function reps(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(value);
  }
  return text(value, 20);
}

const isBlockKind = (value: unknown): value is BlockKind =>
  typeof value === "string" && BLOCK_KINDS.includes(value as BlockKind);

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Un esercizio proposto dal modello, o null se non è ammissibile.
 *
 * `byId` contiene solo esercizi esistenti, non vietati e alla portata
 * dell'attrezzatura: l'appartenenza alla mappa è tutta la validazione che
 * serve, ed è ciò che impedisce al modello di reintrodurre un vietato.
 */
function parseExercise(
  raw: unknown,
  byId: Map<string, ExerciseRow>,
): BlockExerciseInput | null {
  const entry = record(raw);
  if (!entry) return null;

  const id = entry["exerciseId"];
  if (typeof id !== "string") return null;
  const exerciseId = id.trim();
  if (!byId.has(exerciseId)) {
    logger.warn(
      `[generateRoutine] esercizio "${exerciseId}" scartato: non è nel catalogo ammesso`,
    );
    return null;
  }

  return {
    exerciseId,
    targetSets: numberIn(entry["targetSets"], 1, MAX_SETS),
    targetReps: reps(entry["targetReps"]),
    rpe: numberIn(entry["rpe"], 1, MAX_RPE),
    notes: text(entry["notes"], MAX_NOTES_LEN),
  };
}

/** Un blocco rimasto senza esercizi validi non è un blocco vuoto: non esiste. */
function parseBlock(
  raw: unknown,
  byId: Map<string, ExerciseRow>,
): BlockInput | null {
  const entry = record(raw);
  if (!entry) return null;

  const rawExercises = entry["exercises"];
  if (!Array.isArray(rawExercises)) return null;

  const exercises: BlockExerciseInput[] = [];
  for (const item of rawExercises) {
    const exercise = parseExercise(item, byId);
    if (exercise) exercises.push(exercise);
  }
  if (exercises.length === 0) return null;

  const kind = entry["kind"];
  return {
    // Un solo esercizio superstite non è più un superset: il blocco degrada a
    // "single" invece di descrivere un accoppiamento che non c'è più.
    kind: isBlockKind(kind) && exercises.length > 1 ? kind : "single",
    restSeconds: numberIn(entry["restSeconds"], 0, MAX_REST_SECONDS),
    notes: text(entry["notes"], MAX_NOTES_LEN),
    exercises,
  };
}

function parseDay(
  raw: unknown,
  index: number,
  byId: Map<string, ExerciseRow>,
): DayInput | null {
  const entry = record(raw);
  if (!entry) return null;

  const rawBlocks = entry["blocks"];
  if (!Array.isArray(rawBlocks)) return null;

  const blocks: BlockInput[] = [];
  for (const item of rawBlocks) {
    const block = parseBlock(item, byId);
    if (block) blocks.push(block);
  }
  if (blocks.length === 0) {
    logger.warn(
      `[generateRoutine] giorno ${index + 1} scartato: nessun esercizio valido`,
    );
    return null;
  }

  return {
    name: text(entry["name"], MAX_NAME_LEN) ?? `Giorno ${index + 1}`,
    blocks,
  };
}

function parseRoutine(
  content: string | null,
  byId: Map<string, ExerciseRow>,
  preferences: RoutinePreferences,
): RoutineInput {
  if (!content) throw new AiResponseError("Scheda generata vuota");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiResponseError("Scheda generata non è JSON valido");
  }

  const root = record(parsed);
  if (!root) throw new AiResponseError("Scheda generata in formato inatteso");

  const rawDays = root["days"];
  if (!Array.isArray(rawDays)) {
    throw new AiResponseError("Scheda generata senza giorni");
  }

  const days: DayInput[] = [];
  for (const [index, item] of rawDays.entries()) {
    const day = parseDay(item, index, byId);
    if (day) days.push(day);
  }

  // Restituire una scheda senza giorni significherebbe far salvare all'utente
  // un contenitore vuoto e scoprirlo in palestra: meglio un errore adesso.
  if (days.length === 0) {
    throw new RoutineGenerationError(
      "La scheda generata non contiene nessun esercizio utilizzabile",
    );
  }

  return {
    name:
      text(root["name"], MAX_NAME_LEN) ??
      `Scheda ${preferences.goal} ${preferences.daysPerWeek} giorni`,
    notes: text(root["notes"], MAX_NOTES_LEN),
    generatedByAi: true,
    days,
  };
}

/**
 * Genera una scheda a partire dalle preferenze dell'utente.
 *
 * Il modello vede solo esercizi ammissibili e ciò che propone viene comunque
 * rivalidato localmente: un id inventato, o un esercizio vietato riesumato,
 * non entra nella scheda. Ciò che non passa viene scartato; se non resta
 * niente si solleva un errore invece di restituire una scheda vuota.
 *
 * A differenza di rankAlternatives qui non esiste un ripiego offline: una
 * scheda non si genera senza modello, e fingere di averla generata sarebbe
 * peggio dell'errore.
 */
export async function generateRoutine(
  preferences: RoutinePreferences,
): Promise<RoutineInput> {
  checkPreferences(preferences);

  const catalog = await eligibleExercises(preferences.availableEquipment);
  if (catalog.length === 0) {
    throw new RoutineGenerationError(
      "Nessun esercizio disponibile con l'attrezzatura indicata",
    );
  }

  const byId = new Map(catalog.map((row) => [row.id, row]));

  const response = await chat({
    capability: "routine_generation",
    model: MODELS.assistant,
    responseFormatJson: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          `Obiettivo: ${preferences.goal}`,
          `Livello: ${preferences.level}`,
          `Giorni a settimana: ${preferences.daysPerWeek}`,
          `Durata di una sessione: ${preferences.sessionMinutes} minuti`,
          "",
          "Catalogo ammesso (id | nome | gruppo muscolare):",
          ...catalog.map(compact),
        ].join("\n"),
      },
    ],
  });

  return parseRoutine(response.content, byId, preferences);
}
