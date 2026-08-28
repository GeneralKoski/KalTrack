import { nowIso } from "@/src/db/ids";
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
