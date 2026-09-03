import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";

export type LogLevel = "warn" | "error";

export interface AppLog {
  id: string;
  level: LogLevel;
  scope: string | null;
  message: string;
  detail: string | null;
  createdAt: string;
}

/**
 * Quante righe si tengono.
 *
 * Un registro senza tetto e' un difetto che si manifesta mesi dopo, quando il
 * database e' cresciuto di decine di megabyte per colpa di un errore che si
 * ripete a ogni apertura. Trecento bastano: quel che serve e' l'ultima volta
 * che e' andata male, non la storia completa.
 */
export const MAX_LOG_ROWS = 300;

/**
 * Ogni quante scritture si pota. La potatura scandisce la tabella, quindi non
 * si fa a ogni riga: fra una e l'altra il registro puo' superare il tetto di
 * queste righe, ed e' il prezzo voluto per non pagare una scansione a ogni
 * guasto. Il tetto vero e' `MAX_LOG_ROWS + PRUNE_EVERY`.
 */
export const PRUNE_EVERY = 25;

let sinceLastPrune = PRUNE_EVERY;

/**
 * Toglie quel che somiglia a una credenziale.
 *
 * Il registro esce dall'app: si condivide come file e finisce dentro il
 * backup. Un messaggio d'errore che si porta dietro l'header `Authorization`
 * o una chiave la pubblicherebbe: e' la chiave Gemini dell'app, la stessa che
 * al rilascio pubblico passera' dietro il backend.
 *
 * Le forme coperte sono quattro, e nessuna e' teorica:
 *  - `Bearer ...`, l'header con cui parte ogni chiamata AI;
 *  - `gsk_`/`sk_`, le chiavi di Groq e OpenAI - resta per i registri scritti
 *    prima del passaggio a Gemini, che sono ancora nel database;
 *  - `AIza...` e `AQ....`, le due forme delle chiavi Google AI Studio;
 *  - `key=...` in una URL, che e' come l'endpoint nativo accettava la chiave
 *    prima del 2 settembre 2026. Le due ultime mancavano: dal passaggio a
 *    Gemini il registro non nascondeva piu' niente.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(Bearer\s+)\S+/gi, "$1<nascosta>")
    .replace(/\b(gsk|sk)_[A-Za-z0-9_-]{8,}/g, "$1_<nascosta>")
    .replace(/\bAIza[A-Za-z0-9_-]{10,}/g, "AIza<nascosta>")
    .replace(/\bAQ\.[A-Za-z0-9_.-]{10,}/g, "AQ.<nascosta>")
    .replace(/([?&](?:key|api_key)=)[^&\s"']+/gi, "$1<nascosta>");
}

const asText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return value.stack ? `${value.name}: ${value.message}\n${value.stack}` : `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Separa `[scope]` dal messaggio.
 *
 * Chi chiama scrive `logger.error("[assistant] ciclo fallito", error)`: la
 * convenzione c'e' gia' in tutto il codice, e riconoscerla qui evita di dover
 * riscrivere ogni chiamata per guadagnare una colonna su cui filtrare.
 */
export function splitScope(message: string): { scope: string | null; message: string } {
  const match = /^\[([^\]]+)\]\s*(.*)$/s.exec(message);
  if (!match) return { scope: null, message };
  return { scope: match[1], message: match[2] };
}

/**
 * Scrive una riga nel registro. **Non lancia mai e non registra i propri
 * errori**: e' chiamata da `logger`, quindi un guasto qui che passasse di
 * nuovo da `logger.error` si richiamerebbe all'infinito.
 */
export async function recordLog(
  level: LogLevel,
  parts: unknown[],
): Promise<void> {
  if (parts.length === 0) return;
  try {
    const [head, ...rest] = parts;
    const { scope, message } = splitScope(redactSecrets(asText(head)));
    const detail = rest.length
      ? redactSecrets(rest.map(asText).join("\n"))
      : null;

    const db = await getDb();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO app_logs (id, level, scope, message, detail, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId(), level, scope, message, detail, now, now],
    );

    if (++sinceLastPrune >= PRUNE_EVERY) {
      sinceLastPrune = 0;
      await db.runAsync(
        `DELETE FROM app_logs WHERE id NOT IN (
           SELECT id FROM app_logs ORDER BY created_at DESC LIMIT ?
         )`,
        [MAX_LOG_ROWS],
      );
    }
  } catch {
    // Volutamente muto: vedi sopra.
  }
}

/** Le righe piu' recenti, dalla piu' nuova. */
export async function recentLogs(limit = MAX_LOG_ROWS): Promise<AppLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    level: string;
    scope: string | null;
    message: string;
    detail: string | null;
    created_at: string;
  }>(
    `SELECT id, level, scope, message, detail, created_at
       FROM app_logs ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    level: row.level === "warn" ? "warn" : "error",
    scope: row.scope,
    message: row.message,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

/**
 * Svuota il registro davvero, con un DELETE.
 *
 * E' l'eccezione consentita alla regola "mai DELETE FROM": quella regola
 * protegge le tabelle che si sincronizzano, dove una riga tolta risorgerebbe
 * al giro dopo. `app_logs` non viaggia, e un registro che si "cancella" senza
 * liberare spazio non serve a niente.
 */
export async function clearLogs(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM app_logs");
  sinceLastPrune = 0;
}

export interface FailedAiCall {
  id: string;
  capability: string;
  model: string;
  error: string | null;
  createdAt: string;
}

/**
 * Le chiamate AI non riuscite.
 *
 * `ai_calls` registra da sempre l'errore del provider - il 400 del modello col
 * corpo della risposta - e non lo leggeva nessuno: la diagnosi c'era ed era
 * sepolta. Sta qui e non in un file suo perche' e' diagnostica, come il
 * registro, e si guarda nello stesso momento.
 */
export async function recentFailedAiCalls(limit = 50): Promise<FailedAiCall[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    capability: string;
    model: string;
    error: string | null;
    created_at: string;
  }>(
    `SELECT id, capability, model, error, created_at
       FROM ai_calls WHERE success = 0
       ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({
    id: row.id,
    capability: row.capability,
    model: row.model,
    error: row.error === null ? null : redactSecrets(row.error),
    createdAt: row.created_at,
  }));
}

export interface AiUsage {
  /** Giorni coperti dal conteggio. */
  days: number;
  calls: number;
  tokensIn: number;
  tokensOut: number;
  /** Quanti token in entrata sono arrivati dalla cache del provider. */
  cachedTokens: number;
  /**
   * Quante chiamate hanno dichiarato il dato della cache. Zero significa che
   * la domanda non ha risposta, non che la cache non colpisce: senza questo
   * numero una percentuale a zero direbbe due cose diverse allo stesso modo.
   */
  measured: number;
}

/**
 * Quanto e' costato l'ultimo periodo, e quanta parte l'ha pagata la cache.
 *
 * E' il contatore che mancava. Il prefisso del prompt dell'assistente - regole
 * piu' dichiarazioni dei tredici tool piu' catalogo - vale qualche migliaio di
 * token spediti a ogni frase, e a prezzo pieno costa dieci volte quel che
 * costa in cache. Se un domani qualcuno accorcia il prompt di sistema o toglie
 * un tool, il prefisso puo' ricadere sotto i 4.096 token che Gemini richiede e
 * la cache smette di scattare **in silenzio**: qui si vede, e non altrove.
 */
export async function aiUsage(days = 7): Promise<AiUsage> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const row = await db.getFirstAsync<{
    calls: number;
    tokens_in: number | null;
    tokens_out: number | null;
    cached: number | null;
    measured: number;
  }>(
    `SELECT COUNT(*) AS calls,
            SUM(tokens_in) AS tokens_in,
            SUM(tokens_out) AS tokens_out,
            SUM(cached_tokens) AS cached,
            SUM(CASE WHEN cached_tokens IS NULL THEN 0 ELSE 1 END) AS measured
       FROM ai_calls
      WHERE success = 1 AND created_at >= ?`,
    [since],
  );
  return {
    days,
    calls: row?.calls ?? 0,
    tokensIn: row?.tokens_in ?? 0,
    tokensOut: row?.tokens_out ?? 0,
    cachedTokens: row?.cached ?? 0,
    measured: row?.measured ?? 0,
  };
}
