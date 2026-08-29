import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import { DfSwitch } from "@/src/components/form/DfSwitch";
import { Card, Chip, ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  listReminders,
  REMINDER_KINDS,
  saveReminder,
  type Reminder,
  type ReminderKind,
} from "@/src/db/queries/reminders";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { applyReminder } from "@/src/services/reminders";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import {
  Bell,
  ChevronLeft,
  Clock,
  Dumbbell,
  GlassWater,
  Scale,
  UtensilsCrossed,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

// Orari di partenza plausibili per tipo: un promemoria proposto alle 00:00
// costringerebbe a sistemarlo prima ancora di poterlo accendere.
const DEFAULT_TIME: Record<ReminderKind, string> = {
  meals: "12:30",
  water: "10:00",
  weight: "07:30",
  workout: "18:00",
};

const ICONS: Record<ReminderKind, React.FC<{ size: number; color: string }>> = {
  meals: UtensilsCrossed,
  water: GlassWater,
  weight: Scale,
  workout: Dumbbell,
};

/** Stato mostrato per un tipo: la riga a database se esiste, i valori di partenza se no. */
interface ReminderItem {
  kind: ReminderKind;
  time: string;
  weekdays: number[];
  enabled: boolean;
  stored: Reminder | null;
}

const buildItems = (reminders: Reminder[] | null): ReminderItem[] =>
  REMINDER_KINDS.map((kind) => {
    const stored = reminders?.find((item) => item.kind === kind) ?? null;
    return {
      kind,
      time: stored?.time ?? DEFAULT_TIME[kind],
      weekdays: stored?.weekdays ?? WEEKDAYS,
      enabled: stored?.enabled ?? false,
      stored,
    };
  });

const timeToDate = (time: string): Date => {
  const [hour, minute] = time.split(":").map((part) => Number(part));
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const dateToTime = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

export function RemindersScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

  const loader = useCallback(() => listReminders(), []);
  const { data, loading, reload } = useFocusData<Reminder[]>(loader);

  const [busyKind, setBusyKind] = useState<ReminderKind | null>(null);
  // Il picker iOS vive in una modale: serve sapere quale riga la sta usando e
  // su che ora si sta scorrendo, perché la conferma arriva dopo.
  const [pickingKind, setPickingKind] = useState<ReminderKind | null>(null);
  const [tempTime, setTempTime] = useState<Date>(new Date());

  const items = buildItems(data);

  const persist = async (
    item: ReminderItem,
    next: { time: string; weekdays: number[]; enabled: boolean },
  ) => {
    setBusyKind(item.kind);
    try {
      const saved = await saveReminder({ kind: item.kind, ...next });
      const result = await applyReminder(saved);

      if (result.status === "permission_denied") {
        showToast.error({ title: t("reminders.permission_denied") });
      } else if (result.status === "no_days") {
        showToast.error({ title: t("reminders.no_days") });
      } else if (result.status === "failed") {
        showToast.error({ title: t("reminders.failed") });
      } else if (next.enabled !== item.enabled) {
        // Solo il passaggio acceso/spento merita una conferma: annunciare ogni
        // giorno toccato riempirebbe lo schermo di toast.
        if (result.enabled) {
          showToast.success({
            title: t("reminders.scheduled"),
            message: t("reminders.enabled_at", { time: next.time }),
          });
        } else {
          showToast.info({ title: t("reminders.turned_off") });
        }
      }
    } catch (error) {
      logger.error("[RemindersScreen] salvataggio promemoria fallito", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setBusyKind(null);
      reload();
    }
  };

  const toggleEnabled = (item: ReminderItem, enabled: boolean) => {
    void persist(item, {
      time: item.time,
      weekdays: item.weekdays,
      enabled,
    });
  };

  const toggleWeekday = (item: ReminderItem, day: number) => {
    const active = item.weekdays.includes(day);
    if (active && item.weekdays.length === 1) {
      // Un promemoria senza giorni non suonerebbe mai: meglio dirlo che
      // lasciarlo acceso e muto.
      showToast.error({ title: t("reminders.last_day") });
      return;
    }
    const weekdays = active
      ? item.weekdays.filter((value) => value !== day)
      : [...item.weekdays, day];
    void persist(item, { time: item.time, weekdays, enabled: item.enabled });
  };

  const changeTime = (item: ReminderItem, time: string) => {
    if (time === item.time) return;
    void persist(item, { time, weekdays: item.weekdays, enabled: item.enabled });
  };

  const openTimePicker = (item: ReminderItem) => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: timeToDate(item.time),
        mode: "time",
        is24Hour: true,
        onChange: (_event, selected) => {
          if (selected) changeTime(item, dateToTime(selected));
        },
      });
      return;
    }
    setTempTime(timeToDate(item.time));
    setPickingKind(item.kind);
  };

  const pickingItem = items.find((item) => item.kind === pickingKind) ?? null;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("reminders.title")}
          </Text>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + ASSISTANT_FAB_CLEARANCE },
            ]}
          >
            <View style={styles.intro}>
              <Bell size={18} color={colors.textMuted} />
              <Text
                style={[styles.introText, { color: colors.textMuted }]}
                numberOfLines={2}
              >
                {t("reminders.intro")}
              </Text>
            </View>

            {items.map((item) => {
              const Icon = ICONS[item.kind];
              const busy = busyKind === item.kind;
              return (
                <Card key={item.kind} style={styles.card}>
                  <View style={styles.row}>
                    <Icon size={22} color={colors.textSecondary} />
                    <View style={styles.rowText}>
                      <Text
                        style={[styles.kind, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {t(`reminders.kinds.${item.kind}.label`)}
                      </Text>
                      <Text
                        style={[styles.state, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {item.enabled
                          ? t("reminders.enabled_at", { time: item.time })
                          : t("reminders.off")}
                      </Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <DfSwitch
                        initialValue={item.enabled}
                        onValueChange={(value) => toggleEnabled(item, value)}
                      />
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={() => openTimePicker(item)}
                    activeOpacity={0.6}
                    style={[
                      styles.time,
                      {
                        backgroundColor: colors.surfaceMuted,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Clock size={18} color={colors.textMuted} />
                    <Text
                      style={[styles.timeLabel, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {t("reminders.time")}
                    </Text>
                    <Text style={[styles.timeValue, { color: colors.text }]}>
                      {item.time}
                    </Text>
                  </TouchableOpacity>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.days}
                  >
                    {WEEKDAYS.map((day) => (
                      <Chip
                        key={day}
                        label={t(`reminders.weekdays.${day}`)}
                        active={item.weekdays.includes(day)}
                        onPress={() => toggleWeekday(item, day)}
                      />
                    ))}
                  </ScrollView>
                </Card>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Android apre il picker di sistema, iOS non ha un equivalente imperativo. */}
      {Platform.OS === "ios" && (
        <Modal
          visible={pickingItem !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPickingKind(null)}
        >
          <Pressable
            style={styles.overlay}
            onPress={() => setPickingKind(null)}
          >
            <Pressable
              style={[styles.sheet, { backgroundColor: colors.surface }]}
            >
              <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  onPress={() => setPickingKind(null)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.sheetAction, { color: colors.textMuted }]}>
                    {t("cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => {
                    if (pickingItem) changeTime(pickingItem, dateToTime(tempTime));
                    setPickingKind(null);
                  }}
                >
                  <Text style={[styles.sheetAction, { color: colors.accent }]}>
                    {t("confirm")}
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                display="spinner"
                locale="it"
                onChange={(_event, selected) => {
                  if (selected) setTempTime(selected);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  introText: { flexShrink: 1, fontSize: 13 },
  card: { gap: theme.spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  rowText: { flex: 1 },
  kind: { fontSize: 16, fontWeight: "600" },
  state: { fontSize: 13 },
  time: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  timeLabel: { flexShrink: 1, fontSize: 14 },
  timeValue: { fontSize: 18, fontWeight: "700", marginLeft: "auto" },
  days: { gap: theme.spacing.sm, paddingRight: theme.spacing.xs },
  loader: { marginTop: theme.spacing.xl },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingBottom: theme.spacing.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  sheetAction: { fontSize: 16, fontWeight: "600" },
});
