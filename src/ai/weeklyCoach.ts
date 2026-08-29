import { chat } from "@/src/ai/client";
import { hasGroqKey, MODELS } from "@/src/ai/config";
import { getDb } from "@/src/db/index";
import { getDayDiary } from "@/src/db/queries/diary";
import { getTargetsFor } from "@/src/db/queries/settings";
import { listSteps, listWeights } from "@/src/db/queries/tracking";
import { addDays, todayIso } from "@/src/domain/date";
import { average } from "@/src/domain/stats";
import { logger } from "@/src/utils/logger";

/** La finestra del coach: una settimana, oggi incluso. */
export const WEEK_DAYS = 7;

/**
 * Sotto questa soglia il modello non viene interpellato. Su due giorni
 * registrati qualunque commento è una generalizzazione che però ha la forma di
 * un consiglio, ed è peggio del silenzio.
 */
export const MIN_LOGGED_DAYS = 3;

/** Una misura media della settimana confrontata col suo obiettivo. */
export interface WeeklyMetric {
  /**
   * Media dei soli giorni misurati. Null se la settimana non ne ha nessuno: un
   * giorno non registrato non è un giorno a zero.
   */
  average: number | null;
  /** Obiettivo in vigore. Null se non è mai stato impostato. */
  target: number | null;
  /** media - obiettivo, già col segno. Null se manca uno dei due termini. */
  deviation: number | null;
  /** Giorni con una misura, sui WEEK_DAYS della finestra. */
  days: number;
}

export interface WeeklyWeight {
  first: number | null;
  last: number | null;
  /**
   * ultima - prima pesata. Null con meno di due pesate: una misura sola non è
   * una variazione, e presentarla come tale inventerebbe una tendenza.
   */
  changeKg: number | null;
  /** Quante pesate ci sono nella settimana. */
  days: number;
}

export interface WeeklyStats {
  from: string;
  to: string;
  /** Giorni con almeno una voce di diario. */
  loggedDays: number;
  kcal: WeeklyMetric;
  protein: WeeklyMetric;
  carbs: WeeklyMetric;
  fat: WeeklyMetric;
  steps: WeeklyMetric;
  workoutDays: number;
  weight: WeeklyWeight;
}

export interface CoachComment {
  summary: string;
  observations: string[];
  /** Una cosa sola da provare. Null se il modello non ne ha proposta una usabile. */
  suggestion: string | null;
}

export type WeeklyReviewStatus =
  /** Il commento c'è. */
  | "commented"
  /** Meno di MIN_LOGGED_DAYS giorni registrati: il modello non è stato chiamato. */
  | "not_enough_data"
  /** Manca la chiave API: nessun tentativo di rete. */
  | "no_key"
  /** Rete, provider o risposta illeggibile: restano le statistiche. */
  | "unavailable";

export interface WeeklyReview {
  stats: WeeklyStats;
  status: WeeklyReviewStatus;
  /** Null in tutti gli esiti diversi da "commented". */
  comment: CoachComment | null;
}

const MAX_SUMMARY_LEN = 220;
const MAX_OBSERVATION_LEN = 180;
const MAX_SUGGESTION_LEN = 220;
const MAX_OBSERVATIONS = 4;

/**
 * Inglese di proposito: i modelli seguono le istruzioni in inglese meglio che
 * in italiano. Ciò che leggerà l'utente resta italiano.
 *
 * Il divieto di fare aritmetica è la regola più importante del prompt: le medie
 * e gli scostamenti sono già calcolati in locale, e un modello che li rifà
 * sbaglia in un modo che nessuno verifica, perché il numero sbagliato è dentro
 * una frase che suona giusta.
 */
const SYSTEM_PROMPT = `You are reviewing one week of a person's own food, steps, weight and
training log. Every number has ALREADY been computed for you from their data.

Rules:
- NEVER do arithmetic. Do not compute, re-derive, sum, average, convert or estimate any
  number. Quote the figures exactly as you receive them, or do not quote figures at all.
- A value reported as "non registrato" or "non impostato" is MISSING, not zero. Say it is
  missing; never treat it as a zero and never guess what it might have been.
- Sober and concrete. No fitness-guru tone, no hype, no motivational slogans, no
  exclamation marks, no emoji, no praise for its own sake. Speak to the person directly
  and informally ("tu").
- Weight over a single week moves for many reasons, water included. Never alarm the person
  about a weight change, never call the week good or bad because of it, and never project
  the change forward.
- No medical advice. No diagnosis, no supplements, no prescribed calorie or macro numbers.
  If something in the data looks clinical, say only that it is worth raising with a doctor
  or a dietitian, and say nothing more about it.
- "observations": 2 to 4 short sentences, one fact each, each one grounded in a figure you
  were given or in a gap in the data. "suggestion": exactly ONE concrete thing to try next
  week, small enough to actually do.
- Everything you write is in ITALIAN.

Reply with a single JSON object and nothing else:
{"summary":"<una frase in italiano>",
 "observations":["<frase>","<frase>"],
 "suggestion":"<una frase in italiano>"}`;

/**
 * Giorni distinti con almeno una serie registrata. Una sessione aperta e mai
 * riempita non è un allenamento: stesso criterio di collectStats, così i due
 * conteggi non si contraddicono.
 *
 * La query sta qui perché le query di workouts non espongono un conteggio per
 * intervallo, e qui serve solo un COUNT, non le sessioni.
 */
async function countWorkoutDays(from: string, to: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT w.date) AS n FROM workout_sessions w
     JOIN session_sets s ON s.workout_session_id = w.id AND s.deleted_at IS NULL
     WHERE w.deleted_at IS NULL AND w.date BETWEEN ? AND ?`,
    [from, to],
  );
  return row?.n ?? 0;
}

/** Un obiettivo a zero non è un obiettivo: non c'è niente da centrare. */
const goal = (value: number | null | undefined): number | null =>
  typeof value === "number" && value > 0 ? value : null;

function buildMetric(
  values: (number | null)[],
  target: number | null,
): WeeklyMetric {
  const mean = average(values);
  return {
    average: mean,
    target,
    deviation: mean !== null && target !== null ? mean - target : null,
    days: values.filter((value) => value !== null).length,
  };
}

/**
 * Le statistiche della settimana, calcolate interamente in locale.
 *
 * È il pezzo che resta valido anche senza chiave, senza rete e senza modello:
 * la card lo mostra sempre, e il commento AI è un sovrappiù che si appoggia a
 * questi numeri senza rifarli.
 */
export async function weeklyStats(
  today: string = todayIso(),
): Promise<WeeklyStats> {
  const from = addDays(today, -(WEEK_DAYS - 1));
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(from, i));

  const [stepRows, weightRows, targets, workoutDays] = await Promise.all([
    listSteps(from, today),
    listWeights(from, today),
    // L'obiettivo in vigore oggi vale per tutta la settimana: gli obiettivi
    // sono storicizzati, ma mediare obiettivi diversi darebbe uno scostamento
    // che non corrisponde a nessuna soglia mai vista dall'utente.
    getTargetsFor(today),
    countWorkoutDays(from, today),
  ]);

  const stepsByDate = new Map(stepRows.map((row) => [row.date, row.steps]));
  const stepsByDay = days.map((day) => stepsByDate.get(day) ?? null);

  // Le calorie e i macro non hanno una tabella per giorno: si aggregano dal
  // diario, un giorno alla volta.
  const kcalByDay: (number | null)[] = [];
  const proteinByDay: (number | null)[] = [];
  const carbsByDay: (number | null)[] = [];
  const fatByDay: (number | null)[] = [];
  let loggedDays = 0;

  for (const day of days) {
    const diary = await getDayDiary(day);
    if (diary.meals.length === 0) {
      kcalByDay.push(null);
      proteinByDay.push(null);
      carbsByDay.push(null);
      fatByDay.push(null);
      continue;
    }
    loggedDays += 1;
    kcalByDay.push(diary.totals.kcal);
    proteinByDay.push(diary.totals.protein);
    carbsByDay.push(diary.totals.carbs);
    fatByDay.push(diary.totals.fat);
  }

  const weights = weightRows.map((row) => row.weight_kg);
  const first = weights.length > 0 ? weights[0] : null;
  const last = weights.length > 0 ? weights[weights.length - 1] : null;

  return {
    from,
    to: today,
    loggedDays,
    kcal: buildMetric(kcalByDay, goal(targets?.kcal)),
    protein: buildMetric(proteinByDay, goal(targets?.protein_g)),
    carbs: buildMetric(carbsByDay, goal(targets?.carbs_g)),
    fat: buildMetric(fatByDay, goal(targets?.fat_g)),
    steps: buildMetric(stepsByDay, goal(targets?.steps)),
    workoutDays,
    weight: {
      first,
      last,
      changeKg:
        weights.length >= 2 && first !== null && last !== null
          ? last - first
          : null,
      days: weights.length,
    },
  };
}

/**
 * I numeri arrivano al modello già scritti all'italiana, virgola compresa, e
 * senza separatore delle migliaia: il modello li ricopia carattere per
 * carattere dentro una frase italiana, quindi devono essere già nella forma
 * finale. "1.600" verrebbe ricopiato tale e quale e letto come 1,6.
 */
const decimal = (value: number, decimals: number): string =>
  value.toFixed(decimals).replace(".", ",");

const plain = (value: number, decimals = 0): string =>
  decimals === 0 ? String(Math.round(value)) : decimal(value, decimals);

/**
 * Lo scostamento porta sempre il segno: "150" da solo non dice da che parte.
 * Il segno guarda il numero ARROTONDATO: -0,04 stampato a un decimale è zero,
 * e "-0,0" farebbe descrivere al modello un calo che non esiste.
 */
function signed(value: number, decimals = 0): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  const rendered = plain(Math.abs(rounded), decimals);
  return rounded < 0 ? `-${rendered}` : `+${rendered}`;
}

const MISSING = "non registrato";

function metricLine(
  label: string,
  metric: WeeklyMetric,
  unit: string,
  decimals = 0,
): string {
  if (metric.average === null) return `${label}: ${MISSING}`;

  const parts = [`${label}: ${plain(metric.average, decimals)} ${unit}`.trim()];
  parts.push(
    metric.target === null
      ? "obiettivo non impostato"
      : `obiettivo ${plain(metric.target, decimals)} ${unit}`.trim(),
  );
  if (metric.deviation !== null) {
    parts.push(`scostamento ${signed(metric.deviation, decimals)} ${unit}`.trim());
  }
  parts.push(`misurato in ${metric.days} giorni su ${WEEK_DAYS}`);
  return parts.join(" | ");
}

function weightLine(weight: WeeklyWeight): string {
  if (weight.last === null || weight.first === null) {
    return `Peso: ${MISSING}`;
  }
  const range = `Peso: da ${decimal(weight.first, 1)} kg a ${decimal(weight.last, 1)} kg`;
  const change =
    weight.changeKg === null
      ? "una sola pesata, nessuna variazione calcolabile"
      : `variazione ${signed(weight.changeKg, 1)} kg`;
  return `${range} | ${change} | ${weight.days} pesate`;
}

/**
 * Il messaggio utente: SOLO numeri già calcolati, in italiano, uno per riga.
 * Al modello non arriva nessun dato grezzo da cui potrebbe essere tentato di
 * ricavarne altri.
 */
export function buildPrompt(stats: WeeklyStats): string {
  return [
    `Periodo: dal ${stats.from} al ${stats.to} (${WEEK_DAYS} giorni)`,
    `Giorni con diario compilato: ${stats.loggedDays} su ${WEEK_DAYS}`,
    metricLine("Calorie medie al giorno", stats.kcal, "kcal"),
    metricLine("Proteine medie al giorno", stats.protein, "g"),
    metricLine("Carboidrati medi al giorno", stats.carbs, "g"),
    metricLine("Grassi medi al giorno", stats.fat, "g"),
    metricLine("Passi medi al giorno", stats.steps, ""),
    `Giorni di allenamento: ${stats.workoutDays} su ${WEEK_DAYS}`,
    weightLine(stats.weight),
  ].join("\n");
}

function clamp(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.length > maxLen
    ? `${trimmed.slice(0, maxLen - 1).trimEnd()}…`
    : trimmed;
}

/**
 * Il commento, o null se non c'è niente di leggibile.
 *
 * Un commento senza sintesi non è un commento: piuttosto che mostrare mezzo
 * risultato si degrada alle sole statistiche, che sono comunque complete.
 */
function parseComment(content: string | null): CoachComment | null {
  if (!content) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logger.warn("[weeklyCoach] risposta scartata: non è JSON valido");
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    logger.warn("[weeklyCoach] risposta scartata: formato inatteso");
    return null;
  }

  const root = parsed as Record<string, unknown>;
  const summary = clamp(root["summary"], MAX_SUMMARY_LEN);
  if (summary === null) {
    logger.warn("[weeklyCoach] risposta scartata: manca la sintesi");
    return null;
  }

  const rawObservations = root["observations"];
  const observations: string[] = [];
  if (Array.isArray(rawObservations)) {
    for (const item of rawObservations) {
      if (observations.length >= MAX_OBSERVATIONS) break;
      const line = clamp(item, MAX_OBSERVATION_LEN);
      if (line !== null) observations.push(line);
    }
  }

  return {
    summary,
    observations,
    suggestion: clamp(root["suggestion"], MAX_SUGGESTION_LEN),
  };
}

/**
 * La settimana commentata: statistiche locali più, quando è possibile, una
 * lettura del modello.
 *
 * L'esito è sempre completo di statistiche, anche quando il commento non
 * arriva: senza chiave, offline o con una risposta illeggibile la card resta
 * utile invece di diventare una schermata d'errore. Lo `status` dice perché il
 * commento manca, così chi chiama può spiegarlo invece di lasciare un vuoto.
 *
 * `stats` si può passare già calcolato: serve alla card, che le statistiche le
 * ha già a schermo e vuole che il commento parli esattamente di quei numeri e
 * non di una lettura del database fatta un istante dopo.
 */
export async function weeklyReview(options?: {
  stats?: WeeklyStats;
  today?: string;
}): Promise<WeeklyReview> {
  const stats = options?.stats ?? (await weeklyStats(options?.today));

  // Prima della chiave: con pochi giorni non si chiama il modello nemmeno
  // quando tutto è configurato.
  if (stats.loggedDays < MIN_LOGGED_DAYS) {
    return { stats, status: "not_enough_data", comment: null };
  }
  if (!hasGroqKey()) return { stats, status: "no_key", comment: null };

  try {
    const response = await chat({
      capability: "assistant",
      model: MODELS.assistant,
      responseFormatJson: true,
      // Più alta della norma: rigenerare deve poter dare una lettura diversa
      // degli stessi numeri, altrimenti il pulsante di rigenerazione ripete
      // parola per parola quello che c'è già.
      temperature: 0.5,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(stats) },
      ],
    });

    const comment = parseComment(response.content);
    if (!comment) return { stats, status: "unavailable", comment: null };
    return { stats, status: "commented", comment };
  } catch (error) {
    logger.warn("[weeklyCoach] commento non disponibile", error);
    return { stats, status: "unavailable", comment: null };
  }
}
