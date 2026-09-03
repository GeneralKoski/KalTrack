import { getDb } from "@/src/db/index";
import { MIGRATIONS, runMigrations } from "@/src/db/migrations";
import { resetSyncMarkers } from "@/src/services/syncMarkers";
import { logger } from "@/src/utils/logger";

export const BACKUP_FORMAT_VERSION = 1;

/**
 * TUTTE le tabelle, in ordine di dipendenza: si inserisce in quest'ordine e si
 * svuota nell'ordine inverso, così le foreign key reggono in entrambi i versi.
 *
 * L'elenco deve restare completo. Quando ne mancavano sedici su ventisette il
 * backup era una trappola: prometteva "l'unico modo per non perdere tutto" e
 * si portava via solo il diario, lasciando fuori palestra, misure, acqua,
 * piano pasti, traguardi e promemoria. Peggio ancora, cancellare
 * `foods` senza toccare `meal_plan_entries` faceva fallire il ripristino con
 * una violazione di foreign key: bastava una riga di piano pasti perché il
 * backup non si potesse più ripristinare affatto.
 *
 * Chi aggiunge una tabella in una migrazione la aggiunge anche qui. Il test
 * `backup.test.ts` confronta questo elenco con lo schema reale e fallisce se
 * qualcuno se ne dimentica.
 */
export const BACKUP_TABLES = [
  // Senza dipendenze.
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
  "progress_photos",
  "achievements",
  "reminders",
  "ai_calls",
  "app_logs",
  // Dipendenti, dai padri ai figli.
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

export interface BackupPayload {
  formatVersion: number;
  exportedAt: string;
  /** Versione dello schema al momento dell'export. */
  schemaVersion: number;
  tables: Record<string, Record<string, unknown>[]>;
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupFormatError";
  }
}

const latestSchemaVersion = (): number =>
  MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Dump completo del database. Include anche le righe cancellate logicamente:
 * un backup deve essere fedele allo stato, non una versione ripulita.
 */
export async function buildBackup(): Promise<BackupPayload> {
  const db = await getDb();
  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );

  const tables: BackupPayload["tables"] = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${table}`,
    );
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: versionRow?.user_version ?? 0,
    tables,
  };
}

/**
 * Ripristina un backup SOSTITUENDO i dati attuali.
 *
 * La fusione non è un'opzione: due database con gli stessi id ma valori diversi
 * non hanno una risoluzione ovvia, e "sostituisci" è l'unica semantica che fa
 * il giro completo in modo prevedibile (export, restore, export dà lo stesso
 * contenuto). L'interfaccia lo dice chiaramente prima di procedere.
 */
export async function restoreBackup(payload: BackupPayload): Promise<void> {
  if (payload.schemaVersion > latestSchemaVersion()) {
    throw new BackupFormatError(
      "Il backup arriva da una versione più recente dell'app",
    );
  }

  const db = await getDb();

  await db.withTransactionAsync(async () => {
    // Svuota in ordine inverso alle dipendenze.
    for (const table of [...BACKUP_TABLES].reverse()) {
      await db.execAsync(`DELETE FROM ${table}`);
    }

    for (const table of BACKUP_TABLES) {
      const rows = payload.tables[table] ?? [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (columns.length === 0) continue;
        const placeholders = columns.map(() => "?").join(", ");
        await db.runAsync(
          `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
          columns.map((c) => row[c] as string | number | null),
        );
      }
    }
  });

  // Un backup più vecchio va portato allo schema corrente dopo il ripristino.
  if (payload.schemaVersion < latestSchemaVersion()) {
    await runMigrations(db);
  }

  /*
   * I segnaposto della sincronizzazione NON si ripristinano.
   *
   * Stanno in `settings`, che è nel backup, quindi il ripristino rimetterebbe
   * quelli del giorno dell'export: "tutto fino a quella data è già stato
   * mandato". Ma le righe appena ripristinate sono tutte più vecchie di quella
   * data, quindi non partirebbero mai. Il server resterebbe com'era e
   * rimanderebbe giù la propria versione: chi ripristina un backup si
   * ritroverebbe un miscuglio fra i dati ripristinati e quelli che il
   * ripristino doveva sostituire.
   *
   * Azzerandoli, il database ripristinato si riconcilia da capo con il server.
   */
  await resetSyncMarkers();

  logger.info(`[backup] ripristinato (formato ${payload.formatVersion})`);
}

/** Valida un file di backup. Lancia BackupFormatError se non è utilizzabile. */
export function parseBackup(json: string): BackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BackupFormatError("Il file non è un JSON valido");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BackupFormatError("Il file non contiene un backup");
  }

  const candidate = parsed as Partial<BackupPayload>;
  if (typeof candidate.formatVersion !== "number") {
    throw new BackupFormatError("Manca la versione di formato");
  }
  if (candidate.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError(
      "Il backup arriva da una versione più recente dell'app",
    );
  }
  if (
    typeof candidate.tables !== "object" ||
    candidate.tables === null ||
    Array.isArray(candidate.tables)
  ) {
    throw new BackupFormatError("Il backup non contiene tabelle");
  }

  return {
    formatVersion: candidate.formatVersion,
    exportedAt: candidate.exportedAt ?? "",
    schemaVersion: candidate.schemaVersion ?? 0,
    tables: candidate.tables,
  };
}

/** Conteggio righe per tabella, per l'anteprima prima di un ripristino. */
export function backupSummary(payload: BackupPayload): {
  table: string;
  rows: number;
}[] {
  return BACKUP_TABLES.map((table) => ({
    table,
    rows: payload.tables[table]?.length ?? 0,
  })).filter((entry) => entry.rows > 0);
}
