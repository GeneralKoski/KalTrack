import { hasBackend } from "@/src/api/config";
import { apiRequest } from "@/src/api/client";
import { getDb } from "@/src/db/index";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { useAccountStore } from "@/src/stores/accountStore";
import { useSyncStore } from "@/src/stores/syncStore";
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

/**
 * DUE segnaposti, perche' ci sono due orologi.
 *
 * `sync.cursor` e' l'ora del SERVER e dice da dove riprendere a scaricare.
 * `sync.pushed_at` e' l'ora di QUESTO telefono e dice cosa e' gia' stato
 * mandato.
 *
 * Usarne uno solo per entrambi confrontava l'ora del server con gli
 * `updated_at` locali: con il telefono anche solo un minuto indietro rispetto
 * al server, tutte le righe scritte in quel minuto risultavano gia' inviate e
 * non partivano mai piu'. Nessun giro successivo le avrebbe recuperate.
 */
const CURSOR_KEY = "sync.cursor";
const PUSHED_KEY = "sync.pushed_at";

/**
 * Impostazioni che NON viaggiano: sono stato di questo dispositivo, non dati
 * dell'utente.
 *
 * Il cursore e' il caso grave. Sincronizzandolo, ogni giro ne scriveva uno
 * nuovo da mandare al giro dopo - un ciclo che non si esaurisce mai - e
 * soprattutto il cursore di un telefono sarebbe finito sull'altro, che
 * avrebbe saltato tutte le righe arrivate prima di quel punto senza averle
 * mai ricevute.
 */
const LOCAL_ONLY_SETTINGS = new Set([CURSOR_KEY, PUSHED_KEY]);

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
      // `settings` ha `key` come chiave primaria e non un id: e' l'unica
      // tabella cosi'.
      const recordId = typeof id === "string" ? id : String(row.key ?? "");
      if (recordId === "") continue;
      if (table === "settings" && LOCAL_ONLY_SETTINGS.has(recordId)) continue;

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
 * Vincoli UNIQUE che NON sono la chiave primaria.
 *
 * Sono il punto in cui due dispositivi si scontrano davvero: entrambi possono
 * registrare il peso dello stesso giorno, ciascuno con il proprio id. La riga
 * che arriva ha un id diverso ma la stessa data, e l'INSERT viola il vincolo.
 *
 * Prima di scrivere si toglie di mezzo la riga locale in conflitto, se quella
 * in arrivo e' piu' recente. Senza, l'INSERT sollevava, e siccome tutto il
 * lotto sta in una transazione l'intera sincronizzazione veniva annullata e si
 * ribloccava identica a ogni giro.
 */
const UNIQUE_KEYS: Record<string, string[]> = {
  weight_logs: ["date"],
  step_logs: ["date"],
  achievements: ["code"],
  body_measurements: ["date", "site"],
};

/**
 * Scrive nel database locale quel che arriva dal server.
 *
 * Chi ha scritto per ultimo vince, e il confronto si fa qui riga per riga: una
 * modifica locale piu' recente non viene sovrascritta da una copia piu'
 * vecchia arrivata dalla rete.
 *
 * Una riga che non si riesce a scrivere NON ferma le altre: viene registrata
 * e si prosegue. Un lotto che fallisce per intero a causa di una riga sola
 * bloccherebbe la sincronizzazione per sempre.
 */
export async function applyChanges(changes: SyncChange[]): Promise<number> {
  if (changes.length === 0) return 0;

  const db = await getDb();
  const columnCache = new Map<string, string[]>();
  let applied = 0;

  await db.withTransactionAsync(async () => {
    for (const change of changes) {
      if (
        change.table === "settings" &&
        LOCAL_ONLY_SETTINGS.has(change.id)
      ) {
        // Anche in entrata: un cursore arrivato da un altro telefono
        // sposterebbe il nostro punto di ripresa in avanti, e le righe in
        // mezzo non arriverebbero mai.
        continue;
      }

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

      // La riga locale che occupa lo stesso posto con un id diverso: se la
      // nostra e' piu' recente teniamo la nostra e scartiamo quella in
      // arrivo, altrimenti le facciamo posto.
      const conflict = await findUniqueConflict(db, change, columns);
      if (conflict !== null) {
        if (conflict.updated_at >= change.updatedAt) continue;
        await db.runAsync(`DELETE FROM ${change.table} WHERE ${key} = ?`, [
          conflict.key,
        ]);
      }

      // Solo le colonne che questa versione dello schema conosce: un campo
      // aggiunto da una versione piu' nuova non deve far fallire l'INSERT.
      const usable = columns.filter((c) => c in change.payload);
      const values = usable.map(
        (c) => change.payload[c] as string | number | null,
      );
      const placeholders = usable.map(() => "?").join(", ");
      const updates = usable.map((c) => `${c} = excluded.${c}`).join(", ");

      try {
        await db.runAsync(
          `INSERT INTO ${change.table} (${usable.join(", ")})
           VALUES (${placeholders})
           ON CONFLICT(${key}) DO UPDATE SET ${updates}`,
          values,
        );
        applied++;
      } catch (error) {
        // Una riga sola non deve annullare il lotto: si annota e si va
        // avanti. Il giro successivo la ritentera'.
        logger.warn(
          `[sync] riga non scritta: ${change.table}/${change.id}`,
          error,
        );
      }
    }
  });

  return applied;
}

/**
 * La riga locale che occuperebbe lo stesso posto di quella in arrivo secondo
 * un vincolo UNIQUE, se esiste ed e' un'altra riga.
 */
async function findUniqueConflict(
  db: Awaited<ReturnType<typeof getDb>>,
  change: SyncChange,
  columns: string[],
): Promise<{ key: string; updated_at: string } | null> {
  const unique = UNIQUE_KEYS[change.table];
  if (!unique) return null;
  if (!unique.every((c) => columns.includes(c) && c in change.payload)) {
    return null;
  }

  const where = unique.map((c) => `${c} = ?`).join(" AND ");
  const values = unique.map((c) => change.payload[c] as string | number | null);
  const row = await db.getFirstAsync<{ id: string; updated_at: string }>(
    `SELECT id, updated_at FROM ${change.table} WHERE ${where}`,
    values,
  );

  if (!row || row.id === change.id) return null;
  return { key: row.id, updated_at: row.updated_at };
}

/**
 * Quanti giri consecutivi al massimo.
 *
 * La prima sincronizzazione di un database gia' pieno non entra in una
 * richiesta sola: con lotti da 500 righe, un catalogo di alimenti ed esercizi
 * ne richiede diverse. Senza continuare, il primo giro ne manderebbe 500 e le
 * altre aspetterebbero un quarto d'ora ciascuna.
 *
 * Il tetto e' una rete di sicurezza contro un ciclo che non converge, non una
 * misura del lavoro: un database normale finisce in pochi giri.
 */
const MAX_ROUNDS = 20;

/**
 * Sincronizza finche' c'e' qualcosa da sincronizzare.
 *
 * Non solleva mai. Senza rete, senza account o senza server configurato l'app
 * deve continuare a funzionare come se la sincronizzazione non esistesse,
 * perche' e' esattamente cosi' che e' nata.
 */
export async function runSync(): Promise<{
  pushed: number;
  pulled: number;
} | null> {
  try {
    if (!hasBackend()) return null;
    if (!useAccountStore.getState().token) return null;

    let pushed = 0;
    let pulled = 0;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const cursor = await getSetting(CURSOR_KEY);
      const pushedAt = await getSetting(PUSHED_KEY);
      const changes = await collectChanges(pushedAt);

      const response = await apiRequest<SyncResponse>({
        method: "post",
        path: "/sync",
        body: { since: cursor, changes },
      });

      const applied = await applyChanges(response.changes);
      // Il segnaposto si salva DOPO aver applicato: se la scrittura locale
      // fallisce a meta', il giro successivo riprende dallo stesso punto
      // invece di dare per ricevute righe che non sono mai entrate.
      await setSetting(CURSOR_KEY, response.cursor);
      // Fin dove siamo arrivati a mandare: il massimo `updated_at` LOCALE fra
      // le righe inviate, non l'ora corrente. Prendere "adesso" salterebbe le
      // righe scritte mentre la richiesta era in volo.
      const maxSent = changes.reduce(
        (max, c) => (c.updatedAt > max ? c.updatedAt : max),
        pushedAt ?? "",
      );
      if (maxSent !== "") await setSetting(PUSHED_KEY, maxSent);

      pushed += response.applied;
      pulled += applied;

      // Un lotto pieno da una parte o dall'altra vuol dire che ce n'e'
      // ancora: si continua subito invece di aspettare il giro dopo.
      const piu = changes.length >= BATCH || response.changes.length > 0;
      if (!piu) break;
    }

    if (pushed > 0 || pulled > 0) {
      logger.info(`[sync] inviate ${pushed}, ricevute ${pulled}`);
    }
    // Solo se sono ENTRATE righe: quel che e' partito lo conoscono gia' le
    // schermate, e ricaricarle a ogni invio sarebbe lavoro per niente.
    if (pulled > 0) useSyncStore.getState().bumpRevision();
    return { pushed, pulled };
  } catch (error) {
    logger.warn("[sync] giro non riuscito", error);
    return null;
  }
}
