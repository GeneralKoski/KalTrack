import { getDb } from "@/src/db/index";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { logger } from "@/src/utils/logger";

/**
 * I due segnaposto della sincronizzazione, e il perche' sono due.
 *
 * `sync.cursor` e' il contatore DEL SERVER e dice cosa e' gia' stato ricevuto.
 * `sync.pushed_at` e' l'ora di QUESTO telefono e dice cosa e' gia' stato
 * mandato.
 *
 * Usarne uno solo per entrambi confrontava l'ora del server con gli
 * `updated_at` locali: con il telefono anche solo un minuto indietro rispetto
 * al server, tutte le righe scritte in quel minuto risultavano gia' inviate e
 * non partivano mai piu'. Nessun giro successivo le avrebbe recuperate.
 */
export const CURSOR_KEY = "sync.cursor";
export const PUSHED_KEY = "sync.pushed_at";

/**
 * I tre segnaposto del catalogo comune.
 *
 * Sono separati da `sync.cursor` perche' sono due flussi diversi: quello e' il
 * contatore della copia dei dati dell'utente, questi sono la posizione dentro
 * un elenco che il server pubblica per tutti. Azzerare l'uno non deve
 * azzerare l'altro.
 *
 * I due cursori sono JSON, `{"since":...,"afterId":...}`, perche' il cursore
 * del catalogo e' una coppia: i timestamp del server hanno la risoluzione del
 * secondo e `catalog:seed` scrive duecento righe nello stesso secondo.
 */
export const CATALOG_EXERCISES_CURSOR = "catalog.exercises_cursor";
export const CATALOG_FOODS_CURSOR = "catalog.foods_cursor";
/** L'ora dell'ultimo pull su QUESTO telefono, per la finestra del task 8. */
export const CATALOG_PULLED_AT = "catalog.pulled_at";

/**
 * L'ULTIMO VALORE NOTO di `users.ai_enabled`, non la verita' del momento.
 *
 * `accountStore.profile` non e' persistito - solo il token sta in SecureStore
 * - quindi offline il profilo e' `null` e con lui sparirebbe anche il diritto
 * di chi paga, proprio in palestra dove il segnale manca. Questo segnaposto
 * tiene l'ultima risposta di `/api/me`, cosi' `aiAvailable()` ha qualcosa da
 * leggere anche senza rete.
 */
export const AI_ENABLED = "ai.enabled";

/**
 * Impostazioni che NON viaggiano: sono stato di questo dispositivo, non dati
 * dell'utente.
 *
 * Il cursore e' il caso grave. Sincronizzandolo, ogni giro ne scriveva uno
 * nuovo da mandare al giro dopo - un ciclo che non si esaurisce mai - e
 * soprattutto il cursore di un telefono sarebbe finito sull'altro, che
 * avrebbe saltato tutte le righe arrivate prima di quel punto senza averle
 * mai ricevute.
 */
export const LOCAL_ONLY_SETTINGS = new Set([
  CURSOR_KEY,
  PUSHED_KEY,
  /*
   * Le altre sono frasi su QUESTO telefono, e su un altro sarebbero false.
   *
   * "L'ultima sincronizzazione dei passi e' andata a buon fine" dice che il
   * collegamento a Health Connect funziona: su un telefono dove non e' nemmeno
   * configurato e' una bugia, e l'utente non capirebbe perche' i passi non
   * arrivano. Stesso discorso per l'interruttore dell'importazione e per la
   * data dell'ultimo backup esportato, che e' un file su questo dispositivo.
   *
   * `plan_applied:<data>` invece NON e' qui, ed e' voluto: dice che il piano
   * di quel giorno e' gia' stato trasformato in pasti. E' un fatto sui dati,
   * non sul telefono, e senza sincronizzarlo l'altro dispositivo lo
   * applicherebbe una seconda volta duplicando i pasti.
   */
  "health.steps_import_enabled",
  "health.steps_last_sync",
  "last_backup_export",
  /*
   * `onboarding_step` dice a che punto e' arrivato il wizard SU QUESTO
   * telefono: e' come si riprende un abbandono a meta', non un fatto sui
   * dati. `onboarding_completed` invece NON e' qui, apposta: dice che il
   * profilo e' stato compilato, ed e' quello che deve viaggiare perche' un
   * secondo dispositivo sullo stesso account non lo richieda daccapo.
   */
  "onboarding_step",
  /*
   * I segnaposto del catalogo dicono a che punto e' arrivato QUESTO telefono
   * a leggere un elenco che il server pubblica per tutti. Sincronizzarli
   * porterebbe la posizione di un telefono sull'altro, che salterebbe le voci
   * arrivate prima di quel punto senza averle mai ricevute - lo stesso danno
   * che `sync.cursor` fa quando viaggia.
   */
  CATALOG_EXERCISES_CURSOR,
  CATALOG_FOODS_CURSOR,
  CATALOG_PULLED_AT,
  /*
   * L'autorita' su questo fatto e' il SERVER, non questo telefono: e'
   * `users.ai_enabled` letto da `/api/me`. Sincronizzarlo lo farebbe
   * rimbalzare fra due copie che non decidono niente - esattamente il
   * problema che i segnaposto del catalogo risolvono per la stessa ragione.
   */
  AI_ENABLED,
]);

/**
 * Il segnaposto salvato, letto come numero.
 *
 * Le versioni precedenti ci scrivevano una data ISO. Passata al server nuovo,
 * `(int) "2026-08-29T18:00:00+00:00"` vale 2026: un numero di sequenza
 * plausibile, con cui il telefono salterebbe in silenzio le prime duemila
 * righe. Un valore che non e' un numero riparte da zero, che al massimo costa
 * una sincronizzazione completa.
 */
export const readCursor = (stored: string | null): number => {
  if (stored === null) return 0;
  return /^\d+$/.test(stored) ? Number(stored) : 0;
};

/**
 * Dimentica a che punto eravamo.
 *
 * Va chiamata a ogni accesso, e non e' una pulizia di cortesia. I segnaposto
 * valgono per UN account: il cursore e' la posizione dentro il contatore di
 * quel server per quell'utente. Entrando con un altro account, un cursore a
 * 406 chiede "le righe dopo la 406" a un contatore che riparte da 1, e la
 * risposta e' vuota: i dati del nuovo account non arrivano MAI, e sullo
 * schermo non compare nessun errore perche' dal punto di vista dell'app non
 * c'e' niente di nuovo.
 *
 * `sync.pushed_at` fa il danno speculare: le righe gia' mandate al vecchio
 * account risultano mandate anche al nuovo, che quindi non le riceve.
 *
 * Anche rientrando nello stesso account si riparte da zero. Costa una
 * riconciliazione completa - che e' idempotente, vince sempre la copia piu'
 * recente - e in cambio non serve indovinare se l'account e' lo stesso.
 */
export async function resetSyncMarkers(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM settings WHERE key IN (?, ?)", [
    CURSOR_KEY,
    PUSHED_KEY,
  ]);
  // La riconciliazione completa che segue e' voluta: senza questa riga nel
  // log sembrerebbe un difetto.
  logger.info("[sync] segnaposto azzerati: si riparte dall'inizio");
}

/**
 * L'ultimo `aiEnabled` visto da `/api/me`, o `null` se non si sa ancora.
 *
 * Non lancia mai: la legge `aiAvailable()` per decidere se mostrare un
 * comando o la pagina dei piani, e un errore di lettura non deve spegnere
 * quel comando a chi ha diritto - deve solo farlo ragionare con l'ultimo
 * valore che ha, cioe' "non lo so".
 */
export async function readAiEnabled(): Promise<boolean | null> {
  try {
    const stored = await getSetting(AI_ENABLED);
    if (stored === null) return null;
    return stored === "1";
  } catch (error) {
    logger.warn("[ai] lettura del diritto salvato fallita", error);
    return null;
  }
}

/** Scrive l'ultima risposta del server. Va chiamata a ogni `/api/me` riuscito. */
export async function writeAiEnabled(value: boolean): Promise<void> {
  await setSetting(AI_ENABLED, value ? "1" : "0");
}
