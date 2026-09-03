/**
 * Una chiave finta per i test dell'AI.
 *
 * Senza, i test leggerebbero la chiave VERA: `jest-expo` carica i file .env, e
 * `aiKey()` legge `EXPO_PUBLIC_GEMINI_API_KEY` da li'. Su un clone pulito - o
 * in CI - fallirebbero tutti, e sulla macchina di chi l'ha configurata
 * passerebbero. Un test che dipende da un segreto locale non dice se il codice
 * funziona, dice chi lo sta eseguendo.
 *
 * L'assegnazione basta qui in cima perche' `aiKey()` legge `process.env` al
 * momento della chiamata, non all'import. Fino al 3 settembre 2026 al suo
 * posto c'era la stessa cosa fatta su `aiKeyStore`, che non esiste piu'.
 *
 * I test che verificano il comportamento SENZA chiave continuano a valere:
 * mockano `hasAiKey` per conto loro, e quel mock vince su questo.
 */
process.env.EXPO_PUBLIC_GEMINI_API_KEY = "AIza-chiave-di-test";
