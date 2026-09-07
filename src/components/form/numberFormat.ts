/**
 * Le tre conversioni del campo numerico italiano, tenute fuori dal componente
 * perche' siano verificabili: DfNumberInput importa react-native-worklets e
 * non si puo' caricare in un test.
 *
 * IL CONTRATTO, che vale per chiunque legga il form: quel che finisce NEL FORM
 * e' gia' normalizzato ("3.2"), non il testo italiano che si vede a schermo
 * ("3,2"). Chi lo rinormalizza legge un numero dieci volte piu' grande.
 */

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
export const formatNumber = (value: string, decimals: number): string => {
  if (!value) return "";

  // Solo cifre e separatori: le lettere non arrivano dalla tastiera numerica,
  // ma un incolla si'.
  const cleaned = value.replace(/[^\d.,]/g, "");

  // Il primo separatore e' quello decimale, come in `sanitizeDecimalInput`:
  // gli altri sono un ripensamento a metà digitazione e si scartano.
  const separator = cleaned.search(/[.,]/);
  const rawInteger = separator === -1 ? cleaned : cleaned.slice(0, separator);

  // Zeri iniziali via, ma almeno uno zero resta (",5" si legge "0,5").
  const integer = rawInteger.replace(/^0+/, "") || "0";

  if (separator === -1 || decimals === 0) return integer;

  const decimal = cleaned
    .slice(separator + 1)
    .replace(/[.,]/g, "")
    .slice(0, decimals);

  return `${integer},${decimal}`;
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

  // Una virgola sola, e nessun punto: e' quel che `formatNumber` produce.
  return formattedValue.replace(",", ".");
};

/**
 * Converte un numero/stringa in formato display (italiano)
 */
export const numberToDisplay = (
  value: string | number | undefined | null,
  decimals: number,
): string => {
  if (value === undefined || value === null || value === "") return "";

  const numStr = typeof value === "number" ? value.toString() : value;

  // Se il valore è già nel formato italiano (con virgola), formattalo direttamente
  if (numStr.includes(",")) {
    return formatNumber(numStr, decimals);
  }

  // Altrimenti converti dal formato con punto decimale
  const formatted = numStr.replace(".", ",");
  return formatNumber(formatted, decimals);
};
