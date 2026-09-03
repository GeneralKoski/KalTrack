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

/**
 * expo-sqlite su Android non regge letture/scritture davvero concorrenti
 * sulla stessa connessione: piu' `Promise.all` di query nella stessa
 * schermata (uso normale di `useFocusData`) fanno rilasciare uno statement
 * ancora in uso ("Cannot use shared object that was already released"). Le
 * chiamate si accodano quindi una alla volta su questa connessione.
 */
function serializer() {
  let tail: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn, fn);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

/** Adatta un handle nativo (connessione principale o di transazione) a LocalDatabase. */
function bindRaw(raw: SQLiteDatabase): Omit<LocalDatabase, "withTransactionAsync" | "closeAsync"> {
  return {
    execAsync: (sql) => raw.execAsync(sql),
    getAllAsync: <T>(sql: string, params: BindValue[] = []) =>
      raw.getAllAsync<T>(sql, params),
    getFirstAsync: <T>(sql: string, params: BindValue[] = []) =>
      raw.getFirstAsync<T>(sql, params),
    runAsync: async (sql, params = []) => {
      const result = await raw.runAsync(sql, params);
      return {
        lastInsertRowId: result.lastInsertRowId,
        changes: result.changes,
      };
    },
  };
}

export function wrapDatabase(db: SQLiteDatabase): LocalDatabase {
  const enqueue = serializer();
  const outer = bindRaw(db);

  /*
   * Handle della transazione aperta, se c'e'. `withTransactionAsync` (non
   * esclusiva) e' proprio quella che la documentazione di expo-sqlite segnala
   * come interrompibile da altre query async - la causa vera del crash che il
   * commento sopra descrive, non la mancanza di una coda.
   * `withExclusiveTransactionAsync` da' invece a `txn` una connessione
   * dedicata, separata da questa: mentre e' aperta, OGNI chiamata (della
   * transazione stessa o di codice indipendente che tocca il database nel
   * frattempo) la esegue su quella connessione invece che sulla principale.
   *
   * E' la stessa idea della vecchia bandiera "busy", corretta nel punto che
   * la rendeva pericolosa: prima bypassava la coda per rilanciare la
   * chiamata sulla connessione PRINCIPALE, cioe' esattamente la corsa che
   * questo file esiste per evitare. Instradarla sulla connessione della
   * transazione invece la accoda comunque (dietro le chiamate della
   * transazione, in ordine di arrivo), ma senza toccare `enqueue`: la
   * transazione stessa la chiama da dentro il proprio callback, e mettersi in
   * coda li' sarebbe uno stallo vero - la promessa esterna non si risolve
   * finche' il callback non finisce, e il callback aspetta proprio queste
   * chiamate.
   */
  let activeTx: Omit<LocalDatabase, "withTransactionAsync" | "closeAsync"> | null =
    null;

  return {
    execAsync: (sql) =>
      activeTx ? activeTx.execAsync(sql) : enqueue(() => outer.execAsync(sql)),
    getAllAsync: (sql, params) =>
      activeTx
        ? activeTx.getAllAsync(sql, params)
        : enqueue(() => outer.getAllAsync(sql, params)),
    getFirstAsync: (sql, params) =>
      activeTx
        ? activeTx.getFirstAsync(sql, params)
        : enqueue(() => outer.getFirstAsync(sql, params)),
    runAsync: (sql, params) =>
      activeTx
        ? activeTx.runAsync(sql, params)
        : enqueue(() => outer.runAsync(sql, params)),
    /**
     * Una transazione annidata (chiamata da dentro `fn`) passerebbe di qui con
     * `activeTx` gia' impostato: `enqueue` la mette in coda dietro se stessa e
     * si blocca per sempre. SQLite non regge comunque le transazioni annidate,
     * quindi e' un errore di chi chiama, non un caso da gestire - fallisce
     * subito invece di restare appesa senza dire niente.
     */
    withTransactionAsync: (fn) => {
      if (activeTx) {
        return Promise.reject(
          new Error("[db] una transazione non puo' aprirne un'altra"),
        );
      }
      return enqueue(() =>
        db.withExclusiveTransactionAsync(async (txn) => {
          activeTx = bindRaw(txn);
          try {
            await fn();
          } finally {
            activeTx = null;
          }
        }),
      );
    },
    closeAsync: () => enqueue(() => db.closeAsync()),
  };
}
