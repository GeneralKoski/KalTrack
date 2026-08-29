import { hasBackend } from "@/src/api/config";
import { apiRequest } from "@/src/api/client";
import { getDb } from "@/src/db/index";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { useAccountStore } from "@/src/stores/accountStore";
import { logger } from "@/src/utils/logger";

/**
 * La copia del database sul server.
 *
 * IL TELEFONO RESTA LA FONTE DI VERITA'. L'app scrive su SQLite come ha sempre
 * fatto e continua a funzionare senza rete; questa sincronizzazione manda una
 * copia al server quando la rete c'e', cosi' un secondo dispositivo la ritrova
 * e un telefono perso non porta via tutto.
 *
 * Non e' un'app che parla con un'API: e' un'app locale che tiene una copia
 * altrove. La differenza si sente in palestra, dove il segnale non c'e' e una
 * serie va registrata lo stesso.
 */

/**
 * Le tabelle che viaggiano, nell'ordine in cui vanno applicate: i padri prima
 * dei figli, altrimenti una riga figlia arriva quando il suo padre non esiste
 * ancora e la foreign key la rifiuta.
 *
 * Fuori di proposito:
 *  - `ai_calls`, che e' il registro locale dei costi delle chiamate AI e non
 *    e' un dato dell'utente da portarsi su un altro telefono;
 *  - `progress_photos`, le cui righe puntano a file che sull'altro telefono
 *    non esistono: la riga arriverebbe e la foto sarebbe rotta. Rientrera'
 *    quando i file avranno un posto dove stare.
 */
export const SYNCED_TABLES = [
  "meal_types",
  "foods",
  "recipes",
  "exercises",
  "routines",
  "profile",
  "targets",
  "settings",
  "user_equipment",
  "weight_logs",
  "step_logs",
  "water_logs",
  "body_measurements",
  "fasting_windows",
  "achievements",
  "reminders",
  "recipe_items",
  "meals",
  "meal_entries",
  "meal_plan_entries",
  "routine_days",
  "routine_blocks",
  "block_exercises",
  "workout_sessions",
  "session_sets",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Il segnaposto da cui riprendere, salvato tra un avvio e l'altro. */
const CURSOR_KEY = "sync.cursor";

/**
 * Quante righe per volta. Il server ne accetta 2000: restare sotto lascia
 * margine e tiene corta la singola richiesta su una rete lenta.
 */
const BATCH = 500;

export interface SyncChange {
  table: string;
  id: string;
  payload: Record<string, unknown>;
  updatedAt: string;
  deletedAt: string | null;
  createdAt: string;
}

interface SyncResponse {
  applied: number;
  changes: SyncChange[];
  cursor: string;
}

/** Le colonne di una tabella, lette dallo schema invece che elencate a mano. */
const columnsOf = async (table: string): Promise<string[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );
  return rows.map((r) => r.name);
};

/**
 * Le righe cambiate dopo `since`.
 *
 * Include quelle cancellate logicamente: una cancellazione e' una modifica
 * come le altre, e senza mandarla l'altro dispositivo continuerebbe a mostrare
 * quel che qui e' stato tolto.
 */
export async function collectChanges(
  since: string | null,
  limit = BATCH,
): Promise<SyncChange[]> {
  const db = await getDb();
  const changes: SyncChange[] = [];

  for (const table of SYNCED_TABLES) {
    if (changes.length >= limit) break;

    const rows = await db.getAllAsync<Record<string, unknown>>(
      since === null
        ? `SELECT * FROM ${table} ORDER BY updated_at LIMIT ?`
        : `SELECT * FROM ${table} WHERE updated_at > ? ORDER BY updated_at LIMIT ?`,
      since === null ? [limit - changes.length] : [since, limit - changes.length],
    );

    for (const row of rows) {
      const id = row.id;
      // `settings` ha `key` come chiave primaria e non un UUID: e' l'unica
      // tabella cosi', e senza questo la sua riga verrebbe scartata dal
      // server, che si aspetta un uuid.
      const recordId = typeof id === "string" ? id : String(row.key ?? "");
      if (recordId === "") continue;

      changes.push({
        table,
        id: recordId,
        payload: row,
        updatedAt: String(row.updated_at ?? ""),
        deletedAt: (row.deleted_at as string | null) ?? null,
        createdAt: String(row.created_at ?? row.updated_at ?? ""),
      });
    }
  }

  return changes;
}

/**
 * Scrive nel database locale quel che arriva dal server.
 *
 * Chi ha scritto per ultimo vince, e il confronto si fa qui riga per riga: una
 * modifica locale piu' recente non viene sovrascritta da una copia piu'
 * vecchia arrivata dalla rete.
 */
export async function applyChanges(changes: SyncChange[]): Promise<number> {
  if (changes.length === 0) return 0;

  const db = await getDb();
  const columnCache = new Map<string, string[]>();
  let applied = 0;

  await db.withTransactionAsync(async () => {
    for (const change of changes) {
      if (!(SYNCED_TABLES as readonly string[]).includes(change.table)) {
        // Una tabella che questa versione dell'app non conosce: la si salta
        // invece di rompere tutta la sincronizzazione. Tornera' utile quando
        // due telefoni hanno versioni diverse.
        logger.warn(`[sync] tabella sconosciuta ignorata: ${change.table}`);
        continue;
      }

      if (!columnCache.has(change.table)) {
        columnCache.set(change.table, await columnsOf(change.table));
      }
      const columns = columnCache.get(change.table) ?? [];
      const key = columns.includes("id") ? "id" : "key";

      const existing = await db.getFirstAsync<{ updated_at: string }>(
        `SELECT updated_at FROM ${change.table} WHERE ${key} = ?`,
        [change.id],
      );
      if (existing && existing.updated_at >= change.updatedAt) continue;

      // Solo le colonne che questa versione dello schema conosce: un campo
      // aggiunto da una versione piu' nuova non deve far fallire l'INSERT.
      const usable = columns.filter((c) => c in change.payload);
      const values = usable.map(
        (c) => change.payload[c] as string | number | null,
      );
      const placeholders = usable.map(() => "?").join(", ");
      const updates = usable.map((c) => `${c} = excluded.${c}`).join(", ");

      await db.runAsync(
        `INSERT INTO ${change.table} (${usable.join(", ")})
         VALUES (${placeholders})
         ON CONFLICT(${key}) DO UPDATE SET ${updates}`,
        values,
      );
      applied++;
    }
  });

  return applied;
}

/**
 * Un giro di sincronizzazione: manda quel che e' cambiato, applica quel che
 * torna, e ricorda da dove riprendere.
 *
 * Non solleva mai. Senza rete, senza account o senza server configurato
 * l'app deve continuare a funzionare come se la sincronizzazione non
 * esistesse, perche' e' esattamente cosi' che e' nata.
 */
export async function runSync(): Promise<{
  pushed: number;
  pulled: number;
} | null> {
  try {
    if (!hasBackend()) return null;
    if (!useAccountStore.getState().token) return null;

    const cursor = await getSetting(CURSOR_KEY);
    const changes = await collectChanges(cursor);

    const response = await apiRequest<SyncResponse>({
      method: "post",
      path: "/sync",
      body: { since: cursor, changes },
    });

    const pulled = await applyChanges(response.changes);
    // Il segnaposto si salva DOPO aver applicato: se la scrittura locale
    // fallisce a meta', il giro successivo riprende dallo stesso punto invece
    // di dare per ricevute righe che non sono mai entrate.
    await setSetting(CURSOR_KEY, response.cursor);

    logger.info(`[sync] inviate ${response.applied}, ricevute ${pulled}`);
    return { pushed: response.applied, pulled };
  } catch (error) {
    logger.warn("[sync] giro non riuscito", error);
    return null;
  }
}
