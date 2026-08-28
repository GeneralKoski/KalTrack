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
