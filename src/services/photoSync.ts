import { apiRequest } from "@/src/api/client";
import { API_URL, hasBackend } from "@/src/api/config";
import {
  orphanPhotoUris,
  referencedPhotoUris,
} from "@/src/db/queries/photos";
import { CATALOG_PHOTOS_DIR, PHOTOS_DIR } from "@/src/services/photoStorage";
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

/** Dove vive, o dovrebbe vivere, una foto del catalogo su QUESTO telefono. */
export const catalogPhotoPath = (name: string): string =>
  `${CATALOG_PHOTOS_DIR}/${name}`;

const isCatalogPhoto = (uri: string): boolean =>
  uri.startsWith(CATALOG_PHOTOS_DIR);

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
  /*
   * La cartella dell'uri decide dove cercare e a chi chiedere.
   *
   * Una foto di catalogo sta in `storage/app/private/catalog/` sul server, non
   * sotto `images/{utente}`: e' comune a tutti gli iscritti, e il percorso per
   * utente la renderebbe di uno solo. Chiederla a `/images` sarebbe un 404
   * garantito, e il segnaposto resterebbe per sempre senza che niente lo
   * dicesse.
   */
  const catalogo = isCatalogPhoto(uri);
  const local = catalogo ? catalogPhotoPath(name) : localPathOf(name);
  const endpoint = catalogo
    ? `${API_URL}/catalog/images/${encodeURIComponent(name)}`
    : `${API_URL}/images/${encodeURIComponent(name)}`;

  if (await exists(local)) return local;
  if (!hasBackend()) return null;

  const token = useAccountStore.getState().token;
  if (!token) return null;

  try {
    if (catalogo) {
      // A differenza di `PHOTOS_DIR`, nessun `persistPhoto` scrive mai in
      // questa cartella: senza questa riga il primo scaricamento di una foto
      // di catalogo su un telefono nuovo troverebbe la cartella assente e
      // fallirebbe.
      await FileSystem.makeDirectoryAsync(CATALOG_PHOTOS_DIR, {
        intermediates: true,
      }).catch(() => {});
    }

    const result = await FileSystem.downloadAsync(endpoint, local, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (result.status !== 200) {
      // Un 404 e' normale: il telefono d'origine non l'ha ancora caricata, o
      // il gestionale non ha ancora messo la foto su quella voce di catalogo.
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
 * invece le righe (`orphanPhotoUris`), che questo telefono conosce per certo.
 *
 * **Prima il file locale, poi quello remoto.** Nell'altro ordine, un
 * interruzione fra i due passaggi lascerebbe qui un file che nessuna riga
 * nomina, e `uploadPendingPhotos` - che manda tutto quel che trova in cartella
 * - lo ricaricherebbe al giro dopo: una foto cancellata e rimessa all'infinito.
 * Cosi' invece il caso peggiore e' un orfano che resta sul server fino al giro
 * successivo.
 *
 * **DUE RACCOLTE E NON UNA**, perche' le due cartelle non si raccolgono con lo
 * stesso criterio (vedi le due funzioni sotto). Ognuna incassa i propri
 * errori: un guasto nella prima non deve nascondere la seconda.
 *
 * Non solleva mai, come tutto il resto di questo modulo: e' pulizia, e i dati
 * sono comunque al sicuro.
 */
export async function collectOrphanPhotos(): Promise<number> {
  let tolte = 0;

  try {
    tolte += await raccogliDelleRighe();
  } catch (error) {
    logger.warn("[foto] raccolta delle orfane non riuscita", error);
  }

  try {
    tolte += await raccogliDelCatalogo();
  } catch (error) {
    logger.warn("[foto] raccolta delle foto di catalogo non riuscita", error);
  }

  if (tolte > 0) logger.info(`[foto] rimosse ${tolte} orfane`);
  return tolte;
}

/**
 * Le foto dell'utente: quelle che una riga cancellata nominava e che nessuna
 * riga viva nomina piu', qui e sul server.
 *
 * I percorsi di catalogo si scartano, e non e' una cautela: appartengono a
 * un'altra cartella e a un'altra domanda. Prima non si scartavano, e il
 * risultato era `PHOTOS_DIR/<nome di catalogo>` cancellato - un no-op, la
 * cartella e' un'altra - contato comunque fra le rimosse, perche' quel nome
 * non compare nell'elenco `/images` dell'utente. `[foto] rimosse N orfane`
 * contava foto che non aveva rimosso.
 */
async function raccogliDelleRighe(): Promise<number> {
  const orfane = (await orphanPhotoUris()).filter((uri) => !isCatalogPhoto(uri));
  if (orfane.length === 0) return 0;

  let tolte = 0;
  const remoti = await remoteNames();

  for (const uri of orfane) {
    const name = nameOf(uri);
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
      // Il file locale e' comunque andato: il giro dopo `orphanPhotoUris`
      // la ritrova e riprova a togliere quella remota.
      logger.warn(`[foto] ${name} non cancellata dal server`, error);
    }
  }

  return tolte;
}

/**
 * Le foto del catalogo, e il criterio e' un altro: si tolgono quelle che
 * **nessuna riga nomina piu'**, cancellata o viva.
 *
 * Non erano raccolte affatto, ed e' il buco che F6 della review finale ha
 * trovato. Una foto di catalogo non e' orfana perche' l'utente ha cancellato
 * l'esercizio: e' ancora la foto di quella voce per tutti gli altri, e la
 * riga cancellata continua a nominarla - se l'utente la ripristinasse, la
 * vorrebbe vedere. Diventa inutile quando il **pannello** la sostituisce o la
 * toglie: il pull scrive il `photo_uri` nuovo (o `null`) su una riga viva, e
 * il file vecchio resta in cartella senza che niente lo nomini piu'.
 *
 * **Solo in locale, nessun DELETE al server.** Il file sta in
 * `storage/app/private/catalog/`, comune a tutti gli iscritti: cancellarlo di
 * la' lo porterebbe via a tutti, e non e' una decisione che un telefono
 * prende. La rotta per farlo non c'e' nemmeno.
 *
 * Nessun ordine da rispettare con il caricamento: `uploadPendingPhotos` legge
 * solo `PHOTOS_DIR`, e in questa cartella non entra mai.
 */
async function raccogliDelCatalogo(): Promise<number> {
  const dir = await FileSystem.getInfoAsync(CATALOG_PHOTOS_DIR);
  if (!dir.exists) return 0;

  const locali = await FileSystem.readDirectoryAsync(CATALOG_PHOTOS_DIR);
  if (locali.length === 0) return 0;

  const nominate = new Set(
    (await referencedPhotoUris()).filter(isCatalogPhoto).map(nameOf),
  );

  let tolte = 0;
  for (const name of locali) {
    if (nominate.has(name)) continue;
    await FileSystem.deleteAsync(catalogPhotoPath(name), {
      idempotent: true,
    }).catch(() => {});
    tolte++;
  }

  return tolte;
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
