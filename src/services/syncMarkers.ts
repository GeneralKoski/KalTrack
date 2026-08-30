import { getDb } from "@/src/db/index";
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
 * Impostazioni che NON viaggiano: sono stato di questo dispositivo, non dati
 * dell'utente.
 *
 * Il cursore e' il caso grave. Sincronizzandolo, ogni giro ne scriveva uno
 * nuovo da mandare al giro dopo - un ciclo che non si esaurisce mai - e
 * soprattutto il cursore di un telefono sarebbe finito sull'altro, che
 * avrebbe saltato tutte le righe arrivate prima di quel punto senza averle
 * mai ricevute.
 */
export const LOCAL_ONLY_SETTINGS = new Set([CURSOR_KEY, PUSHED_KEY]);

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
