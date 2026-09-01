import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  deleteReminder,
  getReminderByKind,
  listReminders,
  reorderReminders,
  saveReminder,
  setReminderEnabled,
  setReminderNotificationIds,
} from "@/src/db/queries/reminders";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("saveReminder", () => {
  it("salva e rilegge i giorni come array di numeri", async () => {
    await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1, 3, 5],
      enabled: true,
    });

    const stored = await getReminderByKind("water");
    expect(stored?.weekdays).toEqual([1, 3, 5]);
    expect(stored?.time).toBe("10:00");
    expect(stored?.enabled).toBe(true);
  });

  it("i giorni tornano ordinati e senza duplicati", async () => {
    // L'ordine dei tocchi sui chip non è un dato: due domeniche nemmeno.
    await saveReminder({
      kind: "meals",
      time: "12:30",
      weekdays: [5, 0, 5, 2],
      enabled: false,
    });

    const stored = await getReminderByKind("meals");
    expect(stored?.weekdays).toEqual([0, 2, 5]);
  });

  it("un promemoria senza giorni resta senza giorni, non con tutti", async () => {
    await saveReminder({
      kind: "weight",
      time: "07:30",
      weekdays: [],
      enabled: false,
    });

    const stored = await getReminderByKind("weight");
    expect(stored?.weekdays).toEqual([]);
  });

  it("scarta i giorni fuori dall'intervallo 0..6", async () => {
    await saveReminder({
      kind: "workout",
      time: "18:00",
      weekdays: [-1, 2, 7],
      enabled: true,
    });

    const stored = await getReminderByKind("workout");
    expect(stored?.weekdays).toEqual([2]);
  });

  it("riscrivere lo stesso tipo aggiorna la riga invece di duplicarla", async () => {
    const first = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1],
      enabled: true,
    });
    const second = await saveReminder({
      kind: "water",
      time: "11:15",
      weekdays: [1, 2],
      enabled: false,
    });

    expect(second.id).toBe(first.id);
    const all = await listReminders();
    expect(all).toHaveLength(1);
    expect(all[0].time).toBe("11:15");
    expect(all[0].weekdays).toEqual([1, 2]);
    expect(all[0].enabled).toBe(false);
  });

  it("aggiornare ora e giorni non perde gli id delle notifiche già programmate", async () => {
    // Perderli significherebbe non poter più cancellare quelle notifiche.
    const saved = await saveReminder({
      kind: "meals",
      time: "12:30",
      weekdays: [1],
      enabled: true,
    });
    await setReminderNotificationIds(saved.id, ["n1"]);

    const updated = await saveReminder({
      kind: "meals",
      time: "13:00",
      weekdays: [1, 2],
      enabled: true,
    });

    expect(updated.notificationIds).toEqual(["n1"]);
    expect((await getReminderByKind("meals"))?.notificationIds).toEqual(["n1"]);
  });

  it("rifiuta un'ora malformata", async () => {
    await expect(
      saveReminder({
        kind: "water",
        time: "25:00",
        weekdays: [1],
        enabled: true,
      }),
    ).rejects.toThrow();
    await expect(
      saveReminder({
        kind: "water",
        time: "9:5",
        weekdays: [1],
        enabled: true,
      }),
    ).rejects.toThrow();
  });
});

describe("notification ids", () => {
  it("salva e rilegge più identificativi", async () => {
    const saved = await saveReminder({
      kind: "workout",
      time: "18:00",
      weekdays: [1, 3],
      enabled: true,
    });
    await setReminderNotificationIds(saved.id, ["a", "b"]);

    expect((await getReminderByKind("workout"))?.notificationIds).toEqual([
      "a",
      "b",
    ]);
  });

  it("svuotarli riporta la colonna a NULL", async () => {
    const saved = await saveReminder({
      kind: "workout",
      time: "18:00",
      weekdays: [1],
      enabled: true,
    });
    await setReminderNotificationIds(saved.id, ["a"]);
    await setReminderNotificationIds(saved.id, []);

    expect((await getReminderByKind("workout"))?.notificationIds).toEqual([]);
    const row = await db.getFirstAsync<{ notification_id: string | null }>(
      "SELECT notification_id FROM reminders WHERE id = ?",
      [saved.id],
    );
    expect(row?.notification_id).toBeNull();
  });

  it("legge anche un id scritto nudo, non come JSON", async () => {
    // La colonna è nata al singolare: un id così non deve diventare
    // incancellabile solo perché non è un array.
    const saved = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1],
      enabled: true,
    });
    await db.runAsync("UPDATE reminders SET notification_id = ? WHERE id = ?", [
      "legacy-id",
      saved.id,
    ]);

    expect((await getReminderByKind("water"))?.notificationIds).toEqual([
      "legacy-id",
    ]);
  });
});

describe("stato", () => {
  it("setReminderEnabled spegne il promemoria", async () => {
    const saved = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1],
      enabled: true,
    });
    await setReminderEnabled(saved.id, false);

    expect((await getReminderByKind("water"))?.enabled).toBe(false);
  });

  it("un promemoria eliminato sparisce dall'elenco", async () => {
    const saved = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1],
      enabled: true,
    });
    await deleteReminder(saved.id);

    expect(await listReminders()).toEqual([]);
    expect(await getReminderByKind("water")).toBeNull();
  });

  it("giorni illeggibili a database valgono come nessun giorno", async () => {
    const saved = await saveReminder({
      kind: "meals",
      time: "12:30",
      weekdays: [1],
      enabled: true,
    });
    await db.runAsync("UPDATE reminders SET weekdays = ? WHERE id = ?", [
      "non-json",
      saved.id,
    ]);

    expect((await getReminderByKind("meals"))?.weekdays).toEqual([]);
  });

  it("salva e modifica promemoria personalizzati con label", async () => {
    const custom = await saveReminder({
      kind: "custom",
      label: "Prendi creatina",
      time: "08:00",
      weekdays: [1, 2, 3, 4, 5],
      enabled: true,
    });
    expect(custom.label).toBe("Prendi creatina");
    expect(custom.kind).toBe("custom");

    const updated = await saveReminder({
      id: custom.id,
      label: "Prendi creatina e vitamine",
      time: "08:30",
      weekdays: [1, 2, 3, 4, 5, 6],
      enabled: false,
    });
    expect(updated.label).toBe("Prendi creatina e vitamine");
    expect(updated.time).toBe("08:30");
    expect(updated.enabled).toBe(false);
  });

  it("riordina i promemoria salvando le posizioni", async () => {
    const a = await saveReminder({
      kind: "water",
      time: "08:00",
      weekdays: [1],
      enabled: true,
    });
    const b = await saveReminder({
      kind: "meals",
      time: "12:00",
      weekdays: [1],
      enabled: true,
    });
    const c = await saveReminder({
      kind: "workout",
      time: "18:00",
      weekdays: [1],
      enabled: true,
    });

    await reorderReminders([c.id, a.id, b.id]);
    const reordered = await listReminders();
    expect(reordered.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
  });
});
