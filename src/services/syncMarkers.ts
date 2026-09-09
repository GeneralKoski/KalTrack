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
 * Le local-only che un RIPRISTINO da backup deve dimenticare.
 *
 * `LOCAL_ONLY_SETTINGS` dice che una chiave non viaggia nella
 * sincronizzazione, e non dice niente sul backup: `settings` sta in
 * `BACKUP_TABLES` e `buildBackup` fa `SELECT *`, quindi un ripristino rimette
 * in tabella OGNI chiave del giorno dell'export. Sono due domande diverse, e
 * la seconda non aveva nessuna guardia - l'unico dei quattro cancelli delle
 * dichiarazioni senza un test, che e' la condizione che ha lasciato
 * `progress_photos` fuori dalla sincronizzazione per settimane.
 */
const FORGOTTEN_ON_RESTORE = [
  /*
   * I due della sincronizzazione, per la ragione che `resetSyncMarkers`
   * spiega: le righe appena ripristinate sono tutte piu' vecchie della data
   * dell'export, quindi con quei segnaposto in piedi non partirebbero mai.
   */
  CURSOR_KEY,
  PUSHED_KEY,
  /*
   * `ai.enabled` e' la cache di un fatto di cui il SERVER e' l'autorita' PER
   * QUELL'ACCOUNT. Il backup di A ripristinato sul telefono di B lo portava
   * con se': se A era `ai_enabled = false`, a B - che ha diritto - i punti
   * d'ingresso AI portavano alla pagina dei piani fino al primo `/api/me`
   * riuscito. E' la stessa forma del difetto corretto in `signOut`, un
   * livello piu' fuori, e la risposta e' la stessa: "non lo so" e' in favore
   * dell'utente.
   */
  AI_ENABLED,
] as const;

/**
 * Le local-only che invece SOPRAVVIVONO a un ripristino, e perche'.
 *
 * - I tre del catalogo: le righe di `exercises`/`foods` arrivano dalla stessa
 *   istantanea, quindi cursore e contenuto restano coerenti e il pull
 *   successivo chiede esattamente quel che e' cambiato dopo. Azzerarli
 *   costerebbe un pull completo per niente.
 * - Le tre frasi su questo telefono (Health Connect, ultimo backup esportato)
 *   e `onboarding_step`: un ripristino non cambia ne' il dispositivo ne'
 *   l'account, quindi restano vere quanto lo erano prima. Sono false su un
 *   ALTRO telefono, ed e' per questo che non viaggiano nella
 *   sincronizzazione: e' un backup ripristinato altrove a poterle sballare,
 *   e nessuna delle tre decide niente che l'utente non veda subito.
 */
const KEPT_ON_RESTORE = [
  "health.steps_import_enabled",
  "health.steps_last_sync",
  "last_backup_export",
  "onboarding_step",
  CATALOG_EXERCISES_CURSOR,
  CATALOG_FOODS_CURSOR,
  CATALOG_PULLED_AT,
] as const;

/**
 * Impostazioni che NON viaggiano: sono stato di questo dispositivo, o la
 * cache di un fatto di cui decide il server, non dati dell'utente.
 *
 * Il cursore e' il caso grave. Sincronizzandolo, ogni giro ne scriveva uno
 * nuovo da mandare al giro dopo - un ciclo che non si esaurisce mai - e
 * soprattutto il cursore di un telefono sarebbe finito sull'altro, che
 * avrebbe saltato tutte le righe arrivate prima di quel punto senza averle
 * mai ricevute. I tre del catalogo fanno lo stesso danno su un elenco che il
 * server pubblica per tutti; `ai.enabled` rimbalzerebbe fra due copie che
 * non decidono niente, perche' l'autorita' e' `users.ai_enabled` su
 * `/api/me`.
 *
 * Due chiavi che sembrano di qui e NON ci sono, entrambe apposta:
 * `plan_applied:<data>` dice che il piano di quel giorno e' gia' diventato
 * pasti - un fatto sui dati, e senza sincronizzarlo l'altro dispositivo lo
 * applicherebbe di nuovo duplicandoli - e `onboarding_completed` dice che il
 * profilo e' compilato, che un secondo dispositivo sullo stesso account non
 * deve richiedere daccapo.
 *
 * **E' L'UNIONE DEI DUE ELENCHI QUI SOPRA, e non un terzo elenco.** Una
 * chiave local-only nuova non puo' entrare senza che qualcuno abbia risposto
 * anche alla seconda domanda - un ripristino la deve dimenticare o tenere? -
 * che e' esattamente quel che nessuno si e' chiesto per `ai.enabled`.
 */
export const LOCAL_ONLY_SETTINGS = new Set<string>([
  ...FORGOTTEN_ON_RESTORE,
  ...KEPT_ON_RESTORE,
]);

/** Solo per il test del cancello: i due elenchi, separati. */
export const RESTORE_BUCKETS = {
  forgotten: FORGOTTEN_ON_RESTORE,
  kept: KEPT_ON_RESTORE,
} as const;

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
  await dimentica([CURSOR_KEY, PUSHED_KEY]);
  // La riconciliazione completa che segue e' voluta: senza questa riga nel
  // log sembrerebbe un difetto.
  logger.info("[sync] segnaposto azzerati: si riparte dall'inizio");
}

/**
 * Quel che un RIPRISTINO da backup non deve portarsi dietro.
 *
 * Comprende i due della sincronizzazione - per la ragione di
 * `resetSyncMarkers`, che il ripristino condivide - e `ai.enabled`, che
 * appartiene all'account che ha esportato il backup e non a chi lo
 * ripristina. Vedi `FORGOTTEN_ON_RESTORE` per il resto.
 */
export async function forgetRestoredMarkers(): Promise<void> {
  await dimentica([...FORGOTTEN_ON_RESTORE]);
  logger.info("[backup] segnaposto locali dimenticati: si riparte dall'inizio");
}

const dimentica = async (chiavi: string[]): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM settings WHERE key IN (${chiavi.map(() => "?").join(", ")})`,
    chiavi,
  );
};

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

/**
 * Scrive l'ultima risposta del server. Va chiamata a ogni `/api/me` riuscito.
 *
 * Scrive SOLO un booleano esplicito. `apiRequest` non valida la forma della
 * risposta (e' un confine di sistema - un APK piu' vecchio o piu' nuovo del
 * backend, o una risposta a cui il campo manca, arrivano qui uguali): un
 * valore che non e' `true` ne' `false` non deve diventare un "false"
 * persistito, o "non lo so ancora" collasserebbe in "no" per sempre, fino al
 * prossimo `/api/me` riuscito. Il segnaposto resta com'era.
 */
export async function writeAiEnabled(value: boolean): Promise<void> {
  if (typeof value !== "boolean") return;
  await setSetting(AI_ENABLED, value ? "1" : "0");
}

/**
 * Dimentica l'ultimo valore noto. Va chiamata da `signOut`: il valore
 * appartiene all'account che sta uscendo, e lasciarlo scritto giudicherebbe
 * il prossimo utente su un fatto che non e' il suo se il suo primo `/api/me`
 * fallisse prima di poterlo sovrascrivere.
 */
export async function clearAiEnabled(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM settings WHERE key = ?", [AI_ENABLED]);
}
