import { apiRequest } from "@/src/api/client";
import { API_URL, hasBackend } from "@/src/api/config";
import { orphanPhotoNames } from "@/src/db/queries/photos";
import { PHOTOS_DIR } from "@/src/services/photoStorage";
import { useAccountStore } from "@/src/stores/accountStore";
import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";

/**
 * I file delle foto, che la sincronizzazione delle righe non porta con se'.
 *
 * `sync_records` copia le righe, e una riga con foto contiene un percorso: sul
 * secondo telefono quel percorso non ha niente dietro. Finora l'immagine
 * risultava rotta e nessuno diceva perche'.
 *
 * L'identita' di una foto e' il suo NOME, non il percorso: la cartella
 * dell'app cambia fra sistemi, il nome no. Il file locale si ricava dal nome,
 * quindi non serve nessuna tabella che tenga la corrispondenza - e soprattutto
 * non serve sincronizzarla.
 */

/** Il nome, cioe' l'ultima parte del percorso. */
export const nameOf = (uri: string): string =>
  uri.slice(uri.lastIndexOf("/") + 1);

/** Dove vive, o dovrebbe vivere, su QUESTO telefono. */
export const localPathOf = (name: string): string => `${PHOTOS_DIR}/${name}`;

const exists = async (uri: string): Promise<boolean> => {
  try {
    return (await FileSystem.getInfoAsync(uri)).exists;
  } catch {
    return false;
  }
};

/**
 * Scarica la foto se qui non c'e', e ritorna il percorso locale.
 *
 * Ritorna null quando non si puo' avere: senza account, senza rete, o perche'
 * il telefono che l'ha scattata non l'ha ancora caricata. Chi chiama mostra il
 * segnaposto, che e' la verita': la foto esiste, non e' (ancora) qui.
 */
export async function ensureLocalPhoto(uri: string): Promise<string | null> {
  if (!uri) return null;

  const name = nameOf(uri);
  const local = localPathOf(name);

  if (await exists(local)) return local;
  if (!hasBackend()) return null;

  const token = useAccountStore.getState().token;
  if (!token) return null;

  try {
    const result = await FileSystem.downloadAsync(
      `${API_URL}/images/${encodeURIComponent(name)}`,
      local,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (result.status !== 200) {
      // Un 404 e' normale: il telefono d'origine non l'ha ancora caricata.
      // Il file scritto a meta' va tolto, o la prossima volta lo troveremmo
      // "esistente" e mostreremmo dei byte che non sono un'immagine.
      await FileSystem.deleteAsync(local, { idempotent: true });
      return null;
    }
    return local;
  } catch (error) {
    logger.warn(`[foto] scaricamento non riuscito: ${name}`, error);
    await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
    return null;
  }
}

/**
 * Manda al server le foto che non ci sono ancora.
 *
 * Chiede prima l'elenco invece di tenere in locale la lista di quel che ha
 * gia' caricato: una lista da mantenere e' una cosa che si puo' disallineare,
 * e con poche decine di foto la domanda costa una richiesta sola.
 *
 * Non solleva mai. Le foto sono un extra della sincronizzazione: se non
 * partono, i dati sono comunque al sicuro e si riprova al giro dopo.
 */
export async function uploadPendingPhotos(): Promise<number> {
  try {
    if (!hasBackend()) return 0;
    if (!useAccountStore.getState().token) return 0;

    const dir = await FileSystem.getInfoAsync(PHOTOS_DIR);
    if (!dir.exists) return 0;

    const locali = await FileSystem.readDirectoryAsync(PHOTOS_DIR);
    if (locali.length === 0) return 0;

    const { names } = await apiRequest<{ names: string[] }>({
      method: "get",
      path: "/images",
    });
    const gia = new Set(names);

    let inviate = 0;
    for (const name of locali) {
      if (gia.has(name)) continue;
      if (await uploadOne(name)) inviate++;
    }

    if (inviate > 0) logger.info(`[foto] caricate ${inviate}`);
    return inviate;
  } catch (error) {
    logger.warn("[foto] caricamento non riuscito", error);
    return 0;
  }
}

async function uploadOne(name: string): Promise<boolean> {
  const token = useAccountStore.getState().token;
  if (!token) return false;

  try {
    const result = await FileSystem.uploadAsync(
      `${API_URL}/images`,
      localPathOf(name),
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "file",
        parameters: { name },
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      },
    );
    // 422 vuol dire che il server l'ha rifiutata - troppo grande, di solito -
    // e riprovarla a ogni giro sarebbe lavoro sprecato all'infinito. Si annota
    // e si va avanti: la riga c'e' comunque, manca solo l'immagine.
    if (result.status === 201) return true;
    logger.warn(`[foto] ${name} rifiutata dal server (${result.status})`);
    return false;
  } catch (error) {
    logger.warn(`[foto] invio non riuscito: ${name}`, error);
    return false;
  }
}

/**
 * Toglie le foto che non appartengono piu' a niente, qui e sul server.
 *
 * Cancellare una foto dei progressi o una voce del diario non portava via il
 * file: nessuno lo referenziava e nessuno lo cancellava. In locale erano
 * decine di megabyte di immagini fantasma dentro il backup del telefono; sul
 * server `storage/app/private/images` cresceva e non scendeva mai.
 *
 * **Il criterio e' "a cosa serviva", non "chi ce l'ha".** La differenza fra
 * quel che il server tiene e quel che c'e' su questo telefono non e' un elenco
 * di orfani: una foto scattata su un altro dispositivo sta sul server e qui non
 * e' ancora arrivata, e cancellarla distruggerebbe l'unica copia. Si guardano
 * invece le righe (`orphanPhotoNames`), che questo telefono conosce per certo.
 *
 * **Prima il file locale, poi quello remoto.** Nell'altro ordine, un
 * interruzione fra i due passaggi lascerebbe qui un file che nessuna riga
 * nomina, e `uploadPendingPhotos` - che manda tutto quel che trova in cartella
 * - lo ricaricherebbe al giro dopo: una foto cancellata e rimessa all'infinito.
 * Cosi' invece il caso peggiore e' un orfano che resta sul server fino al giro
 * successivo.
 *
 * Non solleva mai, come tutto il resto di questo modulo: e' pulizia, e i dati
 * sono comunque al sicuro.
 */
export async function collectOrphanPhotos(): Promise<number> {
  try {
    const orfane = await orphanPhotoNames();
    if (orfane.length === 0) return 0;

    let tolte = 0;
    const remoti = await remoteNames();

    for (const name of orfane) {
      await FileSystem.deleteAsync(localPathOf(name), {
        idempotent: true,
      }).catch(() => {});

      if (!remoti.has(name)) {
        tolte++;
        continue;
      }
      try {
        await apiRequest({
          method: "delete",
          path: `/images/${encodeURIComponent(name)}`,
        });
        tolte++;
      } catch (error) {
        // Il file locale e' comunque andato: il giro dopo `orphanPhotoNames`
        // la ritrova e riprova a togliere quella remota.
        logger.warn(`[foto] ${name} non cancellata dal server`, error);
      }
    }

    if (tolte > 0) logger.info(`[foto] rimosse ${tolte} orfane`);
    return tolte;
  } catch (error) {
    logger.warn("[foto] raccolta delle orfane non riuscita", error);
    return 0;
  }
}

/**
 * Cosa tiene il server, o un insieme vuoto se non c'e' un server da chiedere.
 *
 * Senza account le foto orfane si tolgono comunque da qui: il file locale non
 * serve a niente in nessun caso.
 */
async function remoteNames(): Promise<Set<string>> {
  if (!hasBackend()) return new Set();
  if (!useAccountStore.getState().token) return new Set();

  try {
    const { names } = await apiRequest<{ names: string[] }>({
      method: "get",
      path: "/images",
    });
    return new Set(names);
  } catch (error) {
    logger.warn("[foto] elenco remoto non leggibile", error);
    return new Set();
  }
}
