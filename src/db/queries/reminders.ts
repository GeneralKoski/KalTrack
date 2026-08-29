import { getDb } from "@/src/db/index";
import { newId, nowIso } from "@/src/db/ids";
import { logger } from "@/src/utils/logger";

/**
 * Tipi di promemoria previsti. `kind` è la chiave logica della tabella: di ogni
 * tipo esiste al massimo una riga, perché due promemoria "bevi acqua" con orari
 * diversi sarebbero indistinguibili nell'elenco e nella notifica.
 */
export const REMINDER_KINDS = ["meals", "water", "weight", "workout"] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface ReminderRow {
  id: string;
  kind: string;
  time: string;
  weekdays: string;
  enabled: number;
  notification_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Promemoria con i campi JSON già decodificati. */
export interface Reminder {
  id: string;
  kind: ReminderKind;
  /** Ora locale in formato "HH:MM". */
  time: string;
  /** Giorni attivi della settimana, 0 = domenica. */
  weekdays: number[];
  enabled: boolean;
  /**
   * Un identificativo per ogni giorno attivo: il trigger settimanale di
   * expo-notifications copre un solo giorno, quindi un promemoria su tre giorni
   * sono tre notifiche programmate, tutte da cancellare per spegnerlo.
   */
  notificationIds: string[];
}

export interface ReminderInput {
  kind: ReminderKind;
  time: string;
  weekdays: number[];
  enabled: boolean;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function assertTime(time: string): void {
  if (!TIME_PATTERN.test(time)) {
    throw new Error(`Ora non valida per un promemoria: ${time}`);
  }
}

/** Giorni ordinati e senza duplicati: l'ordine di inserimento non ha significato. */
function normalizeWeekdays(weekdays: number[]): number[] {
  const valid = weekdays.filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6,
  );
  return [...new Set(valid)].sort((a, b) => a - b);
}

function parseWeekdays(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const numbers = parsed.filter((day): day is number => typeof day === "number");
    return normalizeWeekdays(numbers);
  } catch (error) {
    // Un JSON illeggibile è meglio trattarlo come "nessun giorno" che come
    // "tutti": un promemoria muto si nota e si corregge, uno che suona a caso no.
    logger.error("[reminders] giorni illeggibili a database", error);
    return [];
  }
}

function parseNotificationIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === "string");
    }
  } catch {
    // La colonna è nata al singolare: un id scritto nudo va comunque
    // restituito, altrimenti quella notifica non sarebbe più cancellabile.
  }
  return [raw];
}

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    kind: row.kind as ReminderKind,
    time: row.time,
    weekdays: parseWeekdays(row.weekdays),
    enabled: row.enabled === 1,
    notificationIds: parseNotificationIds(row.notification_id),
  };
}

export async function listReminders(): Promise<Reminder[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ReminderRow>(
    "SELECT * FROM reminders WHERE deleted_at IS NULL ORDER BY time ASC, kind ASC",
  );
  return rows.map(toReminder);
}

export async function getReminder(id: string): Promise<Reminder | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ReminderRow>(
    "SELECT * FROM reminders WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  return row ? toReminder(row) : null;
}

export async function getReminderByKind(
  kind: ReminderKind,
): Promise<Reminder | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ReminderRow>(
    "SELECT * FROM reminders WHERE kind = ? AND deleted_at IS NULL",
    [kind],
  );
  return row ? toReminder(row) : null;
}

/**
 * Crea o aggiorna il promemoria di un tipo e restituisce lo stato salvato.
 *
 * Non tocca `notification_id`: chi ha programmato le notifiche è il servizio, e
 * sovrascriverlo qui perderebbe gli identificativi delle notifiche ancora vive.
 */
export async function saveReminder(input: ReminderInput): Promise<Reminder> {
  assertTime(input.time);
  const weekdays = normalizeWeekdays(input.weekdays);
  const db = await getDb();
  const now = nowIso();
  const existing = await getReminderByKind(input.kind);

  if (existing) {
    await db.runAsync(
      "UPDATE reminders SET time = ?, weekdays = ?, enabled = ?, updated_at = ? WHERE id = ?",
      [
        input.time,
        JSON.stringify(weekdays),
        input.enabled ? 1 : 0,
        now,
        existing.id,
      ],
    );
    return {
      ...existing,
      time: input.time,
      weekdays,
      enabled: input.enabled,
    };
  }

  const id = newId();
  await db.runAsync(
    `INSERT INTO reminders (id, kind, time, weekdays, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.kind,
      input.time,
      JSON.stringify(weekdays),
      input.enabled ? 1 : 0,
      now,
      now,
    ],
  );
  return {
    id,
    kind: input.kind,
    time: input.time,
    weekdays,
    enabled: input.enabled,
    notificationIds: [],
  };
}

export async function setReminderEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE reminders SET enabled = ?, updated_at = ? WHERE id = ?",
    [enabled ? 1 : 0, nowIso(), id],
  );
}

/**
 * Registra gli identificativi delle notifiche programmate. Senza di questi
 * disattivare il promemoria non potrebbe cancellarle, e continuerebbero ad
 * arrivare per sempre.
 */
export async function setReminderNotificationIds(
  id: string,
  notificationIds: string[],
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE reminders SET notification_id = ?, updated_at = ? WHERE id = ?",
    [
      notificationIds.length > 0 ? JSON.stringify(notificationIds) : null,
      nowIso(),
      id,
    ],
  );
}

export async function deleteReminder(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE reminders SET deleted_at = ?, updated_at = ? WHERE id = ?",
    [now, now, id],
  );
}
