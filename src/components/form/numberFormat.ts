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
 * Formatta un numero con separatore migliaia (punto) e decimali (virgola) - formato italiano
 */
export const formatNumber = (value: string, decimals: number): string => {
  if (!value) return "";

  // Rimuovi tutti i caratteri non numerici tranne la virgola
  let cleaned = value.replace(/[^\d,]/g, "");

  // Gestisci il caso di più virgole (tieni solo la prima)
  const parts = cleaned.split(",");
  if (parts.length > 2) {
    cleaned = parts[0] + "," + parts.slice(1).join("");
  }

  // Separa parte intera e decimale
  const [integerPart, decimalPart] = cleaned.split(",");

  // Rimuovi zeri iniziali dalla parte intera (ma mantieni almeno uno zero)
  const cleanedInteger = integerPart.replace(/^0+/, "") || "0";

  // Formatta la parte intera con separatore migliaia (punto)
  const formattedInteger = cleanedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  // Tronca i decimali al numero massimo consentito
  if (decimalPart !== undefined) {
    const truncatedDecimal = decimalPart.slice(0, decimals);
    return `${formattedInteger},${truncatedDecimal}`;
  }

  return formattedInteger;
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

  // Rimuovi i punti (separatori migliaia) e sostituisci virgola con punto
  const normalized = formattedValue.replace(/\./g, "").replace(",", ".");

  return normalized;
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
