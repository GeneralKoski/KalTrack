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
