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

/**
 * Un modello per tutte e tre le capability.
 *
 * `gemini-3.6-flash` e' quello dichiarato in `CLAUDE.md` dal passaggio a
 * Gemini; il codice era rimasto su `gemini-3.5-flash-lite`, cioe' la voce piu'
 * economica del listino, sulle capability che se ne accorgono di piu' - la
 * trascrizione audio e la lettura di un'etichetta.
 *
 * Verificati contro il servizio il 2 settembre 2026, entrambi gli endpoint:
 * trascrizione di un m4a sull'endpoint nativo, lettura di un'etichetta in
 * `json_object` su quello OpenAI-compatible. La lezione del ritiro di
 * `llama-3.3-70b-versatile`, passato inosservato per sei settimane, e' che un
 * model id non provato e' un'ipotesi: si controlla da **Impostazioni >
 * Diagnostica**, che interroga l'elenco dei modelli serviti a questa chiave.
 *
 * Esiste anche `gemini-3.7-flash`: non e' stato provato e il salto va fatto
 * di proposito, non per abitudine all'ultimo numero.
 */
export const MODELS = {
  /** Trascrizione vocale. */
  transcription: "gemini-3.6-flash",
  /** Comprensione e function calling dell'assistente. */
  assistant: "gemini-3.6-flash",
  /** Stima nutrizionale da foto ed etichette. */
  vision: "gemini-3.6-flash",
} as const;

/**
 * Lingua fissata per la trascrizione e comprensione.
 */
export const TRANSCRIPTION_LANGUAGE = "it";

/** Oltre questo tempo una richiesta si considera persa (90s per consentire OCR vision e reasoning). */
export const AI_TIMEOUT_MS = 90_000;

/**
 * Chiave predefinita fornita all'app tramite variabile d'ambiente (per tutti gli utenti).
 */
const defaultEnvKey = (): string =>
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";

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

export type AiCapability =
  | "transcription"
  | "assistant"
  | "vision"
  | "food_estimate"
  | "exercise_alternatives"
  | "routine_generation"
  | "meal_plan_generation";
