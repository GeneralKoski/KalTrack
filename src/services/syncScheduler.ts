import { runSync } from "@/src/services/sync";
import { logger } from "@/src/utils/logger";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Quando gira la sincronizzazione.
 *
 * Due momenti, e nessuno dei due e' "a ogni scrittura": segnare una serie in
 * palestra farebbe partire una richiesta ogni pochi secondi, su una rete che
 * spesso non c'e', e la batteria la pagherebbe per un vantaggio nullo. Il
 * telefono e' la fonte di verita': la copia sul server puo' avere qualche
 * minuto di ritardo senza che nessuno se ne accorga.
 *
 *  - a intervallo regolare, finche' l'app e' in primo piano;
 *  - al ritorno in primo piano, perche' e' il momento in cui e' piu' probabile
 *    che un altro dispositivo abbia scritto qualcosa nel frattempo.
 */

/** Un quarto d'ora: abbastanza raro da non pesare, abbastanza spesso da non accumulare. */
export const SYNC_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Sotto questo tempo dall'ultimo giro non se ne fa un altro.
 *
 * Serve al ritorno in primo piano: alternare due app avanti e indietro
 * scatenerebbe una sincronizzazione per ogni passaggio.
 */
const MIN_GAP_MS = 60 * 1000;

let lastRun = 0;
let running = false;

/**
 * Un giro, se ne vale la pena.
 *
 * `running` evita che due inneschi vicini (l'intervallo e il ritorno in primo
 * piano nello stesso istante) mandino due richieste che si sovrascrivono il
 * cursore a vicenda.
 */
async function runIfDue(reason: string, force = false): Promise<void> {
  const now = Date.now();
  if (running) return;
  if (!force && now - lastRun < MIN_GAP_MS) return;

  running = true;
  try {
    const result = await runSync();
    lastRun = Date.now();
    if (result && (result.pushed > 0 || result.pulled > 0)) {
      logger.info(
        `[sync] ${reason}: inviate ${result.pushed}, ricevute ${result.pulled}`,
      );
    }
  } finally {
    running = false;
  }
}

/**
 * Avvia la sincronizzazione periodica. Ritorna la funzione per fermarla.
 *
 * Chiamata una volta sola all'avvio: non e' un hook di schermata, e legarla a
 * una schermata la farebbe partire e fermare a ogni navigazione.
 */
export function startSyncScheduler(): () => void {
  void runIfDue("avvio", true);

  const timer = setInterval(() => {
    void runIfDue("periodica");
  }, SYNC_INTERVAL_MS);

  const onChange = (state: AppStateStatus) => {
    if (state === "active") void runIfDue("ritorno in primo piano");
  };
  const subscription = AppState.addEventListener("change", onChange);

  return () => {
    clearInterval(timer);
    subscription.remove();
  };
}

/** Azzera lo stato del programmatore. Solo per i test. */
export function __resetSchedulerForTesting(): void {
  lastRun = 0;
  running = false;
}
