import { chat, type ChatMessage, type ToolCall } from "@/src/ai/client";
import { MODELS } from "@/src/ai/config";
import {
  createTools,
  toolDefinitions,
  type ToolContext,
} from "@/src/ai/tools/registry";
import type { ToolIntent, ToolPreview } from "@/src/ai/tools/types";
import { todayIso } from "@/src/domain/date";
import { logger } from "@/src/utils/logger";

/**
 * Oltre questo numero di giri il loop si chiude comunque: un modello che
 * continua a chiamare tool non deve poter girare all'infinito addosso a una
 * chiave a consumo.
 */
export const MAX_TOOL_ROUNDS = 4;

export interface AssistantNamedItem {
  id: string;
  name: string;
}

/**
 * Voce del diario del giorno di riferimento.
 *
 * È l'unica fonte legittima di un entryId per delete_entry: senza questo elenco
 * nel prompt il modello può solo inventarselo, che è esattamente ciò che la
 * description del tool vieta.
 */
export interface AssistantDiaryEntry {
  id: string;
  name: string;
  kcal: number;
}

export interface AssistantMacros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  steps: number;
}

/**
 * Contesto compatto passato al modello: non il database, solo quanto basta a
 * riconoscere le cose dell'utente. È questo che fa agganciare "sto facendo la
 * mia iper pizza proteica" alla ricetta esistente invece di ricostruirla
 * ingrediente per ingrediente.
 */
export interface AssistantContext {
  now?: Date;
  /** Nome leggibile della schermata aperta, es. "Oggi". */
  screen?: string;
  /** Giorno di riferimento (YYYY-MM-DD): quello che l'utente sta guardando. */
  date?: string;
  targets?: AssistantMacros | null;
  consumed?: AssistantMacros | null;
  mealTypes?: AssistantNamedItem[];
  recipes?: AssistantNamedItem[];
  foods?: AssistantNamedItem[];
  exercises?: AssistantNamedItem[];
  routines?: AssistantNamedItem[];
  /** Voci in diario del giorno di riferimento, con il loro id. */
  entries?: AssistantDiaryEntry[];
}

export interface AssistantResult {
  /** Risposta da mostrare e far pronunciare, in italiano. */
  reply: string;
  intents: ToolIntent[];
}

const FALLBACK_REPLY = "Non sono riuscito a completare la richiesta.";

const WEEKDAYS = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
];

const pad = (value: number): string => String(value).padStart(2, "0");

const clockHour = (now: Date): string => pad(now.getHours());

/**
 * Giorno della settimana della data che si sta STAMPANDO.
 *
 * Prenderlo da `now` mentre si stampa un'altra data produce coppie che non
 * esistono ("2026-08-24 (venerdì)") e manda fuori bersaglio ogni riferimento
 * relativo che il modello risolve contro quella riga.
 */
function weekdayOf(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? "?" : WEEKDAYS[date.getDay()];
}

const namedList = (items: AssistantNamedItem[]): string =>
  items.map((item) => `${item.id} = ${item.name}`).join("; ");

const entryList = (entries: AssistantDiaryEntry[]): string =>
  entries
    .map(
      (entry) => `${entry.id} = ${entry.name} (${Math.round(entry.kcal)} kcal)`,
    )
    .join("; ");

const macroLine = (macros: AssistantMacros): string =>
  `${Math.round(macros.kcal)} kcal, ${Math.round(macros.proteinG)} g protein, ` +
  `${Math.round(macros.carbsG)} g carbs, ${Math.round(macros.fatG)} g fat, ` +
  `${Math.round(macros.steps)} steps`;

const remaining = (
  targets: AssistantMacros,
  consumed: AssistantMacros,
): AssistantMacros => ({
  kcal: targets.kcal - consumed.kcal,
  proteinG: targets.proteinG - consumed.proteinG,
  carbsG: targets.carbsG - consumed.carbsG,
  fatG: targets.fatG - consumed.fatG,
  steps: targets.steps - consumed.steps,
});

// ─── Normalizzazione delle quantità italiane ─────────────────────────────────

/**
 * Numeri a parole ammessi davanti a un'unità di peso.
 *
 * Volutamente corto: "un paio", "qualche", "due o tre" sono ambigui e restano
 * al modello, che può chiedere. Indovinare è peggio che non convertire.
 */
const WORD_NUMBERS: Record<string, number> = {
  mezzo: 0.5,
  mezza: 0.5,
  un: 1,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
};

/** Grammi per unità: qui sta la conversione che il modello sbaglia (etto -> 1). */
const UNIT_GRAMS: Record<string, number> = {
  etto: 100,
  etti: 100,
  ettogrammo: 100,
  ettogrammi: 100,
  chilo: 1000,
  chili: 1000,
  chilogrammo: 1000,
  chilogrammi: 1000,
  kg: 1000,
  grammo: 1,
  grammi: 1,
  gr: 1,
  g: 1,
};

const QUANTITY_RE = new RegExp(
  String.raw`\b(\d+(?:[.,]\d+)?|${Object.keys(WORD_NUMBERS).join("|")})\s+(${Object.keys(UNIT_GRAMS).join("|")})\b(\s+e\s+mezzo)?`,
  "gi",
);

const formatGrams = (grams: number): string =>
  String(Math.round(grams * 10) / 10);

/**
 * Parole che, poco prima di una quantita', dicono che si sta parlando del
 * proprio peso e non di cibo. La finestra e' corta di proposito: "peso" a
 * inizio frase e i grammi a fine frase sono due cose diverse.
 */
const BODY_WEIGHT_WORDS =
  /\b(peso|pesavo|pesato|pesata|pesa|bilancia|segno|segnava)\b/i;
const BODY_WEIGHT_WINDOW = 30;

const isBodyWeight = (text: string, offset: number): boolean =>
  BODY_WEIGHT_WORDS.test(
    text.slice(Math.max(0, offset - BODY_WEIGHT_WINDOW), offset),
  );

/**
 * Converte in grammi le quantità italiane del trascritto ("due etti e mezzo"
 * -> "250 g") prima che il modello le legga.
 *
 * La regola sugli etti esisteva solo come testo di prompt: un modello che la
 * ignora passa quantityG 2 per "due etti" e il diario registra un centesimo
 * delle calorie, in modo perfettamente plausibile. Qui è deterministica.
 * Ciò che non è riconosciuto NON si tocca: meglio una domanda dell'assistente
 * che una conversione inventata.
 */
export function normalizeQuantities(text: string): string {
  return text.replace(
    QUANTITY_RE,
    (
      match: string,
      amount: string,
      unit: string,
      half: string | undefined,
      offset: number,
      whole: string,
    ) => {
      // "peso 80 kg" non e' una quantita' di cibo: convertirlo in "80000 g"
      // faceva arrivare al modello un peso corporeo in grammi, e da li' o una
      // pesata assurda o una voce di diario da ottanta chili di qualcosa.
      if (isBodyWeight(whole, offset)) return match;

      const base =
        WORD_NUMBERS[amount.toLowerCase()] ?? Number(amount.replace(",", "."));
      if (!Number.isFinite(base)) return match;
      const grams = UNIT_GRAMS[unit.toLowerCase()] * (base + (half ? 0.5 : 0));
      if (!Number.isFinite(grams) || grams <= 0) return match;
      return `${formatGrams(grams)} g`;
    },
  );
}

/**
 * Prompt di sistema in inglese: i modelli seguono le istruzioni meglio in
 * inglese e rispondono comunque nella lingua dell'utente. È una convenzione
 * interna, l'utente vede solo italiano.
 *
 * **Non prende argomenti, e non è una svista.** Gemini cachea automaticamente il
 * prefisso del prompt su `gpt-oss-120b`: i token in cache costano metà e non
 * contano nel rate limit, ma vale solo il testo identico fino al primo
 * carattere che cambia. Con il contesto qui dentro - l'orologio ai minuti, 40
 * alimenti, il diario che cambia dopo ogni scrittura - il prefisso saltava a
 * ogni turno, portandosi via anche le RULES e le definizioni dei tool, che
 * nel prompt reso vengono dopo. Il contesto sta in `buildContextMessage`, in
 * un messaggio a parte: quel che precede resta uguale e si cachea.
 */
export function buildSystemPrompt(): string {
  return [
    "You are the intelligent assistant of KalTrack, a personal tracker for food, weight, steps and gym training.",
    "ALWAYS reply in Italian, in one or two short spoken sentences. No markdown, no bullet lists.",
    "Use the tools to act. Never invent nutritional values: foods and recipes are resolved by the app, not by you.",
    "",
    "The next message is the CURRENT CONTEXT: today's date, the day the user is looking at, the targets and the ids of the user's own meal types, recipes, foods, exercises, routines and diary entries.",
    "",
    "RULES",
    '- Quantities are ALWAYS in grams. The transcript already has the common Italian units converted (1 etto = 100 g, "mezzo chilo" = 500 g): use the grams you read, and if a quantity is still vague ask instead of guessing. Never pass 1 for "un etto".',
    "- Never send calories or macros to `add_meal_entries`: there is no field for them. Send what the user ate and how much, the app resolves the values on the user's own data. Only `create_custom_food` accepts nutritional values (per 100g) when explicitly creating a food item.",
    '- Dates are ALWAYS YYYY-MM-DD. Resolve "oggi", "ieri", "l\'altro ieri" and weekday names against `Now`. If the user names no day at all, omit the date: the tools use the reference day.',
    "- Prefer the ids listed in the CURRENT CONTEXT over free text: a name close to one of the user's recipes, foods, exercises or routines IS that item.",
    '- To delete something use only the ids listed under "Diary entries". If what the user wants to delete is not in that list, say so instead of guessing an id.',
    "- English words mixed into Italian speech (whey, overnight oats, lat machine, bench press, deadlift, squat, push, pull, legs) are normal: never correct them, just use them.",
    "- If an essential detail is missing, ask one short question in Italian instead of guessing.",
    "- Write and delete actions are only prepared, not applied: after calling such a tool, tell the user in Italian what is about to happen, as if it were done.",
  ].join("\n");
}

/**
 * La parte volatile del prompt, nel messaggio che segue quello di sistema.
 *
 * L'ora è senza minuti: `Now` serve a risolvere "oggi", "ieri" e i giorni
 * della settimana, e l'ora basta a capire se è ora di cena. Ai minuti era solo
 * la garanzia che due frasi dette di seguito non condividessero il prefisso.
 */
export function buildContextMessage(context: AssistantContext): string {
  const now = context.now ?? new Date();
  const today = todayIso(now);
  const date = context.date ?? today;
  const lines: string[] = [
    "CURRENT CONTEXT",
    // Due righe distinte: "adesso" è il device, il giorno di riferimento è
    // quello che l'utente sta sfogliando e può essere un altro.
    `Now: ${today} ${clockHour(now)} (${weekdayOf(today)})`,
    `Reference day (what the user is looking at): ${date} (${weekdayOf(date)})`,
  ];

  if (context.screen) lines.push(`Current screen: ${context.screen}`);
  if (context.targets)
    lines.push(`Targets today: ${macroLine(context.targets)}`);
  if (context.consumed)
    lines.push(`Done so far today: ${macroLine(context.consumed)}`);
  if (context.targets && context.consumed) {
    lines.push(
      `Remaining today: ${macroLine(remaining(context.targets, context.consumed))}`,
    );
  }
  if (context.mealTypes?.length) {
    lines.push(`Meal types: ${namedList(context.mealTypes)}`);
  }
  if (context.recipes?.length) {
    lines.push(`User recipes: ${namedList(context.recipes)}`);
  }
  if (context.foods?.length) {
    lines.push(`Most used foods: ${namedList(context.foods)}`);
  }
  if (context.exercises?.length) {
    lines.push(`Known exercises: ${namedList(context.exercises)}`);
  }
  if (context.routines?.length) {
    lines.push(`Gym routines: ${namedList(context.routines)}`);
  }
  if (context.entries?.length) {
    lines.push(
      `Diary entries of the reference day: ${entryList(context.entries)}`,
    );
  }

  return lines.join("\n");
}

/** Anteprima di ripiego quando la vera anteprima non si può calcolare. */
const failedPreview = (toolName: string, error: unknown): ToolPreview => ({
  title: toolName,
  lines: [error instanceof Error ? error.message : "Argomenti non validi"],
});

type ParsedArguments =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/**
 * `arguments` vuoto è una chiamata senza argomenti, non un errore: le API
 * OpenAI-compatibili mandano "" al posto di "{}", e trattarlo come JSON rotto
 * faceva fallire sulla forma i tool con soli parametri opzionali invece di
 * applicare i default documentati nello schema.
 */
function parseArguments(raw: string): ParsedArguments {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch (error) {
    logger.warn("[assistant] argomenti del tool non sono JSON valido", error);
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "JSON non valido",
    };
  }
}

/**
 * Il client scarta già i tool call malformati, ma questo loop è l'unico punto
 * che li dereferenzia e ogni call inserita nella conversazione DEVE ricevere
 * una risposta con il suo id: una call senza id resterebbe senza risposta e il
 * provider respingerebbe il giro successivo con un 400.
 */
const isUsableCall = (call: ToolCall): boolean =>
  typeof call.id === "string" &&
  call.id !== "" &&
  typeof call.function === "object" &&
  call.function !== null &&
  typeof call.function.name === "string" &&
  call.function.name !== "" &&
  typeof call.function.arguments === "string";

/** Chiave di deduplica di un intento: stesso tool, stessi argomenti. */
/**
 * Chiave di un intento, per riconoscere la stessa scrittura richiesta due
 * volte nello stesso giro.
 *
 * Le chiavi degli oggetti vanno ORDINATE: `JSON.stringify` conserva l'ordine
 * di inserimento, e lo stesso identico intento riscritto dal modello con i
 * campi in un altro ordine produceva una chiave diversa e passava il
 * controllo, scrivendo la voce di diario due volte.
 */
const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    // Un campo assente e uno esplicitamente `undefined` sono la stessa cosa.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`);
  return `{${entries.join(",")}}`;
};

/** Esportata per i test: e' la regola che impedisce la doppia scrittura. */
export const intentKeyForTesting = (toolName: string, args: unknown): string =>
  intentKey(toolName, args);

const intentKey = (toolName: string, args: unknown): string =>
  `${toolName}:${stableJson(args)}`;

/**
 * Risposta quando il modello non ne ha prodotta una.
 *
 * Con intenti pronti non si dice che è andata male: sullo schermo compare la
 * card di conferma, e i due canali si contraddirebbero.
 */
function replyFor(lastContent: string, intents: ToolIntent[]): string {
  if (lastContent) return lastContent;
  const pending = intents.filter((intent) => !intent.executed);
  if (pending.length === 0) return FALLBACK_REPLY;
  return `Ho preparato: ${pending.map((intent) => intent.preview.title).join("; ")}. Confermi?`;
}

/**
 * Un giro di comprensione e function calling.
 *
 * I tool `read` girano subito e il loro risultato torna al modello, che può
 * usarlo per rispondere. Le scritture e le cancellazioni no: tornano come
 * intenti con la loro anteprima, e le esegue la UI dopo la conferma. Il modello
 * viene informato che l'azione è preparata, così non la richiama in loop.
 */
export async function runAssistant(args: {
  transcript: string;
  context: AssistantContext;
  onToolIntent?: (intent: ToolIntent) => void | Promise<void>;
}): Promise<AssistantResult> {
  const now = args.context.now ?? new Date();
  const toolContext: ToolContext = {
    referenceDate: args.context.date ?? todayIso(now),
    // Nuova per ogni interazione: anteprima ed esecuzione della STESSA frase
    // devono concordare, ma due frasi diverse devono ripassare dalla cascata.
    resolutionCache: new Map(),
  };
  const tools = createTools(toolContext);
  const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
  const definitions = toolDefinitions(tools);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildContextMessage(args.context) },
    { role: "user", content: normalizeQuantities(args.transcript) },
  ];
  const intents: ToolIntent[] = [];
  const prepared = new Set<string>();
  let lastContent = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await chat({
      capability: "assistant",
      model: MODELS.assistant,
      messages,
      tools: definitions,
    });

    if (response.content) lastContent = response.content;
    const calls = response.toolCalls.filter((call) => {
      if (isUsableCall(call)) return true;
      logger.warn("[assistant] tool call scartata: forma non valida");
      return false;
    });
    if (calls.length === 0) {
      return { reply: replyFor(lastContent, intents), intents };
    }

    messages.push({
      role: "assistant",
      content: response.content ?? "",
      tool_calls: calls,
    });

    for (const call of calls) {
      const tool = toolByName.get(call.function.name);
      if (!tool) {
        logger.warn(`[assistant] tool sconosciuto: ${call.function.name}`);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `ERROR: unknown tool "${call.function.name}".`,
        });
        continue;
      }

      const parsed = parseArguments(call.function.arguments);
      if (!parsed.ok) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content:
            `ERROR: the arguments are not valid JSON (${parsed.reason}). ` +
            "Send them again as a single JSON object.",
        });
        continue;
      }
      const toolArgs = parsed.value;

      const key = intentKey(tool.name, toolArgs);
      if (tool.riskLevel !== "read" && prepared.has(key)) {
        // Il freno testuale ("Do not call this tool again") dipende
        // dall'obbedienza del modello: senza questo, la UI eseguirebbe la
        // stessa voce di diario una volta per giro.
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content:
            "ALREADY PREPARED: this exact action is already waiting for the " +
            "user's confirmation. Answer the user instead of calling it again.",
        });
        continue;
      }

      let preview: ToolPreview;
      try {
        preview = await tool.preview(toolArgs);
      } catch (error) {
        logger.warn(`[assistant] anteprima fallita per ${tool.name}`, error);
        preview = failedPreview(tool.name, error);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `ERROR: ${preview.lines.join(" ")} Fix the arguments or ask the user.`,
        });
        continue;
      }

      const intent: ToolIntent = {
        toolName: tool.name,
        riskLevel: tool.riskLevel,
        args: toolArgs,
        preview,
        executed: false,
        result: null,
        execute: () => tool.execute(toolArgs),
      };

      if (tool.riskLevel === "read") {
        try {
          intent.result = await tool.execute(toolArgs);
          intent.executed = true;
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: intent.result.message,
          });
        } catch (error) {
          logger.warn(`[assistant] esecuzione fallita per ${tool.name}`, error);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: `ERROR: ${error instanceof Error ? error.message : "tool failed"}`,
          });
          continue;
        }
      } else {
        prepared.add(key);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content:
            `PREPARED, waiting for the user's confirmation: ${preview.title}. ` +
            `${preview.lines.join(" ")} Do not call this tool again: ` +
            "confirm to the user in Italian what is about to happen.",
        });
      }

      intents.push(intent);
      await args.onToolIntent?.(intent);
    }
  }

  logger.warn(`[assistant] limite di ${MAX_TOOL_ROUNDS} giri raggiunto`);
  return { reply: replyFor(lastContent, intents), intents };
}
