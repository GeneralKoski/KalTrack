import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  getReminderByKind,
  saveReminder,
  setReminderNotificationIds,
} from "@/src/db/queries/reminders";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import {
  applyReminder,
  configureNotificationHandler,
} from "@/src/services/reminders";

import * as Notifications from "expo-notifications";

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { WEEKLY: "weekly" },
  AndroidImportance: { DEFAULT: 3 },
}));

const getPermissions = jest.mocked(Notifications.getPermissionsAsync);
const requestPermissions = jest.mocked(Notifications.requestPermissionsAsync);
const schedule = jest.mocked(Notifications.scheduleNotificationAsync);
const cancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);
const getAllScheduled = jest.mocked(
  Notifications.getAllScheduledNotificationsAsync,
);

const permission = (granted: boolean, canAskAgain = true) =>
  ({
    granted,
    canAskAgain,
    status: granted ? "granted" : "denied",
    expires: "never",
  }) as unknown as Notifications.NotificationPermissionsStatus;

let db: LocalDatabase;
/** Ordine reale delle chiamate: riprogrammare deve cancellare PRIMA di creare. */
let calls: string[];

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);

  jest.clearAllMocks();
  calls = [];

  let counter = 0;
  getPermissions.mockResolvedValue(permission(true));
  requestPermissions.mockResolvedValue(permission(true));
  schedule.mockImplementation(async () => {
    counter += 1;
    const id = `n${counter}`;
    calls.push(`schedule:${id}`);
    return id;
  });
  cancel.mockImplementation(async (id: string) => {
    calls.push(`cancel:${id}`);
  });
  getAllScheduled.mockResolvedValue([]);
});

afterEach(() => __setDbForTesting(null));

const trigger = (index: number): unknown =>
  schedule.mock.calls[index][0].trigger;

describe("attivazione", () => {
  it("programma una notifica per ogni giorno attivo", async () => {
    // Il trigger settimanale copre un solo giorno: tre giorni = tre notifiche.
    const saved = await saveReminder({
      kind: "water",
      time: "10:05",
      weekdays: [0, 3, 6],
      enabled: true,
    });

    const result = await applyReminder(saved);

    expect(result.status).toBe("scheduled");
    expect(schedule).toHaveBeenCalledTimes(3);
    expect(result.notificationIds).toEqual(["n1", "n2", "n3"]);
    expect((await getReminderByKind("water"))?.notificationIds).toEqual([
      "n1",
      "n2",
      "n3",
    ]);
  });

  it("traduce i giorni: domenica a database è 0, per expo è 1", async () => {
    const saved = await saveReminder({
      kind: "water",
      time: "10:05",
      weekdays: [0, 6],
      enabled: true,
    });

    await applyReminder(saved);

    expect(trigger(0)).toMatchObject({
      type: "weekly",
      weekday: 1,
      hour: 10,
      minute: 5,
    });
    expect(trigger(1)).toMatchObject({ weekday: 7, hour: 10, minute: 5 });
  });

  it("non richiede il permesso se è già concesso", async () => {
    const saved = await saveReminder({
      kind: "weight",
      time: "07:30",
      weekdays: [1],
      enabled: true,
    });

    await applyReminder(saved);

    expect(requestPermissions).not.toHaveBeenCalled();
  });

  it("lo chiede la prima volta, quando non è ancora stato deciso", async () => {
    getPermissions.mockResolvedValue(permission(false));
    requestPermissions.mockResolvedValue(permission(true));

    const saved = await saveReminder({
      kind: "weight",
      time: "07:30",
      weekdays: [1],
      enabled: true,
    });
    const result = await applyReminder(saved);

    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("scheduled");
  });
});

describe("riprogrammazione", () => {
  it("cancella la notifica precedente prima di crearne una nuova", async () => {
    // Senza la cancellazione le notifiche si accumulerebbero: la vecchia
    // resterebbe programmata e il suo id andrebbe perso per sempre.
    const first = await saveReminder({
      kind: "meals",
      time: "12:30",
      weekdays: [1],
      enabled: true,
    });
    await applyReminder(first);

    const moved = await saveReminder({
      kind: "meals",
      time: "13:00",
      weekdays: [1],
      enabled: true,
    });
    const result = await applyReminder(moved);

    expect(calls).toEqual(["schedule:n1", "cancel:n1", "schedule:n2"]);
    expect(result.notificationIds).toEqual(["n2"]);
    expect((await getReminderByKind("meals"))?.notificationIds).toEqual(["n2"]);
    expect(trigger(1)).toMatchObject({ hour: 13, minute: 0 });
  });

  it("cancella tutti i giorni precedenti, non solo il primo", async () => {
    const first = await saveReminder({
      kind: "workout",
      time: "18:00",
      weekdays: [1, 3, 5],
      enabled: true,
    });
    await applyReminder(first);

    const fewer = await saveReminder({
      kind: "workout",
      time: "18:00",
      weekdays: [1],
      enabled: true,
    });
    await applyReminder(fewer);

    expect(cancel.mock.calls.map(([id]) => id)).toEqual(["n1", "n2", "n3"]);
    expect((await getReminderByKind("workout"))?.notificationIds).toEqual([
      "n4",
    ]);
  });
});

describe("spegnimento", () => {
  it("cancella le notifiche e svuota gli identificativi", async () => {
    const saved = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1, 2],
      enabled: true,
    });
    await applyReminder(saved);

    const off = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1, 2],
      enabled: false,
    });
    const result = await applyReminder(off);

    expect(result.status).toBe("disabled");
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(["n1", "n2"]);
    expect(schedule).toHaveBeenCalledTimes(2);
    const stored = await getReminderByKind("water");
    expect(stored?.notificationIds).toEqual([]);
    expect(stored?.enabled).toBe(false);
  });

  it("una notifica già sparita non blocca la cancellazione delle altre", async () => {
    const saved = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1, 2],
      enabled: true,
    });
    await setReminderNotificationIds(saved.id, ["ghost", "alive"]);
    cancel.mockImplementation(async (id: string) => {
      calls.push(`cancel:${id}`);
      if (id === "ghost") throw new Error("non esiste più");
    });

    const off = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1, 2],
      enabled: false,
    });
    await applyReminder(off);

    expect(calls).toEqual(["cancel:ghost", "cancel:alive"]);
    expect((await getReminderByKind("water"))?.notificationIds).toEqual([]);
  });
});

describe("permesso negato", () => {
  it("lascia il promemoria disattivato invece di fingerlo attivo", async () => {
    getPermissions.mockResolvedValue(permission(false));
    requestPermissions.mockResolvedValue(permission(false));

    const saved = await saveReminder({
      kind: "meals",
      time: "12:30",
      weekdays: [1, 2],
      enabled: true,
    });
    const result = await applyReminder(saved);

    expect(result.status).toBe("permission_denied");
    expect(result.enabled).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
    expect((await getReminderByKind("meals"))?.enabled).toBe(false);
  });

  it("se il sistema non permette più di chiedere non insiste", async () => {
    getPermissions.mockResolvedValue(permission(false, false));

    const saved = await saveReminder({
      kind: "meals",
      time: "12:30",
      weekdays: [1],
      enabled: true,
    });
    const result = await applyReminder(saved);

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(result.status).toBe("permission_denied");
    expect((await getReminderByKind("meals"))?.enabled).toBe(false);
  });

  it("il permesso revocato spegne anche un promemoria già programmato", async () => {
    const saved = await saveReminder({
      kind: "water",
      time: "10:00",
      weekdays: [1],
      enabled: true,
    });
    await applyReminder(saved);

    getPermissions.mockResolvedValue(permission(false, false));
    const again = await saveReminder({
      kind: "water",
      time: "10:30",
      weekdays: [1],
      enabled: true,
    });
    const result = await applyReminder(again);

    expect(result.status).toBe("permission_denied");
    expect(cancel).toHaveBeenCalledWith("n1");
    const stored = await getReminderByKind("water");
    expect(stored?.enabled).toBe(false);
    expect(stored?.notificationIds).toEqual([]);
  });
});

describe("casi limite", () => {
  it("senza giorni attivi non programma niente e resta spento", async () => {
    const saved = await saveReminder({
      kind: "workout",
      time: "18:00",
      weekdays: [],
      enabled: true,
    });
    const result = await applyReminder(saved);

    expect(result.status).toBe("no_days");
    expect(schedule).not.toHaveBeenCalled();
    expect((await getReminderByKind("workout"))?.enabled).toBe(false);
  });

  it("se la programmazione fallisce a metà toglie di mezzo quelle già create", async () => {
    schedule
      .mockImplementationOnce(async () => {
        calls.push("schedule:n1");
        return "n1";
      })
      .mockImplementationOnce(async () => {
        throw new Error("quota notifiche esaurita");
      });
    getAllScheduled.mockResolvedValue([
      {
        identifier: "n1",
        content: { data: { kind: "meals" } },
      } as unknown as Notifications.NotificationRequest,
    ]);

    const saved = await saveReminder({
      kind: "meals",
      time: "12:30",
      weekdays: [1, 2],
      enabled: true,
    });
    const result = await applyReminder(saved);

    expect(result.status).toBe("failed");
    expect(cancel).toHaveBeenCalledWith("n1");
    const stored = await getReminderByKind("meals");
    expect(stored?.enabled).toBe(false);
    expect(stored?.notificationIds).toEqual([]);
  });
});

describe("tocchi ravvicinati", () => {
  /**
   * Il difetto che questo test blocca: due `applyReminder` sovrapposti sullo
   * stesso promemoria cancellavano entrambi gli id vecchi, programmavano
   * entrambi, e a database restava solo l'ultima serie. Le notifiche della
   * prima restavano in coda per sempre, senza id con cui fermarle.
   */
  it("non lascia notifiche orfane quando parte due volte di fila", async () => {
    await saveReminder({
      kind: "water",
      enabled: true,
      time: "10:00",
      weekdays: [1],
    });
    const first = await getReminderByKind("water");
    if (!first) throw new Error("promemoria non salvato");

    // Il sistema riporta come programmato tutto quel che schedule ha creato:
    // è così che la seconda esecuzione può accorgersi degli id della prima.
    const live = new Set<string>();
    schedule.mockImplementation(async () => {
      const id = `n${live.size + 1}`;
      live.add(id);
      return id;
    });
    cancel.mockImplementation(async (id: string) => {
      live.delete(id);
    });
    getAllScheduled.mockImplementation(async () =>
      [...live].map(
        (id) =>
          ({
            identifier: id,
            content: { data: { kind: "water" } },
          }) as unknown as Notifications.NotificationRequest,
      ),
    );

    const [a, b] = await Promise.all([
      applyReminder(first),
      applyReminder(first),
    ]);
    expect(a.status).toBe("scheduled");
    expect(b.status).toBe("scheduled");

    const saved = await getReminderByKind("water");
    expect(saved?.notificationIds).toHaveLength(1);
    // Nessuna notifica viva fuori da quelle salvate: niente orfani.
    expect([...live].sort()).toEqual([...(saved?.notificationIds ?? [])].sort());
  });
});

describe("consegna in primo piano", () => {
  it("dichiara che la notifica va mostrata anche con l'app aperta", async () => {
    configureNotificationHandler();
    const handler = jest.mocked(Notifications.setNotificationHandler).mock
      .calls[0][0];
    if (!handler) throw new Error("handler non registrato");
    const behaviour = await handler.handleNotification(
      {} as unknown as Notifications.Notification,
    );
    expect(behaviour.shouldShowBanner).toBe(true);
    expect(behaviour.shouldPlaySound).toBe(true);
  });
});
