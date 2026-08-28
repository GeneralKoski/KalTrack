import { i18n } from "@/src/i18n";
import { toCamelCase } from "@/src/utils/utils";

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
 * Combina una data ISO (YYYY-MM-DD) e un'ora (HH:MM o HH:MM:SS) in un Date locale.
 * Restituisce null se uno dei due input non è nel formato atteso.
 */
export const parseDateTime = (date: string, time: string): Date | null => {
  const dateParts = date.split("-").map(Number);
  const timeParts = time.split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;
  const [year, month, day] = dateParts;
  const [hours, minutes, seconds = 0] = timeParts;
  const d = new Date(year, month - 1, day, hours, minutes, seconds);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Formatta una data nel formato ISO breve (YYYY-MM-DD), utile per i parametri API.
 */
export const formatDateISO = (date?: Date | string): string | undefined => {
  if (!date) return undefined;
  const d = parseDate(date);
  if (!d) return undefined;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

/**
 * Formatta una data in formato esteso (es. "31 Ottobre 2026")
 * con il mese in uppercase. Segue la lingua corrente dell'app.
 */
export const formatDateLong = (date?: Date | string) => {
  if (!date) return "";
  const d = parseDate(date);
  if (!d) return "";

  const day = d.toLocaleDateString(getLocale(), { day: "numeric" });
  const month = toCamelCase(
    d.toLocaleDateString(getLocale(), { month: "long" }),
  );
  const year = d.toLocaleDateString(getLocale(), { year: "numeric" });

  return `${day} ${month} ${year}`;
};
