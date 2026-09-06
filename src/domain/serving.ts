/**
 * I grammi come si scrivono e come si leggono.
 *
 * Un alimento memorizza i valori per 100 g e una porzione predefinita in
 * grammi (`default_serving_g`), piu' un'etichetta leggibile che la spiega
 * (`serving_label`, tipo "1 vasetto = 125 g"). La porzione riempie il campo
 * all'apertura e resta scritta accanto come promemoria: qui dentro non c'e'
 * piu' nessun moltiplicatore, perche' la quantita' si digita e basta.
 */

/**
 * Grammi come li scrive un italiano: virgola per i decimali, niente zeri in
 * coda. Il campo quantita' la riaccetta in lettura, quindi scrivere qui la
 * virgola non rompe la conferma.
 */
export const formatGrams = (grams: number): string =>
  String(Number(grams.toFixed(2))).replace(".", ",");

/**
 * Grammi da quel che si e' digitato. La virgola e' il separatore decimale
 * italiano, e un campo vuoto o assurdo vale zero: zero grammi esclude la riga
 * dal salvataggio invece di scriverne una a caso.
 *
 * Sta qui e non accanto a chi la usa perche' i consumatori sono due - la stima
 * da foto e la composizione di una voce - e una copia per ciascuno divergerebbe
 * alla prima correzione.
 */
export function toGrams(text: string): number {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
