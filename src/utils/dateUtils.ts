import { i18n } from "@/src/i18n";

/**
 * Risolve il locale corrente per toLocaleDateString.
 */
const getLocale = () => i18n.locale;

/**
 * Parsa una stringa data. Supporta DD/MM/YYYY, Date e stringhe ISO.
 */
const parseDate = (date: Date | string): Date | null => {
  if (date instanceof Date) return date;
  if (typeof date === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const [day, month, year] = date.split("/");
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Formatta una data in formato locale breve (DD/MM/YYYY)
 */
export const formatDate = (date?: Date | string) => {
  if (!date) return "";
  const d = parseDate(date);
  if (!d) return "";
  return d.toLocaleDateString(getLocale());
};
