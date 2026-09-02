import { newId } from "@/src/db/ids";
import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

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
export const PHOTOS_DIR = `${FileSystem.documentDirectory}photos`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

/**
 * Il lato lungo di una foto archiviata.
 *
 * Piu' alto di quello che serve all'AI (1024): una foto dei progressi si
 * riguarda a schermo pieno mesi dopo, quella dell'AI la guarda un modello una
 * volta sola. Piu' basso di quel che esce da una fotocamera moderna, e non e'
 * un dettaglio: il server rifiuta oltre i 5 MB (`ImageController::MAX_KB`), e
 * `uploadPendingPhotos` in quel caso annota il rifiuto e va avanti. Il
 * risultato era una riga sincronizzata la cui immagine non arrivava mai, e
 * sull'altro telefono restava il segnaposto per sempre.
 */
const MAX_SIDE_PX = 1600;
const JPEG_QUALITY = 0.85;

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
    /*
     * Il nome e' un UUID, e non piu' una firma ricavata dall'URI di partenza.
     *
     * Da quando le foto viaggiano fra dispositivi, il nome E' l'identita'
     * dell'immagine: due foto diverse che finivano per caso con lo stesso nome
     * sarebbero diventate la stessa foto sull'altro telefono, e quella
     * sbagliata avrebbe sostituito quella giusta.
     *
     * L'estensione e' sempre `.jpg` perche' l'archivio contiene sempre un
     * JPEG: ricavarla dall'URI di partenza avrebbe scritto `.png` su un file
     * ricompresso in JPEG.
     */
    const name = `${prefix}-${newId()}.jpg`;
    const target = `${PHOTOS_DIR}/${name}`;

    const existing = await FileSystem.getInfoAsync(target);
    if (!existing.exists) {
      await writeResized(sourceUri, target);
    }
    return target;
  } catch (error) {
    logger.error("[photo] copia in archivio permanente fallita", error);
    return sourceUri;
  }
}

/**
 * Scrive la foto ridotta, e se la riduzione non si puo' fare copia l'originale.
 *
 * Il ripiego non e' pigrizia: una foto piu' grande del necessario e' un difetto
 * di peso, una foto che non si salva e' un pasto che non si registra. Se
 * `expo-image-manipulator` non riesce a leggere quel formato, meglio il file
 * intero che niente.
 */
async function writeResized(sourceUri: string, target: string): Promise<void> {
  try {
    const context = ImageManipulator.manipulate(sourceUri);
    const source = await context.renderAsync();

    // Il lato lungo si conosce solo dopo il primo render, quindi il resize
    // arriva in un secondo passaggio e solo se serve davvero.
    const longSide = Math.max(source.width, source.height);
    const image =
      longSide > MAX_SIDE_PX
        ? await context
            .resize(
              source.width >= source.height
                ? { width: MAX_SIDE_PX }
                : { height: MAX_SIDE_PX },
            )
            .renderAsync()
        : source;

    const saved = await image.saveAsync({
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    await FileSystem.copyAsync({ from: saved.uri, to: target });
    // Il file intermedio sta in cache: il sistema la svuota da solo, ma
    // lasciarne uno per foto vuol dire raddoppiare lo spazio fino a quel
    // momento.
    await FileSystem.deleteAsync(saved.uri, { idempotent: true }).catch(
      () => {},
    );
  } catch (error) {
    logger.warn(
      "[foto] riduzione non riuscita, si archivia l'originale",
      error,
    );
    await FileSystem.copyAsync({ from: sourceUri, to: target });
  }
}

/**
 * Cancella una foto archiviata, se e' una delle nostre.
 *
 * Sostituire o togliere una foto lasciava il file precedente in
 * `documentDirectory/photos` per sempre: nessuno lo referenziava piu' e
 * nessuno lo cancellava. Su un uso lungo sono decine di megabyte di foto
 * fantasma dentro il backup del telefono.
 *
 * Silenziosa se il file non c'e': cancellare qualcosa di gia' assente non e'
 * un errore. E non solleva mai - se il file non si puo' toccare, chi ha
 * chiamato sta comunque facendo altro e non c'e' niente da dirgli.
 *
 * `deletePhoto` e' l'alias con cui la conoscono i chiamanti che passano un URI
 * sicuramente presente: erano due funzioni con lo stesso corpo e due nomi, e
 * due nomi per un comportamento fanno chiedere quale sia quello giusto.
 */
export async function discardPhoto(uri: string | null): Promise<void> {
  if (!uri || !uri.startsWith(PHOTOS_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    logger.warn("[foto] cancellazione non riuscita", error);
  }
}

export const deletePhoto = discardPhoto;
