import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Cartella delle immagini dell'app, dentro documentDirectory.
 *
 * ImagePicker restituisce un URI nella CACHE: il sistema operativo la svuota
 * quando ha bisogno di spazio o dopo un aggiornamento, e la foto sparisce
 * lasciando una riga di database che punta al nulla. Nessun errore, solo un
 * rettangolo vuoto. È il difetto peggiore proprio per le foto dei progressi,
 * che hanno senso mesi dopo, cioè quando la cache è quasi certamente già stata
 * ripulita.
 */
const PHOTOS_DIR = `${FileSystem.documentDirectory}photos`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

const extensionOf = (uri: string): string => {
  const match = /\.([a-zA-Z0-9]{1,5})(?:\?|$)/.exec(uri);
  return match ? `.${match[1].toLowerCase()}` : ".jpg";
};

/**
 * Copia una foto scelta dall'utente in una posizione permanente e ne ritorna
 * il nuovo URI. Da chiamare PRIMA di salvare l'URI a database.
 *
 * Se la copia fallisce restituisce l'URI originale invece di far fallire il
 * salvataggio: una foto che potrebbe sparire fra sei mesi è comunque meglio di
 * un pasto che non si riesce a salvare adesso.
 */
export async function persistPhoto(
  sourceUri: string,
  prefix: string,
): Promise<string> {
  if (!sourceUri.startsWith("file://")) return sourceUri;
  if (sourceUri.startsWith(PHOTOS_DIR)) return sourceUri;

  try {
    await ensureDir();
    const name = `${prefix}-${sourceUri.length}-${sourceUri.slice(-12).replace(/\W/g, "")}${extensionOf(sourceUri)}`;
    const target = `${PHOTOS_DIR}/${name}`;

    const existing = await FileSystem.getInfoAsync(target);
    if (!existing.exists) {
      await FileSystem.copyAsync({ from: sourceUri, to: target });
    }
    return target;
  } catch (error) {
    logger.error("[photo] copia in archivio permanente fallita", error);
    return sourceUri;
  }
}

/**
 * Elimina una foto dall'archivio permanente. Silenziosa se il file non c'è:
 * cancellare qualcosa di già assente non è un errore.
 */
export async function deletePhoto(uri: string): Promise<void> {
  if (!uri.startsWith(PHOTOS_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    logger.error("[photo] eliminazione fallita", error);
  }
}
