import { createFood, getFoodByBarcode } from "@/src/db/queries/foods";
import {
  OpenFoodFactsError,
  searchByBarcode,
} from "@/src/services/openFoodFacts";
import { logger } from "@/src/utils/logger";

/**
 * Dove porta un codice a barre letto dalla fotocamera.
 *
 * `library` e `off` portano entrambi un `id`: nel secondo caso l'alimento e'
 * stato appena creato, quindi da qui in poi i due casi si trattano allo stesso
 * modo. `unknown` non ha un id perche' non c'e' niente da aprire: c'e' un
 * modulo da compilare.
 */
export type BarcodeResolution =
  | { kind: "library"; id: string }
  | { kind: "off"; id: string }
  | { kind: "unknown"; barcode: string };

/**
 * Risolve un codice a barre in cascata: libreria, poi archivio, poi niente.
 *
 * Sta fuori dalla schermata di proposito. La fotocamera non si puo' esercitare
 * in jest - un emulatore non legge codici - quindi la parte con le decisioni
 * dentro deve stare dove i test la raggiungono senza fotocamera.
 *
 * **La libreria vince sull'archivio**, ed e' la stessa precedenza di
 * `resolveFood`. Non e' cosmetica: i valori di OpenFoodFacts sono compilati da
 * chiunque, e un prodotto gia' corretto a mano non deve essere riscritto da
 * quelli. Per questo l'archivio non viene nemmeno interrogato quando la
 * libreria risponde.
 *
 * Solo l'indisponibilita' dell'archivio e' un degrado accettabile: un
 * `TypeError` o un errore di parsing risale, invece di travestirsi da "prodotto
 * non trovato" e mandare l'utente a compilare a mano un modulo che non serviva.
 */
export async function resolveBarcode(
  barcode: string,
): Promise<BarcodeResolution> {
  const code = barcode.trim();
  if (code === "") return { kind: "unknown", barcode: "" };

  const mio = await getFoodByBarcode(code);
  if (mio) return { kind: "library", id: mio.id };

  let prodotto;
  try {
    prodotto = await searchByBarcode(code);
  } catch (error) {
    if (!(error instanceof OpenFoodFactsError)) throw error;
    logger.warn(`[barcode] archivio non disponibile per ${code}`, error);
    return { kind: "unknown", barcode: code };
  }

  if (!prodotto) return { kind: "unknown", barcode: code };

  /*
   * `source: "off"` e non "user": dice da dove vengono i valori, e serve a
   * `publishFood` per non rimettere nel catalogo comune, come se fossero
   * propri, dati che vengono da un archivio pubblico.
   */
  const id = await createFood({ ...prodotto, barcode: code, source: "off" });
  return { kind: "off", id };
}
