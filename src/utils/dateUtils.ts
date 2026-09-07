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
 * Data ISO -> "gio 28 ago", per riconoscere una giornata a colpo d'occhio.
 *
 * Segue la lingua dell'app e non una fissa: stava in `GymScreen` con `it-IT`
 * scritto dentro, e il secondo chiamante avrebbe copiato anche quello.
 */
export const formatShortDate = (iso: string): string => {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(getLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
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
 * Data estesa: "7 settembre 2026", "7 September 2026".
 *
 * Segue la lingua dell'APP, che non è la stessa cosa di seguire il locale del
 * dispositivo: c'era un elenco di dodici mesi italiani scritto a mano in
 * `DayHeader` proprio per non dipendere dal dispositivo, e l'effetto era che in
 * inglese la data restava italiana.
 */
export const formatLongDate = (iso: string): string => {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(getLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/** Mese e anno: l'intestazione di un calendario. */
export const formatMonthYear = (iso: string): string => {
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return iso;
  return new Date(year, month - 1, 1).toLocaleDateString(getLocale(), {
    month: "long",
    year: "numeric",
  });
};

/**
 * Le iniziali dei sette giorni, da lunedì: "L M M G V S D", "M T W T F S S".
 *
 * Il 1° gennaio 2024 era un lunedì, e serve solo come punto di partenza per
 * chiedere al sistema come si chiamano i giorni in questa lingua.
 */
export const weekdayInitials = (): string[] =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(getLocale(), {
      weekday: "narrow",
    }),
  );

/**
 * Data e ora leggibili, senza secondi: la precisione al secondo non serve a
 * nessuna delle schermate che la mostrano (backup, diagnostica).
 *
 * Un istante illeggibile torna com'era invece di diventare "Invalid Date": in
 * diagnostica quella stringa è un dato da leggere, non da rendere bello.
 */
export const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(getLocale(), {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};
