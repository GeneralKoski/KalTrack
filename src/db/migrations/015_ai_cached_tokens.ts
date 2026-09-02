import type { Migration } from "@/src/db/migrations/types";

/**
 * I token del prompt che il provider ha servito dalla cache.
 *
 * `ai_calls` contava i token in entrata da sempre, ma non diceva quanti di
 * quelli erano stati pagati per intero. Con la cache implicita di Gemini e' la
 * differenza fra il prezzo pieno e un quarto, cioe' l'unico numero che dice se
 * la cache sta funzionando: un prefisso stabile che nessuno misura e'
 * un'ipotesi, esattamente come un model id non provato.
 *
 * Nullable perche' la risposta puo' non riportarlo affatto - l'endpoint nativo
 * della trascrizione non lo fa - e uno 0 direbbe "misurato, nessun colpo"
 * quando la verita' e' "non misurato".
 */
export const migration015: Migration = {
  version: 15,
  name: "ai_cached_tokens",
  up: `
ALTER TABLE ai_calls ADD COLUMN cached_tokens INTEGER;
`,
};
