import { chat } from "@/src/ai/client";
import { hasAiKey, MODELS } from "@/src/ai/config";
import { AiResponseError } from "@/src/ai/errors";
import { getExercise, suggestAlternatives } from "@/src/db/queries/exercises";
import { exerciseEquipment, type ExerciseRow } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";

export interface RankedAlternative {
  exercise: ExerciseRow;
  /**
   * Una riga in italiano sul perché questo esercizio sostituisce bene l'altro.
   * `null` quando l'ordine è quello locale: senza AI non si inventa una
   * motivazione, si dice che non c'è.
   */
  reason: string | null;
}

const DEFAULT_LIMIT = 8;

/** Una riga sotto un esercizio in lista, non un paragrafo. */
const MAX_REASON_LEN = 160;

/**
 * Inglese di proposito: i modelli seguono le istruzioni in inglese meglio che
 * in italiano. Il contenuto che leggerà l'utente resta italiano.
 *
 * Il modello riceve un insieme CHIUSO di candidati e può solo riordinarlo: il
 * filtro su gruppo muscolare, attrezzatura posseduta ed esercizi vietati è già
 * stato fatto localmente da suggestAlternatives.
 */
const SYSTEM_PROMPT = `You are a strength coach. The athlete cannot perform one exercise
and needs a substitute. You are given the exercise to replace and a CLOSED list of allowed
replacements, already filtered for the equipment the athlete owns.

Rules:
- Rank ALL the allowed replacements, from the best substitute to the worst.
- Use ONLY the ids from the allowed list, copied exactly. Never invent an id and never add
  an exercise that is not in the list: anything else is discarded.
- Rank by how closely the exercise reproduces the same movement pattern and trains the same
  muscles, then by how easy it is to load progressively.
- An entry marked "sgradito" is one the athlete dislikes: rank it last unless it is clearly
  the only good technical match.
- For each entry write "reason": ONE short sentence in ITALIAN (max 120 characters) saying
  why it works as a substitute. No lists, no preamble.

Reply with a single JSON object and nothing else:
{"ranking":[{"id":"<id>","reason":"<una riga in italiano>"}]}`;

/** Riga compatta per il prompt: tutto il resto della ExerciseRow è rumore. */
function compact(row: ExerciseRow): string {
  const gear = exerciseEquipment(row);
  const parts = [
    row.id,
    row.name,
    row.muscle_group,
    gear.length > 0 ? gear.join(", ") : "corpo libero",
  ];
  if (row.dislike_level > 0) parts.push("sgradito");
  return parts.join(" | ");
}

const localOrder = (rows: ExerciseRow[]): RankedAlternative[] =>
  rows.map((exercise) => ({ exercise, reason: null }));

function cleanReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > MAX_REASON_LEN
    ? `${trimmed.slice(0, MAX_REASON_LEN - 1).trimEnd()}…`
    : trimmed;
}

interface RawRank {
  id: string;
  reason: string | null;
}

function parseRanking(content: string | null): RawRank[] {
  if (!content) throw new AiResponseError("Ordinamento alternative vuoto");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiResponseError("Ordinamento alternative non è JSON valido");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AiResponseError("Ordinamento alternative in formato inatteso");
  }

  const ranking = (parsed as Record<string, unknown>)["ranking"];
  if (!Array.isArray(ranking)) {
    throw new AiResponseError("Ordinamento alternative senza campo ranking");
  }

  const entries: RawRank[] = [];
  for (const entry of ranking) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, reason } = entry as { id?: unknown; reason?: unknown };
    if (typeof id !== "string" || id.trim() === "") continue;
    entries.push({ id: id.trim(), reason: cleanReason(reason) });
  }
  return entries;
}

/**
 * Applica l'ordine del modello ai candidati locali.
 *
 * L'insieme restituito è ESATTAMENTE quello locale: gli id che il modello si è
 * inventato vengono scartati, e i candidati che ha ignorato tornano in coda
 * nell'ordine locale invece di sparire. L'AI riordina, non decide chi esiste.
 */
function mergeRanking(
  candidates: ExerciseRow[],
  ranking: RawRank[],
): RankedAlternative[] {
  const byId = new Map(candidates.map((row) => [row.id, row]));
  const used = new Set<string>();
  const ordered: RankedAlternative[] = [];

  for (const entry of ranking) {
    const exercise = byId.get(entry.id);
    if (!exercise) {
      logger.warn(
        `[rankAlternatives] id "${entry.id}" scartato: non è fra i candidati locali`,
      );
      continue;
    }
    if (used.has(entry.id)) continue;
    used.add(entry.id);
    ordered.push({ exercise, reason: entry.reason });
  }

  for (const exercise of candidates) {
    if (!used.has(exercise.id)) ordered.push({ exercise, reason: null });
  }
  return ordered;
}

/**
 * Alternative a un esercizio, ordinate e spiegate.
 *
 * Il filtro è LOCALE e viene prima: suggestAlternatives decide quali esercizi
 * sono proponibili (stesso gruppo muscolare, attrezzatura posseduta, mai i
 * vietati, gli sgraditi in fondo). L'AI serve solo a ordinare quei candidati e
 * a dire in una riga perché.
 *
 * Se l'AI non è disponibile - manca la chiave, non c'è campo, il provider
 * sbaglia - la funzione restituisce comunque i candidati locali nel loro
 * ordine, senza spiegazione. In palestra il telefono spesso non prende: una
 * lista senza motivazioni è utile, un errore no.
 */
export async function rankAlternatives(args: {
  exerciseId: string;
  onlyAvailableEquipment?: boolean;
  limit?: number;
}): Promise<RankedAlternative[]> {
  const source = await getExercise(args.exerciseId);
  if (!source) return [];

  const candidates = await suggestAlternatives(args.exerciseId, {
    onlyAvailableEquipment: args.onlyAvailableEquipment ?? true,
    limit: args.limit ?? DEFAULT_LIMIT,
  });
  if (candidates.length === 0) return [];

  // Senza chiave non si tenta nemmeno la rete: l'ordine locale è già la risposta.
  if (!hasAiKey()) return localOrder(candidates);

  try {
    const response = await chat({
      capability: "exercise_alternatives",
      model: MODELS.assistant,
      responseFormatJson: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            `Esercizio da sostituire: ${compact(source)}`,
            "",
            "Sostituti ammessi (id | nome | gruppo | attrezzatura):",
            ...candidates.map(compact),
          ].join("\n"),
        },
      ],
    });
    return mergeRanking(candidates, parseRanking(response.content));
  } catch (error) {
    logger.warn(
      "[rankAlternatives] ordinamento AI non disponibile, uso l'ordine locale",
      error,
    );
    return localOrder(candidates);
  }
}
