import {
  REMINDER_KINDS,
  setReminderEnabled,
  setReminderNotificationIds,
  type Reminder,
} from "@/src/db/queries/reminders";
import { i18n } from "@/src/i18n";
import { logger } from "@/src/utils/logger";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Canale Android delle notifiche di promemoria. Su Android 8+ una notifica
 * senza canale non viene mostrata affatto, e il canale va creato prima di
 * programmarla.
 */
const CHANNEL_ID = "reminders";

let channelReady = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android" || channelReady) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: i18n.t("reminders.channel_name"),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  channelReady = true;
}

/**
 * Dice al sistema che una notifica arrivata con l'app aperta va comunque
 * mostrata. Senza questo handler expo-notifications la consegna in silenzio:
 * il promemoria delle 20:00 sembrerebbe non essere mai partito solo perché in
 * quel momento l'utente aveva KalTrack in primo piano.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Chiede il permesso alle notifiche, se non è già stato concesso.
 *
 * Restituisce `false` anche quando il sistema non permette più di chiedere:
 * l'utente ha già detto no una volta e deve passare dalle impostazioni.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch (error) {
    logger.error("[reminders] richiesta permesso notifiche fallita", error);
    return false;
  }
}

const parseTime = (time: string): { hour: number; minute: number } => {
  const [hour, minute] = time.split(":").map((part) => Number(part));
  return { hour, minute };
};

/**
 * Programma una notifica per ogni giorno attivo e restituisce gli id ottenuti.
 *
 * Il trigger settimanale copre un solo giorno della settimana, quindi non
 * esiste una singola notifica "lun-mer-ven": sono tre, e vanno tenute insieme.
 * I giorni a database sono 0 = domenica, expo-notifications li vuole 1 = domenica.
 */
export async function scheduleReminder(reminder: Reminder): Promise<string[]> {
  await ensureAndroidChannel();
  const { hour, minute } = parseTime(reminder.time);

  // Un preset ha titolo e testo tradotti; un promemoria creato a mano porta il
  // proprio nome. L'elenco dei preset e' quello di `REMINDER_KINDS`, non una
  // copia: due copie divergono alla prima aggiunta.
  const isPreset =
    reminder.kind !== "custom" &&
    REMINDER_KINDS.includes(reminder.kind as never);

  const title =
    reminder.label?.trim() ||
    (isPreset
      ? i18n.t(`reminders.kinds.${reminder.kind}.title`, {
          defaultValue: "Promemoria",
        })
      : "Promemoria");

  const body =
    isPreset && !reminder.label?.trim()
      ? i18n.t(`reminders.kinds.${reminder.kind}.body`, {
          defaultValue: "È ora del tuo promemoria!",
        })
      : i18n.t("reminders.custom_body", {
          defaultValue: "È ora del tuo promemoria!",
        });

  const ids: string[] = [];
  for (const weekday of reminder.weekdays) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { reminderId: reminder.id, kind: reminder.kind },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: weekday + 1,
        hour,
        minute,
        channelId: CHANNEL_ID,
      },
    });
    ids.push(id);
  }
  return ids;
}

/**
 * Cancella le notifiche già programmate. Ogni id si cancella per conto suo: se
 * uno non esiste più (l'utente ha reinstallato, il sistema l'ha scartata) gli
 * altri devono comunque sparire.
 */
export async function cancelReminder(notificationIds: string[]): Promise<void> {
  for (const id of notificationIds) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (error) {
      logger.error(`[reminders] cancellazione notifica ${id} fallita`, error);
    }
  }
}

export type ReminderApplyStatus =
  | "scheduled"
  | "disabled"
  | "no_days"
  | "permission_denied"
  | "failed";

export interface ReminderApplyResult {
  status: ReminderApplyStatus;
  /** Stato reale del promemoria dopo l'operazione, da mostrare a schermo. */
  enabled: boolean;
  notificationIds: string[];
}

/**
 * Allinea le notifiche di sistema allo stato del promemoria a database.
 *
 * Cancella SEMPRE le notifiche precedenti prima di riprogrammare: gli id vecchi
 * verrebbero sovrascritti e quelle notifiche resterebbero programmate senza che
 * nessuno possa più fermarle.
 *
 * Se il permesso manca il promemoria viene spento anche a database: mostrarlo
 * acceso mentre non arriva niente è il difetto peggiore di questa schermata.
 */
const applyQueues = new Map<string, Promise<unknown>>();

export function applyReminder(
  reminder: Reminder,
): Promise<ReminderApplyResult> {
  const previous = applyQueues.get(reminder.id) ?? Promise.resolve(null);
  const next = previous
    .catch(() => null)
    .then(() => applyReminderNow(reminder));
  applyQueues.set(reminder.id, next);
  const forget = () => {
    if (applyQueues.get(reminder.id) === next) applyQueues.delete(reminder.id);
  };
  next.then(forget, forget);
  return next;
}

async function applyReminderNow(
  reminder: Reminder,
): Promise<ReminderApplyResult> {
  await cancelReminder(reminder.notificationIds);
  await cancelReminder(await scheduledIdsForReminder(reminder));
  if (reminder.notificationIds.length > 0) {
    await setReminderNotificationIds(reminder.id, []);
  }

  if (!reminder.enabled) {
    return { status: "disabled", enabled: false, notificationIds: [] };
  }

  if (reminder.weekdays.length === 0) {
    await setReminderEnabled(reminder.id, false);
    return { status: "no_days", enabled: false, notificationIds: [] };
  }

  const granted = await ensureNotificationPermission();
  if (!granted) {
    await setReminderEnabled(reminder.id, false);
    return { status: "permission_denied", enabled: false, notificationIds: [] };
  }

  try {
    const notificationIds = await scheduleReminder(reminder);
    await setReminderNotificationIds(reminder.id, notificationIds);
    return { status: "scheduled", enabled: true, notificationIds };
  } catch (error) {
    logger.error("[reminders] programmazione notifiche fallita", error);
    await cancelReminder(await scheduledIdsForReminder(reminder));
    await setReminderEnabled(reminder.id, false);
    return { status: "failed", enabled: false, notificationIds: [] };
  }
}

/**
 * Id delle notifiche già in coda per un promemoria, letti dal sistema.
 *
 * Serve a recuperare gli orfani: notifiche che il sistema ha ancora in coda ma
 * di cui il database ha perso l'id (una programmazione interrotta a metà, o una
 * versione dell'app precedente a `notification_id`).
 *
 * Il ripiego sul `kind` vale SOLO per i quattro preset, che sono unici per
 * definizione. I promemoria creati a mano hanno tutti `kind = "custom"`:
 * accettarlo qui voleva dire che riprogrammarne uno cancellava dal sistema le
 * notifiche di tutti gli altri, che a database restavano accesi con i loro id -
 * la schermata li mostrava attivi e non arrivava più niente.
 */
async function scheduledIdsForReminder(reminder: Reminder): Promise<string[]> {
  const kindIsUnique =
    reminder.kind !== "custom" && REMINDER_KINDS.includes(reminder.kind as never);

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled
      .filter((item) => {
        const data = item.content.data as
          | { reminderId?: string; kind?: string }
          | undefined;
        if (data?.reminderId) return data.reminderId === reminder.id;
        if (kindIsUnique && data?.kind) return data.kind === reminder.kind;
        return false;
      })
      .map((item) => item.identifier);
  } catch (error) {
    logger.error("[reminders] lettura notifiche programmate fallita", error);
    return [];
  }
}
