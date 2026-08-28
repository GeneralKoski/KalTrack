import { getNetworkStateAsync } from "expo-network";

import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import {
  AI_TIMEOUT_MS,
  GROQ_API_KEY,
  GROQ_BASE_URL,
  hasGroqKey,
  type AiCapability,
} from "@/src/ai/config";
import {
  AiRequestError,
  AiResponseError,
  MissingApiKeyError,
  OfflineError,
} from "@/src/ai/errors";
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
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      logger.warn("[ai] tool call scartato: non è un oggetto");
      continue;
    }
    const { id, function: fn } = entry as { id?: unknown; function?: unknown };
    if (typeof fn !== "object" || fn === null) {
      logger.warn("[ai] tool call scartato: manca function");
      continue;
    }
    const { name, arguments: args } = fn as {
      name?: unknown;
      arguments?: unknown;
    };
    if (typeof id !== "string" || id.length === 0) {
      logger.warn("[ai] tool call scartato: id mancante");
      continue;
    }
    if (typeof name !== "string" || name.length === 0) {
      logger.warn("[ai] tool call scartato: nome mancante");
      continue;
    }
    if (typeof args !== "string") {
      logger.warn(`[ai] tool call ${name} scartato: argomenti non stringa`);
      continue;
    }
    calls.push({ id, type: "function", function: { name, arguments: args } });
  }
  return calls;
}

/**
 * Chat completion con eventuale function calling.
 *
 * Unico punto che parla con Groq per il testo: sostituire provider o mettere un
 * proxy davanti significa cambiare qui, non nelle capability.
 */
export async function chat(args: {
  capability: AiCapability;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  responseFormatJson?: boolean;
}): Promise<ChatResponse> {
  if (!hasGroqKey()) throw new MissingApiKeyError();

  const startedAt = Date.now();
  try {
    const response = await withTimeout(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
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

    if (!response.ok) {
      const body = await response.text();
      throw new AiRequestError(
        `Groq ha risposto ${response.status}: ${body.slice(0, 200)}`,
        response.status,
      );
    }

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

/** Trascrizione audio. Multipart, quindi non passa da `chat`. */
export async function transcribeAudio(args: {
  capability: AiCapability;
  model: string;
  uri: string;
  language: string;
  prompt?: string;
}): Promise<string> {
  if (!hasGroqKey()) throw new MissingApiKeyError();

  const startedAt = Date.now();
  const form = new FormData();
  // React Native accetta questa forma per i file locali nel FormData.
  form.append("file", {
    uri: args.uri,
    name: "audio.m4a",
    type: "audio/m4a",
  } as unknown as Blob);
  form.append("model", args.model);
  form.append("language", args.language);
  form.append("response_format", "json");
  if (args.prompt) form.append("prompt", args.prompt);

  try {
    const response = await withTimeout(`${GROQ_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new AiRequestError(
        `Trascrizione fallita ${response.status}: ${body.slice(0, 200)}`,
        response.status,
      );
    }

    const json = (await response.json()) as { text?: unknown };
    // Un 200 con un body inatteso NON è una trascrizione riuscita: restituire
    // "" lo registrerebbe come success e a valle si spenderebbe una chat
    // completion con un messaggio utente vuoto. Il silenzio dell'utente è un
    // altro caso e lo distingue transcribe.ts, non questo ramo.
    if (typeof json.text !== "string") {
      throw new AiResponseError(
        "Trascrizione: la risposta non contiene il campo text",
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
    return json.text;
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
