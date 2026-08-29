import { hasBackend } from "@/src/api/config";
import * as social from "@/src/api/social";
import { getDayDiary } from "@/src/db/queries/diary";
import { getSteps, getWeight } from "@/src/db/queries/tracking";
import { recentSessions } from "@/src/db/queries/workouts";
import { recentDates } from "@/src/services/healthConnect";
import { todayIso } from "@/src/domain/date";
import { useAccountStore } from "@/src/stores/accountStore";
import { logger } from "@/src/utils/logger";

/**
 * Pubblica sul server i totali dei giorni recenti.
 *
 * MANDA SOLO QUEL CHE L'UTENTE HA SCELTO DI CONDIVIDERE. Il filtro sta qui,
 * sul telefono, e non solo sul server: un dato che non deve essere visto non
 * deve nemmeno partire. Il server ha il suo controllo perche' due difese
 * valgono piu' di una, ma questa e' la prima.
 *
 * Il diario non parte mai: partono i totali di giornata. Cosa si e' mangiato
 * resta sul telefono, dove e' sempre stato.
 */

/** Una settimana: abbastanza per un profilo, poco per essere un archivio. */
export const SHARE_WINDOW_DAYS = 7;

export async function buildSharedDays(
  shares: social.AccountShares,
  options: { today?: string; days?: number } = {},
): Promise<social.SharedDay[]> {
  const dates = recentDates(
    options.today ?? todayIso(),
    options.days ?? SHARE_WINDOW_DAYS,
  );

  const rows: social.SharedDay[] = [];
  for (const date of dates) {
    // Null e non zero per quel che non si condivide: sul server "non
    // condiviso" e "non registrato" restano indistinguibili, ed e' giusto
    // cosi', ma nessuno dei due deve diventare uno zero.
    const day: social.SharedDay = {
      date,
      kcal: null,
      steps: null,
      weightKg: null,
      workouts: null,
    };

    if (shares.calories) {
      const diary = await getDayDiary(date);
      day.kcal = Math.round(diary.totals.kcal);
    }
    if (shares.steps) {
      day.steps = (await getSteps(date))?.steps ?? null;
    }
    if (shares.weight) {
      day.weightKg = (await getWeight(date))?.weight_kg ?? null;
    }
    if (shares.workouts) {
      const sessions = await recentSessions(50);
      day.workouts = sessions.filter((s) => s.date === date).length;
    }

    rows.push(day);
  }

  return rows;
}

/**
 * Pubblica, se c'e' un account e qualcosa da condividere.
 *
 * Non solleva mai: la sincronizzazione con gli amici non deve poter rompere
 * l'avvio di un'app che senza il server funziona benissimo.
 */
export async function syncSharedStats(): Promise<number | null> {
  try {
    if (!hasBackend()) return null;

    const { token, profile } = useAccountStore.getState();
    if (!token || !profile) return null;

    const shares = profile.shares;
    // Con tutto spento non c'e' niente da mandare, e mandare righe di soli
    // null riempirebbe il server di giorni vuoti.
    if (!shares.calories && !shares.steps && !shares.weight && !shares.workouts) {
      return null;
    }

    const days = await buildSharedDays(shares);
    const result = await social.syncSharedStats(days);
    return result.synced;
  } catch (error) {
    logger.warn("[social] pubblicazione dei totali non riuscita", error);
    return null;
  }
}
