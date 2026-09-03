import { migration001 } from "@/src/db/migrations/001_initial";
import { migration002 } from "@/src/db/migrations/002_meal_types";
import { migration003 } from "@/src/db/migrations/003_name_norm";
import { migration004 } from "@/src/db/migrations/004_ai_calls";
import { migration005 } from "@/src/db/migrations/005_gym";
import { migration006 } from "@/src/db/migrations/006_achievements";
import { migration007 } from "@/src/db/migrations/007_wellbeing";
import { migration008 } from "@/src/db/migrations/008_planning";
import { migration009 } from "@/src/db/migrations/009_app_logs";
import { migration010 } from "@/src/db/migrations/010_entry_components";
import { migration011 } from "@/src/db/migrations/011_capitalize_meal_types";
import { migration012 } from "@/src/db/migrations/012_reminder_label";
import { migration013 } from "@/src/db/migrations/013_reminder_position";
import { migration014 } from "@/src/db/migrations/014_sync_updated_at_indexes";
import { migration015 } from "@/src/db/migrations/015_ai_cached_tokens";
import { migration016 } from "@/src/db/migrations/016_meal_type_hidden";
import { migration017 } from "@/src/db/migrations/017_drop_fasting";
import { migration018 } from "@/src/db/migrations/018_exercise_photo";
import type { Migration } from "@/src/db/migrations/types";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { logger } from "@/src/utils/logger";

export { MEAL_TYPE_IDS } from "@/src/db/migrations/002_meal_types";
export type { Migration };

export const MIGRATIONS: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
  migration016,
  migration017,
  migration018,
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
