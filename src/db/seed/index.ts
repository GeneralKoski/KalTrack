import { nowIso } from "@/src/db/ids";
import { SEED_EXERCISES } from "@/src/db/seed/exercises";
import { SEED_FOODS } from "@/src/db/seed/foods";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { normalizeText } from "@/src/domain/text";
import { logger } from "@/src/utils/logger";

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
          exercise.instructions ?? null,
          now,
          now,
        ],
      );
    }
  });
  logger.info(`[db] ${missing.length} esercizi di seed inseriti`);
}
