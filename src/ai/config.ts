import { useAiKeyStore } from "@/src/stores/aiKeyStore";

/**
 * Configurazione dei modelli AI Google Gemini (Google AI Studio).
 *
 * KalTrack usa i modelli Gemini per tutte le capability (assistente vocale/testuale,
 * stima nutrizionale da foto ed etichette, trascrizione audio e generazione schede).
 */
export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
export const GEMINI_NATIVE_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

/** Alias di retrocompatibilità */
export const GROQ_BASE_URL = GEMINI_BASE_URL;

export const MODELS = {
  /** Trascrizione vocale. */
  transcription: "gemini-2.5-flash",
  /** Comprensione e function calling dell'assistente. */
  assistant: "gemini-2.5-flash",
  /** Stima nutrizionale da foto ed etichette. */
  vision: "gemini-2.5-flash",
} as const;

/**
 * Lingua fissata per la trascrizione e comprensione.
 */
export const TRANSCRIPTION_LANGUAGE = "it";

/** Oltre questo tempo una richiesta si considera persa. */
export const AI_TIMEOUT_MS = 45_000;

/**
 * Chiave predefinita fornita all'app tramite variabile d'ambiente (per tutti gli utenti).
 */
const defaultEnvKey = (): string =>
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ??
  process.env.EXPO_PUBLIC_AI_KEY ??
  process.env.EXPO_PUBLIC_GROQ_API_KEY ??
  "";

/**
 * La chiave Google AI Studio: usa la chiave personalizzata dell'utente (se inserita
 * nelle Impostazioni) oppure la chiave condivisa predefinita dell'app.
 */
export const aiKey = (): string => {
  const custom = useAiKeyStore.getState().key?.trim();
  if (custom && custom.length > 0) return custom;
  return defaultEnvKey().trim();
};

export const hasAiKey = (): boolean => aiKey().trim().length > 0;

/** Alias di retrocompatibilità */
export const groqKey = aiKey;
export const hasGroqKey = hasAiKey;

export type AiCapability =
  | "transcription"
  | "assistant"
  | "vision"
  | "food_estimate"
  | "exercise_alternatives"
  | "routine_generation";
