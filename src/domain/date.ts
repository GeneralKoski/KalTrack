const pad = (n: number): string => String(n).padStart(2, "0");

/** Data locale in formato YYYY-MM-DD. Non usa toISOString(): sposterebbe il giorno. */
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayIso = (now: Date = new Date()): string => toIsoDate(now);

const parseIso = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Lunedì della settimana a cui appartiene la data. */
export function startOfWeek(iso: string): string {
  const d = parseIso(iso);
  // getDay(): 0 = domenica. Portiamo tutto su lunedì = 0.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toIsoDate(d);
}

export type DayLabelKind = "today" | "yesterday" | "tomorrow" | "other";

/** Classifica una data rispetto a oggi. La traduzione resta alla UI. */
export function dayLabelKind(iso: string, today: string): DayLabelKind {
  if (iso === today) return "today";
  if (iso === addDays(today, -1)) return "yesterday";
  if (iso === addDays(today, 1)) return "tomorrow";
  return "other";
}

/**
 * True se la stringa e' una data di calendario che esiste davvero.
 *
 * Il solo formato non basta: "2026-02-29" ha la forma giusta ma il 2026 non e'
 * bisestile. Una data cosi', scritta a database, resta irraggiungibile - nessuna
 * schermata puo' arrivarci, perche' si naviga di giorno in giorno - ma continua
 * a comparire nelle medie e nell'ultimo peso registrato.
 */
export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  // Il giorno 0 del mese successivo e' l'ultimo di questo, anche a febbraio.
  const lastDay = new Date(year, month, 0).getDate();
  return day <= lastDay;
}
