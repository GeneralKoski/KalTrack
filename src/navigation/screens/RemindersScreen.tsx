import { DfAlert } from "@/src/components/DfAlert";
import { DfSwitch } from "@/src/components/form/DfSwitch";
import { Card, Chip, EmptyState, ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  deleteReminder,
  listReminders,
  reorderReminders,
  saveReminder,
  type Reminder,
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
import * as Haptics from "expo-haptics";
import {
  Apple,
  Bell,
  ChevronLeft,
  Clock,
  Coffee,
  Dumbbell,
  Flame,
  Footprints,
  GlassWater,
  Heart,
  Moon,
  Pencil,
  Pill,
  Plus,
  Scale,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  UtensilsCrossed,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const REMINDER_ICONS: {
  key: string;
  icon: React.FC<{ size: number; color: string }>;
  label: string;
}[] = [
  { key: "water", icon: GlassWater, label: "Acqua" },
  { key: "meals", icon: UtensilsCrossed, label: "Pasto" },
  { key: "apple", icon: Apple, label: "Snack" },
  { key: "coffee", icon: Coffee, label: "Caffè" },
  { key: "pill", icon: Pill, label: "Integratori" },
  { key: "workout", icon: Dumbbell, label: "Allenamento" },
  { key: "footprints", icon: Footprints, label: "Passi" },
  { key: "weight", icon: Scale, label: "Peso" },
  { key: "flame", icon: Flame, label: "Calorie" },
  { key: "heart", icon: Heart, label: "Salute" },
  { key: "sun", icon: Sun, label: "Mattina" },
  { key: "moon", icon: Moon, label: "Sera" },
  { key: "timer", icon: Timer, label: "Digiuno" },
  { key: "bell", icon: Bell, label: "Notifica" },
  { key: "sparkles", icon: Sparkles, label: "Obiettivo" },
];

const getReminderIcon = (kind: string, label: string | null) => {
  const match = REMINDER_ICONS.find((i) => i.key === kind);
  if (match) return match.icon;
  const norm = (label || "").toLowerCase();
  if (
    norm.includes("acqua") ||
    norm.includes("water") ||
    norm.includes("bere")
  ) {
    return GlassWater;
  }
  if (
    norm.includes("pasto") ||
    norm.includes("mangia") ||
    norm.includes("pranzo") ||
    norm.includes("cena") ||
    norm.includes("colazione") ||
    norm.includes("spuntino")
  ) {
    return UtensilsCrossed;
  }
  if (
    norm.includes("peso") ||
    norm.includes("pesat") ||
    norm.includes("bilancia")
  ) {
    return Scale;
  }
  if (
    norm.includes("allen") ||
    norm.includes("palestra") ||
    norm.includes("gym") ||
    norm.includes("workout")
  ) {
    return Dumbbell;
  }
  if (
    norm.includes("integrat") ||
    norm.includes("pill") ||
    norm.includes("vitamin")
  ) {
    return Pill;
  }
  return Bell;
};

const timeToDate = (time: string): Date => {
  const [hour, minute] = time.split(":").map((part) => Number(part));
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const dateToTime = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const CARD_GAP = theme.spacing.sm;

const movePosition = (
  positions: Record<string, number>,
  from: number,
  to: number,
): Record<string, number> => {
  "worklet";
  const next: Record<string, number> = {};
  for (const key of Object.keys(positions)) {
    const value = positions[key];
    if (value === from) {
      next[key] = to;
    } else if (from < to && value > from && value <= to) {
      next[key] = value - 1;
    } else if (from > to && value >= to && value < from) {
      next[key] = value + 1;
    } else {
      next[key] = value;
    }
  }
  return next;
};

interface ReminderCardProps {
  reminder: Reminder;
  busy: boolean;
  dragging?: boolean;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onToggle: (reminder: Reminder, value: boolean) => void;
  onToggleWeekday: (reminder: Reminder, day: number) => void;
  onOpenTimePicker: (reminder: Reminder) => void;
}

function ReminderCard({
  reminder,
  busy,
  dragging = false,
  onEdit,
  onDelete,
  onToggle,
  onToggleWeekday,
  onOpenTimePicker,
}: ReminderCardProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();

  const Icon = getReminderIcon(reminder.kind, reminder.label);
  const labelText =
    reminder.label ||
    (reminder.kind !== "custom"
      ? t(`reminders.kinds.${reminder.kind}.label`, {
          defaultValue: reminder.kind,
        })
      : t("reminders.title"));

  return (
    <Card
      style={[
        styles.card,
        dragging && {
          borderColor: colors.accent,
          borderWidth: 1.5,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.7 : 0.25,
          shadowRadius: 14,
        },
      ]}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: reminder.enabled
                ? colors.surfaceMuted
                : colors.surface,
            },
          ]}
        >
          <Icon
            size={20}
            color={reminder.enabled ? colors.accent : colors.textSecondary}
          />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.kind, { color: colors.text }]} numberOfLines={1}>
            {labelText}
          </Text>
          <Text
            style={[styles.state, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {reminder.enabled
              ? t("reminders.enabled_at", {
                  time: reminder.time,
                })
              : t("reminders.off")}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => onEdit(reminder)}
            activeOpacity={0.6}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Pencil size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(reminder)}
            activeOpacity={0.6}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <Trash2 size={18} color={colors.error} />
          </TouchableOpacity>
          <DfSwitch
            initialValue={reminder.enabled}
            disabled={busy}
            onValueChange={(value) => onToggle(reminder, value)}
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={() => onOpenTimePicker(reminder)}
        activeOpacity={0.6}
        style={[
          styles.time,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
          },
        ]}
      >
        <Clock size={16} color={colors.textMuted} />
        <Text
          style={[styles.timeLabel, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {t("reminders.time")}
        </Text>
        <Text style={[styles.timeValue, { color: colors.text }]}>
          {reminder.time}
        </Text>
      </TouchableOpacity>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={!reminder.enabled && styles.daysOff}
        contentContainerStyle={styles.days}
      >
        {WEEKDAYS.map((day) => (
          <Chip
            key={day}
            label={t(`reminders.weekdays.${day}`)}
            active={reminder.weekdays.includes(day)}
            onPress={() => onToggleWeekday(reminder, day)}
          />
        ))}
      </ScrollView>
    </Card>
  );
}

interface DraggableCardProps extends ReminderCardProps {
  positions: SharedValue<Record<string, number>>;
  itemHeight: SharedValue<number>;
  count: number;
  onDragStateChange: (dragging: boolean) => void;
  onCommit: (order: Record<string, number>) => void;
}

function DraggableCard({
  positions,
  itemHeight,
  count,
  onDragStateChange,
  onCommit,
  ...cardProps
}: DraggableCardProps) {
  const id = cardProps.reminder.id;
  const translateY = useSharedValue(
    (positions.value[id] ?? 0) * itemHeight.value,
  );
  const isDragging = useSharedValue(false);
  const startY = useSharedValue(0);
  const [dragging, setDragging] = useState(false);

  useAnimatedReaction(
    () => (positions.value[id] ?? 0) * itemHeight.value,
    (target, previous) => {
      if (isDragging.value) return;
      if (previous === null || previous === undefined) {
        translateY.value = target;
        return;
      }
      if (target === previous) return;
      translateY.value = withTiming(target, { duration: 180 });
    },
  );

  const handleDragStart = useCallback(() => {
    setDragging(true);
    onDragStateChange(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [onDragStateChange]);

  const handleSwap = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const handleDragEnd = useCallback(
    (order: Record<string, number>) => {
      setDragging(false);
      onDragStateChange(false);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onCommit(order);
    },
    [onDragStateChange, onCommit],
  );

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      isDragging.value = true;
      startY.value = translateY.value;
      runOnJS(handleDragStart)();
    })
    .onUpdate((e) => {
      translateY.value = startY.value + e.translationY;
      const current = positions.value[id] ?? 0;
      const slot = Math.round(translateY.value / itemHeight.value);
      const next = Math.max(0, Math.min(count - 1, slot));
      if (next !== current) {
        positions.value = movePosition(positions.value, current, next);
        runOnJS(handleSwap)();
      }
    })
    .onFinalize(() => {
      if (!isDragging.value) return;
      const target = (positions.value[id] ?? 0) * itemHeight.value;
      translateY.value = withTiming(target, { duration: 160 }, (finished) => {
        if (finished) {
          isDragging.value = false;
          runOnJS(handleDragEnd)(positions.value);
        }
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: withTiming(isDragging.value ? 1.02 : 1, { duration: 150 }) },
    ],
    zIndex: isDragging.value ? 999 : 0,
    elevation: isDragging.value ? 12 : 0,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.dragItem, animatedStyle]}>
        <ReminderCard {...cardProps} dragging={dragging} />
      </Animated.View>
    </GestureDetector>
  );
}

export function RemindersScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

  const loader = useCallback(() => listReminders(), []);
  const { data: reminders, loading, reload } = useFocusData<Reminder[]>(loader);

  const [items, setItems] = useState<Reminder[]>([]);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [pickingReminderId, setPickingReminderId] = useState<string | null>(
    null,
  );
  const [tempTime, setTempTime] = useState<Date>(new Date());

  // Drag & drop state
  const [dragging, setDragging] = useState(false);
  const [cardHeight, setCardHeight] = useState<number | null>(null);
  const positions = useSharedValue<Record<string, number>>({});
  const itemHeight = useSharedValue(0);
  const itemsRef = useRef<Reminder[]>([]);

  useEffect(() => {
    if (reminders) {
      setItems(reminders);
      itemsRef.current = reminders;
    }
  }, [reminders]);

  useEffect(() => {
    const next: Record<string, number> = {};
    items.forEach((item, index) => {
      next[item.id] = index;
    });
    positions.value = next;
  }, [items, positions]);

  // Modal creazione / modifica
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [formName, setFormName] = useState("");
  const [formKind, setFormKind] = useState("water");
  const [formTime, setFormTime] = useState("09:00");
  const [formWeekdays, setFormWeekdays] = useState<number[]>(WEEKDAYS);
  const [savingForm, setSavingForm] = useState(false);

  // Dialog eliminazione
  const [deletingReminder, setDeletingReminder] = useState<Reminder | null>(
    null,
  );

  const openAddModal = () => {
    setEditingReminder(null);
    setFormName("");
    setFormKind("water");
    setFormTime("09:00");
    setFormWeekdays(WEEKDAYS);
    setModalOpen(true);
  };

  const openEditModal = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setFormName(
      reminder.label ||
        (reminder.kind !== "custom"
          ? t(`reminders.kinds.${reminder.kind}.label`, {
              defaultValue: reminder.kind,
            })
          : ""),
    );
    setFormKind(reminder.kind || "water");
    setFormTime(reminder.time);
    setFormWeekdays(
      reminder.weekdays.length > 0 ? reminder.weekdays : WEEKDAYS,
    );
    setModalOpen(true);
  };

  const persist = async (
    reminder: Reminder,
    next: {
      label?: string | null;
      time: string;
      weekdays: number[];
      enabled: boolean;
    },
  ) => {
    setBusyIds((current) =>
      current.includes(reminder.id) ? current : [...current, reminder.id],
    );
    try {
      const saved = await saveReminder({
        id: reminder.id,
        kind: reminder.kind,
        label: next.label !== undefined ? next.label : reminder.label,
        time: next.time,
        weekdays: next.weekdays,
        enabled: next.enabled,
      });
      const result = await applyReminder(saved);

      if (result.status === "permission_denied") {
        showToast.error({ title: t("reminders.permission_denied") });
      } else if (result.status === "no_days") {
        showToast.error({ title: t("reminders.no_days") });
      } else if (result.status === "failed") {
        showToast.error({ title: t("reminders.failed") });
      } else if (next.enabled !== reminder.enabled) {
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
      setBusyIds((current) => current.filter((id) => id !== reminder.id));
      reload();
    }
  };

  const handleSaveModal = async () => {
    const trimmed = formName.trim();
    if (!trimmed) {
      showToast.error({ title: t("reminders.name_required") });
      return;
    }
    if (formWeekdays.length === 0) {
      showToast.error({ title: t("reminders.last_day") });
      return;
    }

    setSavingForm(true);
    try {
      const saved = await saveReminder({
        id: editingReminder?.id,
        kind: formKind,
        label: trimmed,
        time: formTime,
        weekdays: formWeekdays,
        enabled: editingReminder ? editingReminder.enabled : true,
      });
      await applyReminder(saved);
      showToast.success({
        title: editingReminder ? t("save") : t("reminders.scheduled"),
      });
      setModalOpen(false);
      reload();
    } catch (error) {
      logger.error("[RemindersScreen] salvataggio modale fallito", error);
      showToast.error({ title: t("general_error") });
    } finally {
      setSavingForm(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingReminder) return;
    try {
      await applyReminder({ ...deletingReminder, enabled: false });
      await deleteReminder(deletingReminder.id);
      showToast.info({ title: t("reminders.delete_done") });
      setDeletingReminder(null);
      reload();
    } catch (error) {
      logger.error("[RemindersScreen] cancellazione promemoria fallita", error);
      showToast.error({ title: t("general_error") });
    }
  };

  const toggleEnabled = (reminder: Reminder, enabled: boolean) => {
    void persist(reminder, {
      time: reminder.time,
      weekdays: reminder.weekdays,
      enabled,
    });
  };

  const toggleWeekday = (reminder: Reminder, day: number) => {
    const active = reminder.weekdays.includes(day);
    if (active && reminder.weekdays.length === 1) {
      showToast.error({ title: t("reminders.last_day") });
      return;
    }
    const weekdays = active
      ? reminder.weekdays.filter((value) => value !== day)
      : [...reminder.weekdays, day];
    void persist(reminder, {
      time: reminder.time,
      weekdays,
      enabled: reminder.enabled,
    });
  };

  const changeTime = (reminder: Reminder, time: string) => {
    if (time === reminder.time) return;
    void persist(reminder, {
      time,
      weekdays: reminder.weekdays,
      enabled: reminder.enabled,
    });
  };

  const openTimePicker = (reminder: Reminder) => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: timeToDate(reminder.time),
        mode: "time",
        is24Hour: true,
        onChange: (_event, selected) => {
          if (selected) changeTime(reminder, dateToTime(selected));
        },
      });
      return;
    }
    setTempTime(timeToDate(reminder.time));
    setPickingReminderId(reminder.id);
  };

  const openModalTimePicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: timeToDate(formTime),
        mode: "time",
        is24Hour: true,
        onChange: (_event, selected) => {
          if (selected) setFormTime(dateToTime(selected));
        },
      });
    }
  };

  // Drag & drop: la posizione visiva vive nei shared value, l'array si
  // riallinea solo a rilascio avvenuto (stesso ordine gia' mostrato a schermo)
  const measureCard = useCallback(
    (height: number) => {
      if (height <= 0) return;
      itemHeight.value = height + CARD_GAP;
      setCardHeight(height);
    },
    [itemHeight],
  );

  const handleCommit = useCallback((order: Record<string, number>) => {
    const current = itemsRef.current;
    const ordered = [...current].sort(
      (a, b) => (order[a.id] ?? 0) - (order[b.id] ?? 0),
    );
    if (ordered.every((item, index) => item.id === current[index]?.id)) return;

    itemsRef.current = ordered;
    setItems(ordered);
    reorderReminders(ordered.map((r) => r.id)).catch((error) => {
      logger.error(
        "[RemindersScreen] salvataggio riordinamento fallito",
        error,
      );
    });
  }, []);

  const pickingReminder =
    items.find((item) => item.id === pickingReminderId) ?? null;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {t("reminders.title")}
          </Text>
          <TouchableOpacity
            onPress={openAddModal}
            activeOpacity={0.6}
            hitSlop={10}
            style={[styles.addButton, { backgroundColor: colors.accent }]}
          >
            <Plus size={20} color={colors.accentOn} />
          </TouchableOpacity>
        </View>

        {loading && !reminders ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            scrollEnabled={!dragging}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
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

            {items.length > 0 ? (
              cardHeight === null ? (
                items.map((reminder, index) => (
                  <View
                    key={reminder.id}
                    onLayout={
                      index === 0
                        ? (e) => measureCard(e.nativeEvent.layout.height)
                        : undefined
                    }
                  >
                    <ReminderCard
                      reminder={reminder}
                      busy={busyIds.includes(reminder.id)}
                      onEdit={openEditModal}
                      onDelete={setDeletingReminder}
                      onToggle={toggleEnabled}
                      onToggleWeekday={toggleWeekday}
                      onOpenTimePicker={openTimePicker}
                    />
                  </View>
                ))
              ) : (
                <View
                  style={{
                    height:
                      items.length * (cardHeight + CARD_GAP) - CARD_GAP,
                  }}
                >
                  {items.map((reminder) => (
                    <DraggableCard
                      key={reminder.id}
                      reminder={reminder}
                      positions={positions}
                      itemHeight={itemHeight}
                      count={items.length}
                      busy={busyIds.includes(reminder.id)}
                      onDragStateChange={setDragging}
                      onCommit={handleCommit}
                      onEdit={openEditModal}
                      onDelete={setDeletingReminder}
                      onToggle={toggleEnabled}
                      onToggleWeekday={toggleWeekday}
                      onOpenTimePicker={openTimePicker}
                    />
                  ))}
                </View>
              )
            ) : (
              <Card>
                <EmptyState
                  message={t("reminders.empty")}
                  icon={<Bell size={40} color={colors.textFaint} />}
                />
              </Card>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Modal Aggiungi / Modifica Promemoria */}
      <DfAlert
        isOpen={modalOpen}
        title={
          editingReminder
            ? t("reminders.edit_reminder")
            : t("reminders.add_reminder")
        }
        confirmLabel={t("save")}
        loading={savingForm}
        onConfirm={handleSaveModal}
        onClose={() => setModalOpen(false)}
      >
        <View style={styles.modalBody}>
          <Text style={[styles.modalLabel, { color: colors.text }]}>
            {t("reminders.reminder_name")}
          </Text>
          <TextInput
            value={formName}
            onChangeText={setFormName}
            placeholder={t("reminders.reminder_name_placeholder")}
            placeholderTextColor={colors.textFaint}
            style={[
              styles.modalInput,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
          />

          <Text style={[styles.modalLabel, { color: colors.text }]}>
            {t("reminders.icon")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.iconSelectorRow}
          >
            {REMINDER_ICONS.map((item) => {
              const isSelected = formKind === item.key;
              const ItemIcon = item.icon;
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => setFormKind(item.key)}
                  activeOpacity={0.6}
                  style={[
                    styles.iconChoiceBtn,
                    {
                      backgroundColor: isSelected
                        ? colors.accent
                        : colors.surfaceMuted,
                      borderColor: isSelected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <ItemIcon
                    size={20}
                    color={
                      isSelected ? colors.accentOn : colors.textSecondary
                    }
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.modalLabel, { color: colors.text }]}>
            {t("reminders.time")}
          </Text>
          <TouchableOpacity
            onPress={openModalTimePicker}
            activeOpacity={0.6}
            style={[
              styles.modalTimeButton,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          >
            <Clock size={18} color={colors.accent} />
            <Text style={[styles.modalTimeText, { color: colors.text }]}>
              {formTime}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.modalLabel, { color: colors.text }]}>
            {t("reminders.days")}
          </Text>
          <View style={styles.modalDaysRow}>
            {WEEKDAYS.map((day) => {
              const active = formWeekdays.includes(day);
              return (
                <Chip
                  key={day}
                  label={t(`reminders.weekdays.${day}`)}
                  active={active}
                  onPress={() => {
                    setFormWeekdays((current) =>
                      current.includes(day)
                        ? current.filter((d) => d !== day)
                        : [...current, day].sort((a, b) => a - b),
                    );
                  }}
                />
              );
            })}
          </View>
        </View>
      </DfAlert>

      {/* Dialog Conferma Cancellazione */}
      <DfAlert
        isOpen={deletingReminder !== null}
        title={t("reminders.delete_title")}
        message={t("reminders.delete_confirm")}
        confirmLabel={t("delete")}
        confirmColor="danger"
        onConfirm={handleDelete}
        onClose={() => setDeletingReminder(null)}
      />

      {/* Picker iOS time */}
      {Platform.OS === "ios" && (
        <Modal
          visible={pickingReminder !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPickingReminderId(null)}
        >
          <Pressable
            style={styles.overlay}
            onPress={() => setPickingReminderId(null)}
          >
            <Pressable
              style={[styles.sheet, { backgroundColor: colors.surface }]}
            >
              <View
                style={[
                  styles.sheetHeader,
                  { borderBottomColor: colors.border },
                ]}
              >
                <TouchableOpacity
                  onPress={() => setPickingReminderId(null)}
                  activeOpacity={0.6}
                >
                  <Text
                    style={[styles.sheetAction, { color: colors.textMuted }]}
                  >
                    {t("cancel")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => {
                    if (pickingReminder)
                      changeTime(pickingReminder, dateToTime(tempTime));
                    setPickingReminderId(null);
                  }}
                >
                  <Text
                    style={[styles.sheetAction, { color: colors.accent }]}
                  >
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
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
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
  dragItem: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  card: { gap: theme.spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  kind: { fontSize: 15, fontWeight: "600" },
  state: { fontSize: 12 },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    padding: 4,
  },
  time: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  timeLabel: { flexShrink: 1, fontSize: 13 },
  timeValue: { fontSize: 16, fontWeight: "700", marginLeft: "auto" },
  daysOff: { opacity: 0.45 },
  days: { gap: 6, paddingRight: theme.spacing.xs },
  loader: { marginTop: theme.spacing.xl },
  modalBody: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  modalInput: {
    fontSize: 14,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  iconSelectorRow: {
    gap: 8,
    paddingVertical: 4,
  },
  iconChoiceBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  modalTimeText: {
    fontSize: 16,
    fontWeight: "700",
  },
  modalDaysRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
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
