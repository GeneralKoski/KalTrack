import { newId, nowIso } from "@/src/db/ids";
import { getDb } from "@/src/db/index";
import { logger } from "@/src/utils/logger";

/**
 * Tipi di promemoria noti.
 */
export const REMINDER_KINDS = ["meals", "water", "weight", "workout"] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number] | "custom" | string;

export interface ReminderRow {
  id: string;
  kind: string;
  label: string | null;
  position?: number;
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
  label: string | null;
  position: number;
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
  id?: string;
  kind?: ReminderKind;
  label?: string | null;
  position?: number;
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
    const numbers = parsed.filter(
      (day): day is number => typeof day === "number",
    );
    return normalizeWeekdays(numbers);
  } catch (error) {
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
    kind: (row.kind || "custom") as ReminderKind,
    label: row.label ?? null,
    position: row.position ?? 0,
    time: row.time,
    weekdays: parseWeekdays(row.weekdays),
    enabled: row.enabled === 1,
    notificationIds: parseNotificationIds(row.notification_id),
  };
}

/**
 * Assicura che esista almeno 1 promemoria di default se la tabella è vuota.
 */
export async function ensureDefaultReminder(): Promise<void> {
  const db = await getDb();
  const countRow = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM reminders",
  );
  if ((countRow?.count ?? 0) === 0) {
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO reminders (id, kind, label, position, time, weekdays, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        "water",
        "Bevi un bicchiere d'acqua",
        0,
        "09:00",
        "[0,1,2,3,4,5,6]",
        0,
        now,
        now,
      ],
    );
  }
}

export async function listReminders(): Promise<Reminder[]> {
  await ensureDefaultReminder();
  const db = await getDb();
  const rows = await db.getAllAsync<ReminderRow>(
    "SELECT * FROM reminders WHERE deleted_at IS NULL ORDER BY position ASC, time ASC, created_at ASC",
  );
  return rows.map(toReminder);
}

export async function reorderReminders(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync("UPDATE reminders SET position = ? WHERE id = ?", [
        i,
        orderedIds[i],
      ]);
    }
  });
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
 * Crea o aggiorna un promemoria e restituisce lo stato salvato.
 */
export async function saveReminder(input: ReminderInput): Promise<Reminder> {
  assertTime(input.time);
  const weekdays = normalizeWeekdays(input.weekdays);
  const db = await getDb();
  const now = nowIso();
  const kind = input.kind ?? "custom";
  const label = input.label !== undefined ? input.label?.trim() || null : null;

  let existing: Reminder | null = null;
  if (input.id) {
    existing = await getReminder(input.id);
  } else if (kind !== "custom") {
    existing = await getReminderByKind(kind);
  }

  if (existing) {
    const finalLabel = input.label !== undefined ? label : existing.label;
    await db.runAsync(
      "UPDATE reminders SET label = ?, kind = ?, time = ?, weekdays = ?, enabled = ?, updated_at = ? WHERE id = ?",
      [
        finalLabel,
        kind,
        input.time,
        JSON.stringify(weekdays),
        input.enabled ? 1 : 0,
        now,
        existing.id,
      ],
    );
    return {
      ...existing,
      label: finalLabel,
      kind: kind as ReminderKind,
      time: input.time,
      weekdays,
      enabled: input.enabled,
    };
  }

  const id = input.id || newId();
  let position = input.position;
  if (position === undefined) {
    const maxPosRow = await db.getFirstAsync<{ max_pos: number | null }>(
      "SELECT MAX(position) as max_pos FROM reminders WHERE deleted_at IS NULL",
    );
    position = (maxPosRow?.max_pos ?? -1) + 1;
  }

  await db.runAsync(
    `INSERT INTO reminders (id, kind, label, position, time, weekdays, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      kind,
      label,
      position,
      input.time,
      JSON.stringify(weekdays),
      input.enabled ? 1 : 0,
      now,
      now,
    ],
  );

  return {
    id,
    kind: kind as ReminderKind,
    label,
    position,
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
