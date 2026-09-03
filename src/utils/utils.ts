/**
 * Formatta un importo numerico: applica toFixed(2) solo se ha decimali,
 * altrimenti restituisce il numero intero come stringa.
 * Sostituisce il punto con la virgola.
 * Es: 61.790000000000006 → "61,79", 10 → "10"
 */
export const formatCurrency = (value: number | string): string => {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "0";

  const formatted =
    numValue % 1 !== 0 ? numValue.toFixed(2) : numValue.toString();
  return formatted.replace(".", ",");
};

/**
 * Testo digitato ridotto a un numero decimale valido: solo cifre e un
 * separatore (virgola o punto, il primo che compare). I campi numerici che
 * restano testo libero (niente DfNumberInput/react-hook-form) passano
 * l'onChangeText da qui per non lasciar scrivere lettere.
 */
export const sanitizeDecimalInput = (text: string): string => {
  const cleaned = text.replace(/[^0-9,.]/g, "");
  const separatorIndex = cleaned.search(/[,.]/);
  if (separatorIndex === -1) return cleaned;
  const before = cleaned.slice(0, separatorIndex + 1);
  const after = cleaned.slice(separatorIndex + 1).replace(/[,.]/g, "");
  return before + after;
};

/** Come sanitizeDecimalInput, ma per campi interi (es. ripetizioni): niente separatore. */
export const sanitizeIntegerInput = (text: string): string =>
  text.replace(/[^0-9]/g, "");

export const toCamelCase = (value?: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase();
};

export const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
