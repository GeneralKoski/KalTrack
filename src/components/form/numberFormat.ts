/**
 * Le tre conversioni del campo numerico, tenute fuori dal componente perche'
 * siano verificabili: DfNumberInput importa react-native-worklets e non si
 * puo' caricare in un test.
 *
 * IL CONTRATTO, che vale per chiunque legga il form: quel che finisce NEL FORM
 * e' gia' normalizzato ("3.2"), non il testo che si vede a schermo ("3,2" in
 * italiano). Chi lo rinormalizza legge un numero dieci volte piu' grande.
 *
 * **Il separatore che si VEDE arriva da fuori** (`DfNumberInput` lo prende da
 * `decimalSeparator()`): la virgola era scritta qui dentro, e da quando l'app
 * parla due lingue mostrava "3,2" anche a chi ha il punto sotto il dito. Il
 * separatore che si SCRIVE resta invece sempre entrambi - la tastiera numerica
 * di Android offre virgola e punto, e chi digita l'uno o l'altro intende la
 * stessa cosa.
 *
 * Quel modulo NON si importa qui: questo file deve restare caricabile in un
 * test senza tirarsi dietro `i18n`, ed e' la ragione per cui esiste separato
 * dal componente.
 */

/** Il separatore di serie: l'italiano, che e' la lingua di partenza dell'app. */
const DEFAULT_SEPARATOR = ",";

/**
 * Formatta un numero decimale in formato italiano: cifre e, al massimo, una
 * virgola.
 *
 * **Niente separatore di migliaia, e non e' una semplificazione grafica.**
 * Scrivendolo da se' ("1.000") il campo si ritrovava al tasto dopo un punto
 * che non distingueva piu' dal separatore decimale digitato a mano: la quinta
 * cifra di 10005 lo mandava a "1,00", e cancellare una cifra da 2000 lo
 * mandava a 2. Un separatore che noi non scriviamo non c'e' da interpretare,
 * e qui i numeri arrivano a quattro cifre - kcal, grammi, carichi - dove
 * quella lettura non serviva a nessuno.
 *
 * Un punto digitato dall'utente e' quindi SEMPRE un separatore decimale: la
 * tastiera numerica di Android offre sia la virgola sia il punto, e scrivere
 * "3.2" e' normale quanto scrivere "3,2".
 */
export const formatNumber = (
  value: string,
  decimals: number,
  separator: string = DEFAULT_SEPARATOR,
): string => {
  if (!value) return "";

  // Solo cifre e separatori: le lettere non arrivano dalla tastiera numerica,
  // ma un incolla si'.
  const cleaned = value.replace(/[^\d.,]/g, "");

  // Il primo separatore e' quello decimale, come in `sanitizeDecimalInput`:
  // gli altri sono un ripensamento a metà digitazione e si scartano.
  const at = cleaned.search(/[.,]/);
  const rawInteger = at === -1 ? cleaned : cleaned.slice(0, at);

  // Zeri iniziali via, ma almeno uno zero resta (",5" si legge "0,5").
  const integer = rawInteger.replace(/^0+/, "") || "0";

  if (at === -1 || decimals === 0) return integer;

  const decimal = cleaned
    .slice(at + 1)
    .replace(/[.,]/g, "")
    .slice(0, decimals);

  return `${integer}${separator}${decimal}`;
};

/**
 * Converte il valore formattato in numero (per il form)
 * Ritorna una stringa per compatibilità con il backend
 *
 * Esportata perché è il contratto tra questo campo e chi legge il form: quel
 * che finisce nel form è GIÀ normalizzato ("3.2"), non il testo italiano che
 * si vede a schermo. Chi lo rinormalizza legge un numero dieci volte più
 * grande, ed è successo davvero.
 */
export const parseToNumber = (formattedValue: string): string => {
  if (!formattedValue) return "";

  // Un separatore solo, virgola o punto secondo la lingua: e' quel che
  // `formatNumber` produce, e in tutti e due i casi il form vuole il punto.
  return formattedValue.replace(",", ".");
};

/**
 * Converte un numero/stringa nel testo da mostrare, col separatore della
 * lingua corrente.
 */
export const numberToDisplay = (
  value: string | number | undefined | null,
  decimals: number,
  separator: string = DEFAULT_SEPARATOR,
): string => {
  if (value === undefined || value === null || value === "") return "";

  const numStr = typeof value === "number" ? value.toString() : value;

  // `formatNumber` prende il primo separatore che trova, quale che sia: il
  // valore del form ("3.2") e quello gia' scritto a mano ("3,2") passano di
  // qui allo stesso modo.
  return formatNumber(numStr, decimals, separator);
};
