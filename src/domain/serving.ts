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
 * Grammi da scrivere: niente zeri in coda, e il separatore che la lingua
 * corrente si aspetta.
 *
 * Il separatore arriva da fuori (`decimalSeparator()` in `utils/number`)
 * invece di stare scritto qui: questo modulo e' dominio puro e non legge
 * `i18n`. Di serie resta la virgola, che e' la lingua di partenza dell'app.
 *
 * Il campo quantita' riaccetta in lettura sia la virgola sia il punto
 * (`toGrams`), quindi qualunque dei due si scriva qui la conferma regge.
 */
export const formatGrams = (grams: number, separator = ","): string =>
  String(Number(grams.toFixed(2))).replace(".", separator);

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
