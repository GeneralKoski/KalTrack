
import { i18n } from "@/src/i18n";

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
 * Un modello per tutte e tre le capability: `gemini-3.5-flash-lite`.
 *
 * **La ragione e' la quota, non il costo.** Sul Free Tier il limite e'
 * `GenerateRequestsPerDayPerProjectPerModel`, cioe' un tetto giornaliero **per
 * modello**, e su `gemini-3.6-flash` vale **20 richieste al giorno** - misurato
 * il 2 settembre 2026 leggendolo dal corpo di un 429, perche' Google non lo
 * pubblica piu' (la pagina dei rate limit rimanda ad AI Studio).
 *
 * Venti non sono venti frasi. Una frase detta all'assistente costa una
 * trascrizione, piu' da uno a `MAX_TOOL_ROUNDS` giri di tool loop, piu' una
 * stima per ogni alimento che `resolveFood` non riconosce: una frase con tre
 * cibi nuovi ne consuma sei. Il tetto di `gemini-3.6-flash` e' quindi **tre o
 * quattro frasi al giorno**, e l'app diventa inutilizzabile a meta' colazione.
 *
 * `gemini-3.5-flash-lite` ha un tetto piu' alto - oltre 28 richieste in un
 * giorno senza esaurirlo, valore esatto non pubblicato - ed e' da tre a dieci
 * volte piu' veloce, con una dispersione stretta: 1,0-1,7s contro i 3,4-22,7s
 * di `gemini-3.6-flash`. Su un assistente vocale la differenza si sente.
 *
 * `gemini-3.7-flash` e' scartato per un motivo diverso: la quota c'e' ma la
 * capacita' no. Restituisce `503 "This model is currently experiencing high
 * demand"` su circa metà delle richieste, e ci mette 90-120 secondi a dirlo.
 * E' GA da agosto 2026, quindi da un mese.
 *
 * **Il prezzo pagato per flash-lite:** segue le regole del prompt un po'
 * peggio sulle frasi ambigue. "Ho mangiato del riso" gli fa scrivere 100 g
 * inventati invece di chiedere quanto, mentre "un po' di pollo" la domanda la
 * fa. E' l'unico scarto emerso su nove prove; sui numeri - lettura di
 * un'etichetta, trascrizione, "un etto e mezzo" che non deve diventare 1, la
 * data di "ieri", i macro dettati che non vanno passati - le due sono pari, e
 * sulla data omessa quando l'utente non nomina un giorno flash-lite e' anzi
 * l'unica che rispetta la regola.
 *
 * **Le tre voci restano separate perche' la quota e' per modello.** Puntandole
 * a modelli diversi il budget giornaliero si somma invece di dividersi: e' la
 * leva da usare se un tetto solo non basta, non un residuo storico.
 *
 * La lezione di quel che e' successo una volta resta: un modello ritirato non
 * da' segno di se' - la capability muore e l'app continua a chiamarlo, qui per
 * sei settimane senza che nessuno lo notasse. **Un model id non provato e'
 * un'ipotesi**, e si prova da **Impostazioni > Diagnostica**.
 */
export const MODELS = {
  /** Trascrizione vocale. */
  transcription: "gemini-3.5-flash-lite",
  /** Comprensione e function calling dell'assistente. */
  assistant: "gemini-3.5-flash-lite",
  /** Stima nutrizionale da foto ed etichette. */
  vision: "gemini-3.5-flash-lite",
} as const;

/**
 * La lingua dell'AI e' quella dell'app, e non una fissata qui.
 *
 * `TRANSCRIPTION_LANGUAGE = "it"` era una costante, e con lei ogni prompt
 * diceva "reply in Italian": chi usava KalTrack in inglese si vedeva
 * trascrivere l'inglese come se fosse italiano e si sentiva rispondere in
 * italiano, con la voce italiana. L'assistente non e' una funzione italiana
 * dell'app, e' l'app che parla.
 *
 * Tre forme della stessa cosa, perche' tre destinatari diversi la vogliono
 * scritta in tre modi: il codice ISO per la trascrizione, il tag completo per
 * il motore vocale, il nome inglese per i prompt - i modelli seguono
 * "reply in Italian" meglio di "reply in it".
 */
const LANGUAGE_NAMES: Record<string, string> = {
  it: "Italian",
  en: "English",
};

/** Il codice ISO della lingua corrente ("it", "en"). */
export const aiLanguage = (): string => i18n.locale.split("-")[0];

/**
 * Il nome della lingua da scrivere dentro un prompt.
 *
 * Ripiega sull'inglese per una lingua che non conosciamo: e' il default
 * dell'app (§ Lingua in `CLAUDE.md`), e un nome inventato nel prompt varrebbe
 * meno di nessun nome.
 */
export const promptLanguage = (): string =>
  LANGUAGE_NAMES[aiLanguage()] ?? "English";

/** Oltre questo tempo una richiesta si considera persa (90s per consentire OCR vision e reasoning). */
export const AI_TIMEOUT_MS = 90_000;

/**
 * La chiave Google AI Studio, una sola per tutti: `EXPO_PUBLIC_GEMINI_API_KEY`,
 * quindi nel bundle.
 *
 * C'e' stata anche una chiave personale, che l'utente metteva da Impostazioni
 * e che aveva la precedenza su questa. E' stata tolta il 3 settembre 2026: al
 * rilascio pubblico le chiamate passeranno dal backend a consumo, quindi non
 * c'e' piu' una quota da scavalcare, e chiedere una chiave a chi installa
 * l'app significava un campo in piu' che nessuno avrebbe compilato.
 */
export const aiKey = (): string =>
  (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "").trim();

export const hasAiKey = (): boolean => aiKey().trim().length > 0;

export type AiCapability =
  | "transcription"
  | "assistant"
  | "vision"
  | "food_estimate"
  | "exercise_alternatives"
  | "routine_generation"
  | "meal_plan_generation";
