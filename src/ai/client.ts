import * as FileSystem from "expo-file-system/legacy";
import { getNetworkStateAsync } from "expo-network";

import {
  AI_TIMEOUT_MS,
  aiKey,
  GEMINI_BASE_URL,
  GEMINI_NATIVE_BASE_URL,
  hasAiKey,
  type AiCapability,
} from "@/src/ai/config";
import {
  AiRequestError,
  AiResponseError,
  MissingApiKeyError,
  OfflineError,
  RateLimitError,
} from "@/src/ai/errors";
import { newId, nowIso } from "@/src/db/ids";
import { getDb } from "@/src/db/index";
import { logger } from "@/src/utils/logger";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  extra_content?: unknown;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
  usage: { promptTokens: number; completionTokens: number } | null;
}

/**
 * Registra ogni chiamata AI. Non fa fallire nulla se il log fallisce: perdere
 * una riga di diagnostica non deve rompere la funzione che l'utente ha chiesto.
 */
async function logCall(entry: {
  capability: AiCapability;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  success: boolean;
  error?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO ai_calls (id, capability, model, tokens_in, tokens_out,
         latency_ms, success, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        entry.capability,
        entry.model,
        entry.tokensIn,
        entry.tokensOut,
        entry.latencyMs,
        entry.success ? 1 : 0,
        entry.error ?? null,
        now,
        now,
      ],
    );
  } catch (error) {
    logger.error("[ai] log della chiamata fallito", error);
  }
}

/** Millisecondi trascorsi, senza Date.now() nei punti in cui non è disponibile. */
const elapsed = (from: number): number => Math.max(0, Date.now() - from);

const isAbort = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/**
 * Ottimista come useOnlineStatus: si dichiara offline solo se il nativo lo
 * afferma. Se la lettura non è disponibile si preferisce non mentire e lasciar
 * passare l'errore originale.
 */
async function isOffline(): Promise<boolean> {
  try {
    const state = await getNetworkStateAsync();
    return state.isConnected === false || state.isInternetReachable === false;
  } catch (error) {
    logger.warn("[ai] stato di rete non leggibile", error);
    return false;
  }
}

/**
 * fetch fallisce nello stesso identico modo per "sei offline" e per "il
 * provider non risponde", e l'abort del timeout arriva come AbortError
 * anonimo: senza tradurli la UI vocale non può dire tre cose diverse per tre
 * guasti diversi. La traduzione sta qui attorno alla sola fetch e NON attorno
 * al corpo delle funzioni: avvolgere anche quello riscriverebbe gli
 * AiRequestError/AiResponseError che il client genera leggendo la risposta.
 */
async function withTimeout(
  input: RequestInfo,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbort(error)) {
      throw new AiRequestError(`Nessuna risposta entro ${AI_TIMEOUT_MS} ms`);
    }
    if (await isOffline()) throw new OfflineError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * L'errore giusto per una risposta non ok.
 *
 * Il 429 esce come RateLimitError e tutto il resto come AiRequestError: la
 * quota finita è l'unico guasto del provider su cui chi usa l'app può fare
 * qualcosa, e va detto invece di finire nel messaggio generico.
 */
async function failureFor(
  response: Response,
  prefix: string,
): Promise<AiRequestError | RateLimitError> {
  const body = await response.text();
  if (response.status === 429) {
    const header = response.headers?.get("retry-after");
    const seconds =
      header === null || header === undefined ? NaN : Number(header);
    return new RateLimitError(
      Number.isFinite(seconds) ? Math.ceil(seconds) : null,
    );
  }
  return new AiRequestError(
    `${prefix} ${response.status}: ${body.slice(0, 200)}`,
    response.status,
  );
}

/**
 * I tool call arrivano da JSON non tipizzato, e il loop dell'assistente li
 * dereferenzia subito (`call.function.name`, `call.id`). Un elemento senza
 * `function` ucciderebbe l'intero turno con un TypeError, e uno senza `id`
 * farebbe partire il giro successivo con `tool_call_id: undefined`, respinto
 * dal provider con un 400 attribuito alla chiamata sbagliata. Qui si scartano:
 * a valle esiste già un percorso di degrado pulito per "nessun tool".
 * Non sostituire con un cast `as ToolCall[]`: è esattamente il difetto tolto.
 */
function parseToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: ToolCall[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const {
      id,
      type,
      function: fn,
      extra_content,
    } = item as {
      id?: unknown;
      type?: unknown;
      function?: unknown;
      extra_content?: unknown;
    };
    if (type !== "function" || typeof fn !== "object" || fn === null) {
      continue;
    }
    const { name, arguments: args } = fn as {
      name?: unknown;
      arguments?: unknown;
    };
    if (typeof id !== "string" || id.length === 0) {
      continue;
    }
    if (typeof name !== "string" || name.length === 0) {
      continue;
    }
    if (typeof args !== "string") {
      continue;
    }
    calls.push({
      id,
      type: "function",
      function: { name, arguments: args },
      ...(extra_content !== undefined ? { extra_content } : {}),
    });
  }
  return calls;
}

/**
 * Chat completion con eventuale function calling tramite Google AI Studio (OpenAI endpoint).
 */
export async function chat(args: {
  capability: AiCapability;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  responseFormatJson?: boolean;
}): Promise<ChatResponse> {
  if (!hasAiKey()) throw new MissingApiKeyError();

  const startedAt = Date.now();
  try {
    const response = await withTimeout(`${GEMINI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiKey()}`,
        "x-goog-api-key": aiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        ...(args.tools ? { tools: args.tools, tool_choice: "auto" } : {}),
        ...(args.responseFormatJson
          ? { response_format: { type: "json_object" } }
          : {}),
        temperature: args.temperature ?? 0.2,
      }),
    });

    if (!response.ok) throw await failureFor(response, "Gemini ha risposto");

    const json = (await response.json()) as {
      choices?: { message?: { content?: unknown; tool_calls?: unknown } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const message = json.choices?.[0]?.message;
    const toolCalls = parseToolCalls(message?.tool_calls);

    await logCall({
      capability: args.capability,
      model: args.model,
      tokensIn: json.usage?.prompt_tokens ?? null,
      tokensOut: json.usage?.completion_tokens ?? null,
      latencyMs: elapsed(startedAt),
      success: true,
    });

    return {
      content: typeof message?.content === "string" ? message.content : null,
      toolCalls,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
          }
        : null,
    };
  } catch (error) {
    await logCall({
      capability: args.capability,
      model: args.model,
      tokensIn: null,
      tokensOut: null,
      latencyMs: elapsed(startedAt),
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * I model id che Google Gemini sta servendo a questa chiave.
 */
export async function listAvailableModels(): Promise<string[]> {
  if (!hasAiKey()) throw new MissingApiKeyError();

  const response = await withTimeout(`${GEMINI_BASE_URL}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${aiKey()}`,
      "x-goog-api-key": aiKey(),
    },
  });

  if (!response.ok) {
    throw await failureFor(response, "Elenco dei modelli non disponibile");
  }

  const json = (await response.json()) as { data?: unknown };
  if (!Array.isArray(json.data)) {
    throw new AiResponseError("Elenco dei modelli: manca il campo data");
  }

  return json.data
    .map((entry) =>
      typeof entry === "object" && entry !== null
        ? (entry as { id?: unknown }).id
        : null,
    )
    .filter((id): id is string => typeof id === "string");
}

/**
 * Trascrizione audio multimodale tramite Gemini.
 */
export async function transcribeAudio(args: {
  capability: AiCapability;
  model: string;
  uri: string;
  language: string;
  prompt?: string;
}): Promise<string> {
  if (!hasAiKey()) throw new MissingApiKeyError();

  const startedAt = Date.now();
  const base64Audio = await FileSystem.readAsStringAsync(args.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const promptText = args.prompt
    ? `Trascrivi fedelmente e integralmente il parlato in lingua italiana. Contesto lessicale: ${args.prompt}. Restituisci SOLO ed esclusivamente il testo trascritto, senza virgolette, senza premesse e senza commenti.`
    : "Trascrivi fedelmente e integralmente il parlato in lingua italiana. Restituisci SOLO ed esclusivamente il testo trascritto, senza virgolette, senza premesse e senza commenti.";

  try {
    /*
     * La chiave va nell'header, non in `?key=`.
     *
     * L'endpoint nativo accetta entrambi, ma un errore di rete si porta dietro
     * la URL: quel testo finisce in `app_logs`, che si condivide come file ed
     * e' dentro il backup del telefono. Era la stessa chiave che `aiKeyStore`
     * tiene apposta fuori dal database, pubblicata da un'altra porta.
     */
    const url = `${GEMINI_NATIVE_BASE_URL}/models/${args.model}:generateContent`;
    const response = await withTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": aiKey(),
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/m4a",
                  data: base64Audio,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) throw await failureFor(response, "Trascrizione fallita");

    const json = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: unknown }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== "string") {
      throw new AiResponseError(
        "Trascrizione: la risposta non contiene il testo trascritto",
      );
    }

    await logCall({
      capability: args.capability,
      model: args.model,
      tokensIn: null,
      tokensOut: null,
      latencyMs: elapsed(startedAt),
      success: true,
    });
    return text.trim();
  } catch (error) {
    await logCall({
      capability: args.capability,
      model: args.model,
      tokensIn: null,
      tokensOut: null,
      latencyMs: elapsed(startedAt),
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
