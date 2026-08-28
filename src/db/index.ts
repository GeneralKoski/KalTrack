import { DB_NAME } from "@/src/consts";
import { runMigrations } from "@/src/db/migrations";
import { wrapDatabase, type LocalDatabase } from "@/src/db/sqliteAdapter";
import { logger } from "@/src/utils/logger";
import * as SQLite from "expo-sqlite";

let dbPromise: Promise<LocalDatabase> | null = null;
let testDb: LocalDatabase | null = null;

/** Solo per i test: sostituisce la connessione usata da getDb(). */
export function __setDbForTesting(db: LocalDatabase | null): void {
  testDb = db;
}

export function getDb(): Promise<LocalDatabase> {
  if (testDb) return Promise.resolve(testDb);

  if (!dbPromise) {
    dbPromise = (async () => {
      const db = wrapDatabase(await SQLite.openDatabaseAsync(DB_NAME));
      // PRAGMA di connessione: vanno impostate una volta all'apertura, fuori da
      // qualsiasi transazione (journal_mode e synchronous non sono modificabili
      // dentro una transazione).
      await db.execAsync(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;",
      );
      return db;
    })();
  }
  return dbPromise;
}

export async function initDatabase(): Promise<void> {
  const db = await getDb();
  const version = await runMigrations(db);
  logger.info(`[db] schema alla versione ${version}`);
}

export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const current = dbPromise;
  dbPromise = null;
  try {
    await (await current).closeAsync();
  } catch (error) {
    logger.error("[db] errore chiusura", error);
  }
}
