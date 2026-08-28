/**
 * Configurazione dei modelli AI, in un solo posto.
 *
 * I model id di Groq cambiano spesso: tenerli qui significa che aggiornarli è
 * una riga, e che sostituire Groq con un altro provider (o con un proxy
 * server-side) tocca solo questo file e il client.
 */
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export const MODELS = {
  /** Trascrizione vocale. */
  transcription: "whisper-large-v3-turbo",
  /** Comprensione e function calling dell'assistente. */
  assistant: "llama-3.3-70b-versatile",
  /** Stima nutrizionale da foto. */
  vision: "meta-llama/llama-4-scout-17b-16e-instruct",
} as const;

/**
 * Lingua fissata invece di lasciarla all'autodetect: su clip corte come
 * "duecento grammi di riso" la rilevazione automatica a volte sbaglia lingua,
 * e fissarla migliora anche accuratezza e latenza.
 */
export const TRANSCRIPTION_LANGUAGE = "it";

/** Oltre questo tempo una richiesta si considera persa. */
export const AI_TIMEOUT_MS = 45_000;

/**
 * La chiave finisce nel bundle in chiaro: accettabile finché l'APK resta
 * personale. Vedi la sezione 9.3 della spec.
 */
export const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? "";

export const hasGroqKey = (): boolean => GROQ_API_KEY.trim().length > 0;

export type AiCapability =
  | "transcription"
  | "assistant"
  | "vision"
  | "food_estimate"
  | "exercise_alternatives"
  | "routine_generation";
