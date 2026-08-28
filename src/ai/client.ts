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
  MissingApiKeyError,
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

async function withTimeout(
  input: RequestInfo,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
      choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const message = json.choices?.[0]?.message;

    await logCall({
      capability: args.capability,
      model: args.model,
      tokensIn: json.usage?.prompt_tokens ?? null,
      tokensOut: json.usage?.completion_tokens ?? null,
      latencyMs: elapsed(startedAt),
      success: true,
    });

    return {
      content: message?.content ?? null,
      toolCalls: message?.tool_calls ?? [],
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

    const json = (await response.json()) as { text?: string };
    await logCall({
      capability: args.capability,
      model: args.model,
      tokensIn: null,
      tokensOut: null,
      latencyMs: elapsed(startedAt),
      success: true,
    });
    return json.text ?? "";
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
