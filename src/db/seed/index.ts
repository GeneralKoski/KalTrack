import { nowIso } from "@/src/db/ids";
import { SEED_EXERCISES } from "@/src/db/seed/exercises";
import { SEED_FOODS } from "@/src/db/seed/foods";
import {
  SEED_EQUIPMENT_TYPES,
  SEED_MUSCLE_GROUPS,
} from "@/src/db/seed/taxonomies";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { normalizeText } from "@/src/domain/text";
import { logger } from "@/src/utils/logger";

/** Una riga di `muscle_groups`/`equipment_types`: stessa forma di `TaxonomyRow`,
 * senza importarlo - vedi il commento su `applyTaxonomySeeds` per il perche'. */
interface TaxonomySeedRow {
  slug: string;
  label_it: string;
  label_en: string;
  sort: number;
  deleted_at: null;
}

/**
 * Inserisce gli alimenti di seed mancanti. Gli id sono stabili, quindi la
 * funzione è idempotente e gira a ogni avvio.
 *
 * Non aggiorna e non resuscita le righe già presenti: se l'utente ha corretto
 * un valore o cancellato un alimento, la sua scelta vince sul seed.
 *
 * Riceve la connessione invece di chiamare getDb(): altrimenti db/index e
 * db/seed si importerebbero a vicenda (require cycle).
 */
export async function applySeeds(db: LocalDatabase): Promise<void> {
  const existing = await db.getAllAsync<{ id: string }>("SELECT id FROM foods");
  const present = new Set(existing.map((r) => r.id));
  const missing = SEED_FOODS.filter((food) => !present.has(food.id));
  if (missing.length === 0) return;

  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (const food of missing) {
      const n = food.nutrients;
      await db.runAsync(
        `INSERT INTO foods (
           id, name, name_norm, source,
           kcal, protein, carbs, sugars, fat, saturated_fat, fiber, salt,
           is_liquid, default_serving_g, serving_label,
           is_favorite, usage_count, is_estimated, created_at, updated_at
         ) VALUES (?, ?, ?, 'seed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
        [
          food.id,
          food.name,
          normalizeText(food.name),
          n.kcal,
          n.protein,
          n.carbs,
          n.sugars,
          n.fat,
          n.saturatedFat,
          n.fiber,
          n.salt,
          food.isLiquid ? 1 : 0,
          food.defaultServingG ?? null,
          food.servingLabel ?? null,
          now,
          now,
        ],
      );
    }
  });
  logger.info(`[db] ${missing.length} alimenti di seed inseriti`);
}

/**
 * Stessa logica del seed alimenti: id stabili, idempotente, e la scelta
 * dell'utente vince. Un esercizio vietato o cancellato non torna indietro.
 */
export async function applyExerciseSeeds(db: LocalDatabase): Promise<void> {
  const existing = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM exercises",
  );
  const present = new Set(existing.map((r) => r.id));
  const missing = SEED_EXERCISES.filter((e) => !present.has(e.id));
  if (missing.length === 0) return;

  const now = nowIso();
  await db.withTransactionAsync(async () => {
    for (const exercise of missing) {
      await db.runAsync(
        `INSERT INTO exercises (id, name, name_norm, muscle_group,
           secondary_muscles, equipment, is_custom, is_banned, dislike_level,
           instructions, usage_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, 0, ?, ?)`,
        [
          exercise.id,
          exercise.name,
          normalizeText(exercise.name),
          exercise.muscleGroup,
          JSON.stringify(exercise.secondaryMuscles),
          JSON.stringify(exercise.equipment),
          exercise.instructions,
          now,
          now,
        ],
      );
    }
  });
  logger.info(`[db] ${missing.length} esercizi di seed inseriti`);
}

/** Inserisce gli slug mancanti di UNA tabella di tassonomia. Non tocca quelli
 * gia' presenti, nemmeno se un amministratore li ha rinominati: quella scelta
 * vince sul seme, come per alimenti ed esercizi qui sopra. */
async function seedMissingTaxonomy(
  db: LocalDatabase,
  table: "muscle_groups" | "equipment_types",
  seed: readonly TaxonomySeedRow[],
): Promise<number> {
  const existing = await db.getAllAsync<{ slug: string }>(
    `SELECT slug FROM ${table}`,
  );
  const present = new Set(existing.map((r) => r.slug));
  const missing = seed.filter((row) => !present.has(row.slug));
  if (missing.length === 0) return 0;

  await db.withTransactionAsync(async () => {
    for (const row of missing) {
      await db.runAsync(
        `INSERT INTO ${table} (slug, label_it, label_en, sort, deleted_at)
         VALUES (?, ?, ?, ?, ?)`,
        [row.slug, row.label_it, row.label_en, row.sort, row.deleted_at],
      );
    }
  });
  return missing.length;
}

/**
 * Rimette gli slug di tassonomia mancanti, su entrambe le tabelle.
 *
 * La migrazione 020 li semina UNA VOLTA SOLA, alla creazione dello schema:
 * `runMigrations` e' gated su `PRAGMA user_version`, quindi quell'`up` non
 * riparte mai piu', qualunque cosa succeda a `muscle_groups`/`equipment_types`
 * dopo. Un ripristino da un backup preso prima di questa migrazione non porta
 * ne' l'una ne' l'altra tabella: `restoreBackup` le svuota comunque (sono in
 * `BACKUP_TABLES`) e reinserisce `payload.tables[table] ?? []`, cioe' niente.
 * Senza questa funzione le due tabelle restano vuote PER SEMPRE, e da quando
 * i selettori, `listAvailableEquipment` e `create_exercise` leggono la
 * tabella invece delle costanti, una tabella vuota e' una funzione morta -
 * senza account non c'e' nemmeno un pull che la ripari.
 *
 * Gira a ogni avvio (come `applySeeds`/`applyExerciseSeeds`) e subito dopo un
 * ripristino: nel caso normale trova gia' tutto e non tocca niente, quindi non
 * e' un costo in piu' per chi non ha mai perso la tassonomia.
 */
export async function applyTaxonomySeeds(db: LocalDatabase): Promise<void> {
  const gruppi = await seedMissingTaxonomy(
    db,
    "muscle_groups",
    SEED_MUSCLE_GROUPS,
  );
  const attrezzi = await seedMissingTaxonomy(
    db,
    "equipment_types",
    SEED_EQUIPMENT_TYPES,
  );
  const totale = gruppi + attrezzi;
  if (totale > 0) logger.info(`[db] ${totale} slug di tassonomia seminati`);
}
