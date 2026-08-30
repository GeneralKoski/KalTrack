import { useAiKeyStore } from "@/src/stores/aiKeyStore";
/**
 * Configurazione dei modelli AI, in un solo posto.
 *
 * I model id di Groq cambiano spesso: tenerli qui significa che aggiornarli è
 * una riga, e che sostituire Groq con un altro provider (o con un proxy
 * server-side) tocca solo questo file e il client.
 *
 * Un modello ritirato non degrada: sparisce. Groq risponde 404
 * `model_not_found` e la capability muore di colpo, quindi questi tre id
 * hanno una scadenza e vanno riguardati quando qualcosa smette di funzionare
 * senza che nessuno l'abbia toccato.
 *
 * `llama-3.3-70b-versatile` (assistente) è stato spento il 16 agosto 2026 e
 * `meta-llama/llama-4-scout-17b-16e-instruct` (foto) il 17 luglio: il secondo
 * è rimasto rotto un mese e mezzo senza che se ne accorgesse nessuno, perché
 * l'app diceva solo "qualcosa è andato storto". Da lì viene `app_logs`.
 *
 * Il modello vision è in preview: su Groq le uniche alternative che accettano
 * immagini sono i due qwen, quindi qui la preview non è una scelta.
 */
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export const MODELS = {
  /** Trascrizione vocale. */
  transcription: "whisper-large-v3-turbo",
  /** Comprensione e function calling dell'assistente. */
  assistant: "openai/gpt-oss-120b",
  /** Stima nutrizionale da foto. Deve accettare immagini e JSON object mode. */
  vision: "qwen/qwen3.6-27b",
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
 * La chiave la porta chi usa l'app, e sta sul suo telefono.
 *
 * Non arriva piu' da `EXPO_PUBLIC_GROQ_API_KEY`: quella finiva nel bundle in
 * chiaro ed era la stessa per tutti, quindi chiunque avesse l'APK poteva
 * estrarla e spendere la quota di chi l'aveva messa. Vedi
 * `src/stores/aiKeyStore.ts`.
 */
export const groqKey = (): string => useAiKeyStore.getState().key ?? "";

export const hasGroqKey = (): boolean => groqKey().trim().length > 0;

export type AiCapability =
  | "transcription"
  | "assistant"
  | "vision"
  | "food_estimate"
  | "exercise_alternatives"
  | "routine_generation";
