import { migration001 } from "@/src/db/migrations/001_initial";
import { migration002 } from "@/src/db/migrations/002_meal_types";
import { migration003 } from "@/src/db/migrations/003_name_norm";
import type { Migration } from "@/src/db/migrations/types";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { logger } from "@/src/utils/logger";

export type { Migration };
export { MEAL_TYPE_IDS } from "@/src/db/migrations/002_meal_types";

export const MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  migration003,
];

/**
 * Applica le migrazioni mancanti in base a PRAGMA user_version e ritorna la
 * versione finale. Ogni migrazione gira in transazione: se fallisce, il DB
 * resta alla versione precedente invece che a metà.
 */
export async function runMigrations(db: LocalDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.up);
    });
    // PRAGMA non accetta parametri bind: la versione è un numero del registro
    // interno, mai un input esterno.
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    current = migration.version;
    logger.info(
      `[db] migrazione ${migration.version} (${migration.name}) applicata`,
    );
  }

  return current;
}
