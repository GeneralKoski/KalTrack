import type { SQLiteBindValue, SQLiteDatabase } from "expo-sqlite";

export type BindValue = SQLiteBindValue;

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

/**
 * Superficie minima del database locale. Astrae il driver: l'app usa
 * expo-sqlite, i test usano better-sqlite3 (vedi __testing__/). Cambiare driver
 * (es. op-sqlite con SQLCipher) tocca solo questo file.
 */
export interface LocalDatabase {
  /** Esegue uno o più statement separati da ";" senza parametri (DDL/PRAGMA). */
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, params?: BindValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: BindValue[]): Promise<T | null>;
  runAsync(sql: string, params?: BindValue[]): Promise<RunResult>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

export function wrapDatabase(db: SQLiteDatabase): LocalDatabase {
  return {
    execAsync: (sql) => db.execAsync(sql),
    getAllAsync: <T>(sql: string, params: BindValue[] = []) =>
      db.getAllAsync<T>(sql, params),
    getFirstAsync: <T>(sql: string, params: BindValue[] = []) =>
      db.getFirstAsync<T>(sql, params),
    runAsync: async (sql, params = []) => {
      const result = await db.runAsync(sql, params);
      return {
        lastInsertRowId: result.lastInsertRowId,
        changes: result.changes,
      };
    },
    withTransactionAsync: (fn) => db.withTransactionAsync(fn),
    closeAsync: () => db.closeAsync(),
  };
}
