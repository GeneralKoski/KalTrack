import Database from "better-sqlite3";

import type { BindValue, LocalDatabase } from "@/src/db/sqliteAdapter";

/**
 * DB in memoria con la stessa superficie di LocalDatabase, per i test su Node.
 * Non va mai importato dal codice applicativo.
 */
export function createTestDb(): LocalDatabase {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  // better-sqlite3 e' sincrono e su un'unica connessione: non ha il problema
  // di concorrenza di expo-sqlite, quindi non serve simulare ne' la coda ne'
  // la connessione dedicata della transazione.
  const bare: LocalDatabase = {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    getAllAsync: async <T>(sql: string, params: BindValue[] = []) =>
      db.prepare(sql).all(...(params as never[])) as T[],
    getFirstAsync: async <T>(sql: string, params: BindValue[] = []) =>
      (db.prepare(sql).get(...(params as never[])) as T) ?? null,
    runAsync: async (sql, params = []) => {
      const info = db.prepare(sql).run(...(params as never[]));
      return {
        lastInsertRowId: Number(info.lastInsertRowid),
        changes: info.changes,
      };
    },
    withTransactionAsync: async (fn) => {
      db.exec("BEGIN");
      try {
        await fn();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    closeAsync: async () => {
      db.close();
    },
  };
  return bare;
}
