import { i18n } from "@/src/i18n";

/**
 * I numeri a schermo, nella lingua dell'app.
 *
 * C'era `toLocaleString("it-IT")` scritto a mano in una ventina di posti, e da
 * quando l'app parla due lingue quella stringa era sbagliata in una delle due:
 * chi la usa in inglese leggeva "9.400 steps" - novemilaquattrocento scritto
 * col punto delle migliaia italiano, che in inglese si legge nove virgola
 * quattro. Un numero formattato con le convenzioni di un'altra lingua non è
 * brutto, è un altro numero.
 *
 * È lo stesso rimedio, e lo stesso posto, di `formatShortDate` in `dateUtils`:
 * il locale si legge da `i18n` invece di stare scritto in ogni chiamante. Chi
 * disegna un numero non deve più sapere in che lingua si trova.
 *
 * **Nessuna di queste funzioni serve a un campo che si digita.** Lì il
 * separatore lo decide `numberFormat.ts` (§ `DfNumberInput`), che non scrive
 * separatori di migliaia proprio perché rileggerli è ambiguo.
 */

/** Numero intero con i separatori di migliaia della lingua corrente. */
export const formatInteger = (value: number): string =>
  Math.round(value).toLocaleString(i18n.locale);

/**
 * Numero con i decimali della lingua corrente.
 *
 * `fixed` scrive sempre `decimals` cifre ("76,0"), altrimenti sono un massimo
 * e i decimali inutili spariscono ("76"): un peso si legge meglio col decimale
 * sempre presente, una quantità no.
 */
export const formatDecimal = (
  value: number,
  decimals = 1,
  { fixed = false }: { fixed?: boolean } = {},
): string =>
  value.toLocaleString(i18n.locale, {
    minimumFractionDigits: fixed ? decimals : 0,
    maximumFractionDigits: decimals,
  });

/**
 * Il separatore decimale della lingua corrente.
 *
 * Serve a chi scrive un numero in un campo di testo: il campo mostra la
 * virgola a chi usa l'app in italiano e il punto a chi la usa in inglese, che
 * è anche quel che ha sotto il dito sulla tastiera numerica.
 */
export const decimalSeparator = (): "," | "." =>
  (1.1).toLocaleString(i18n.locale).includes(",") ? "," : ".";
