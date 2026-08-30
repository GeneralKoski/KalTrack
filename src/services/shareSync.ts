import { hasBackend } from "@/src/api/config";
import * as social from "@/src/api/social";
import { getDayDiary } from "@/src/db/queries/diary";
import { getSteps, getWeight } from "@/src/db/queries/tracking";
import {
  dailyExerciseSummary,
  recentSessions,
} from "@/src/db/queries/workouts";
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

/**
 * Una settimana: abbastanza per un profilo, poco per essere un archivio.
 *
 * E' il DEFAULT, non piu' la regola: la finestra la sceglie l'utente e arriva
 * dal profilo (`shares.windowDays`). Questo valore serve quando il profilo non
 * ne porta uno, e non deve mai diventare "tutto".
 */
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
 * I giorni di palestra da pubblicare.
 *
 * A interruttore spento torna una lista VUOTA e non i giorni senza esercizi:
 * mandare giorni vuoti sarebbe comunque dire qualcosa - "in questa settimana
 * non mi sono allenato" - a chi non ha il permesso di saperlo.
 *
 * Acceso, un giorno senza esercizi parte lo stesso con la lista vuota: e'
 * l'unico modo che il telefono ha per dire "quell'allenamento non c'e' piu'".
 */
export async function buildSharedWorkoutDays(
  shares: social.AccountShares,
  options: { today?: string; days?: number } = {},
): Promise<social.SharedWorkoutDay[]> {
  if (!shares.gym) return [];

  const dates = recentDates(
    options.today ?? todayIso(),
    options.days ?? shares.windowDays ?? SHARE_WINDOW_DAYS,
  );

  const days: social.SharedWorkoutDay[] = [];
  for (const date of dates) {
    days.push({ date, exercises: await dailyExerciseSummary(date) });
  }

  return days;
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
    /*
     * Con tutto spento non c'e' niente da mandare, e mandare righe di soli
     * null riempirebbe il server di giorni vuoti.
     *
     * Non e' una scorciatoia che lascia dati indietro: quel che era gia' stato
     * pubblicato lo cancella il server nel momento in cui si spegne
     * l'interruttore (`ProfileController::forgetUnsharedStats`). Deve stare
     * di la' proprio perche' di qua, a condivisioni spente, non passa piu'
     * niente.
     */
    if (
      !shares.calories &&
      !shares.steps &&
      !shares.weight &&
      !shares.workouts &&
      !shares.gym
    ) {
      return null;
    }

    const giorni = shares.windowDays ?? SHARE_WINDOW_DAYS;
    let synced = 0;

    if (shares.calories || shares.steps || shares.weight || shares.workouts) {
      const days = await buildSharedDays(shares, { days: giorni });
      synced += (await social.syncSharedStats(days)).synced;
    }

    /*
     * La palestra viaggia a parte perche' e' un'altra promessa: i totali sono
     * quattro numeri, questi sono quali esercizi si fanno e con che carico.
     * Due endpoint vuol dire anche che il server puo' rifiutare questo senza
     * rifiutare quelli.
     */
    if (shares.gym) {
      const workouts = await buildSharedWorkoutDays(shares, { days: giorni });
      if (workouts.length > 0) {
        synced += (await social.syncSharedWorkouts(workouts)).synced;
      }
    }

    return synced;
  } catch (error) {
    logger.warn("[social] pubblicazione dei totali non riuscita", error);
    return null;
  }
}
