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

/**
 * Il primo giorno raggiungibile navigando.
 *
 * L'app e' nata nel 2026 e prima non c'e' niente da guardare: un calendario
 * che scorre all'infinito verso il 1970 e' solo un modo per perdersi.
 */
export const EARLIEST_DAY = "2026-01-01";

/**
 * Quanti giorni avanti si puo' andare.
 *
 * Il futuro serve a pianificare - un piano dei pasti, un allenamento previsto -
 * e un mese e' l'orizzonte in cui una pianificazione ha senso. Oltre, si
 * starebbe scrivendo nel vuoto.
 */
export const FUTURE_DAYS = 30;

/** L'ultimo giorno raggiungibile, dato l'oggi. */
export const latestDay = (today: string): string => addDays(today, FUTURE_DAYS);

/** Se una data e' dentro i limiti di navigazione. */
export function isWithinRange(iso: string, today: string): boolean {
  return iso >= EARLIEST_DAY && iso <= latestDay(today);
}

/**
 * Riporta una data dentro i limiti.
 *
 * Serve a chi arriva da fuori - un link, un piano, una data salvata da una
 * versione precedente - e non deve poter mettere la schermata su un giorno da
 * cui non si torna indietro con le frecce.
 */
export function clampDay(iso: string, today: string): string {
  if (iso < EARLIEST_DAY) return EARLIEST_DAY;
  const ultimo = latestDay(today);
  return iso > ultimo ? ultimo : iso;
}

/** Primo giorno del mese a cui appartiene la data. */
export function startOfMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return `${year}-${pad(month)}-01`;
}

/** Sposta di N mesi restando sul primo del mese. */
export function addMonths(iso: string, months: number): string {
  const [year, month] = iso.split("-").map(Number);
  const d = new Date(year, month - 1 + months, 1);
  return toIsoDate(d);
}

/** Le settimane che ogni mese occupa nella griglia, sempre le stesse. */
export const WEEKS_IN_GRID = 6;

/**
 * Le date di un mese disposte in settimane, da lunedi' a domenica.
 *
 * Le caselle prima del primo e dopo l'ultimo sono `null` e non i giorni del
 * mese vicino: un calendario che mostra il 31 luglio dentro agosto invita a
 * toccarlo, e toccarlo dovrebbe cambiare mese, che non e' quello che uno si
 * aspetta da una casella nella griglia di agosto.
 *
 * SEMPRE SEI SETTIMANE, anche quando il mese ne riempirebbe quattro. Un mese
 * ne occupa da quattro (febbraio non bisestile che comincia di lunedi') a sei,
 * e una griglia che cambia numero di righe fa cambiare altezza al foglio che
 * la contiene: scorrendo i mesi il calendario si alzerebbe e si abbasserebbe
 * sotto il dito. Le righe in piu' sono vuote e non si vedono, ma tengono il
 * posto.
 */
export function monthGrid(iso: string): (string | null)[][] {
  const [year, month] = iso.split("-").map(Number);
  const primo = new Date(year, month - 1, 1);
  const giorni = new Date(year, month, 0).getDate();
  // getDay(): 0 = domenica. Portiamo tutto su lunedi' = 0.
  const offset = (primo.getDay() + 6) % 7;

  const celle: (string | null)[] = Array(offset).fill(null);
  for (let giorno = 1; giorno <= giorni; giorno++) {
    celle.push(`${year}-${pad(month)}-${pad(giorno)}`);
  }
  while (celle.length % 7 !== 0) celle.push(null);

  while (celle.length < WEEKS_IN_GRID * 7) celle.push(null);

  const settimane: (string | null)[][] = [];
  for (let i = 0; i < celle.length; i += 7) {
    settimane.push(celle.slice(i, i + 7));
  }
  return settimane;
}
