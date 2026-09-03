import { syncAchievements } from "@/src/db/queries/achievements";
import type { UnlockedAchievement } from "@/src/domain/achievements";
import { i18n } from "@/src/i18n";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";

/**
 * Valuta i traguardi e avvisa se qualcuno si e' appena sbloccato.
 *
 * Prima girava solo dentro AchievementsScreen: un traguardo raggiunto altrove
 * nell'app (dall'assistente, o tornando su Oggi dopo un'azione manuale su
 * un'altra scheda) non lo diceva finche' non si apriva quella schermata.
 * `syncAchievements` e' idempotente, quindi chiamarla da piu' punti e' sicuro.
 */
export async function checkAchievements(): Promise<UnlockedAchievement[]> {
  try {
    const fresh = await syncAchievements();
    if (fresh.length > 0) {
      showToast.success({
        title: i18n.t("achievements.new_unlocked", { count: fresh.length }),
      });
    }
    return fresh;
  } catch (error) {
    logger.warn("[achievements] controllo traguardi fallito", error);
    return [];
  }
}
