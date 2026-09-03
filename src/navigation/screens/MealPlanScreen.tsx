import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  AddEntrySheet,
  type DiaryPick,
} from "@/src/containers/diary/AddEntrySheet";
import { GenerateMealPlanModal } from "@/src/containers/planning/GenerateMealPlanModal";
import { PlanDayColumn } from "@/src/containers/planning/PlanDayColumn";
import { QuantityPrompt } from "@/src/containers/recipes/QuantityPrompt";
import { listAllMealTypes } from "@/src/db/queries/diary";
import {
  addPlanEntry,
  applyPlanToDiary,
  copyPlanDays,
  deletePlanEntry,
  isPlanApplied,
  listPlanEntries,
  type PlanEntry,
} from "@/src/db/queries/mealPlan";
import { getTargetsFor } from "@/src/db/queries/settings";
import { addDays, startOfWeek, todayIso, toIsoDate } from "@/src/domain/date";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { MealTypeRow, TargetRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import {
  Calendar,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  ShoppingCart,
  Sparkles,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
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
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const formatDay = (iso: string): string => {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};

const formatLong = (iso: string): string => {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

const parseIso = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

/** Quantità di partenza di un alimento messo a piano, in grammi. */
const DEFAULT_GRAMS = 100;

interface WeekData {
  entries: PlanEntry[];
  mealTypes: MealTypeRow[];
  /** Giorni della settimana già trasferiti nel diario. */
  applied: Record<string, boolean>;
  currentTargets?: TargetRow | null;
}

export function MealPlanScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayIso()));
  const [selectedDate, setSelectedDate] = useState(() => todayIso());
  const [pendingMealTypeId, setPendingMealTypeId] = useState<string | null>(
    null,
  );
  const [pendingPick, setPendingPick] = useState<DiaryPick | null>(null);
  const [labelText, setLabelText] = useState("");
  const [confirmApply, setConfirmApply] = useState(false);
  const [applyTargetDate, setApplyTargetDate] = useState(() => todayIso());
  const [showIosApplyDatePicker, setShowIosApplyDatePicker] = useState(false);
  const [applyTempDate, setApplyTempDate] = useState<Date>(new Date());

  const [confirmCopy, setConfirmCopy] = useState(false);
  const [copySourceDays, setCopySourceDays] = useState<string[]>(() => [
    todayIso(),
  ]);
  const [copyTargetDate, setCopyTargetDate] = useState(() =>
    addDays(todayIso(), 1),
  );
  const [showIosCopyDatePicker, setShowIosCopyDatePicker] = useState(false);
  const [copyTempDate, setCopyTempDate] = useState<Date>(new Date());

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlanEntry | null>(null);
  const addSheetRef = useRef<BottomSheetModal>(null);

  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const openApply = () => {
    setApplyTargetDate(todayIso());
    setConfirmApply(true);
  };

  const openCopy = () => {
    setCopySourceDays([selectedDate]);
    setCopyTargetDate(addDays(selectedDate, 1));
    setConfirmCopy(true);
  };

  const toggleCopySourceDay = (day: string) => {
    setCopySourceDays((current) => {
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day];
      return next.sort();
    });
  };

  const openApplyDatePicker = () => {
    const d = parseIso(applyTargetDate);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: d,
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "set" && date) {
            setApplyTargetDate(toIsoDate(date));
          }
        },
      });
    } else {
      setApplyTempDate(d);
      setShowIosApplyDatePicker(true);
    }
  };

  const openCopyDatePicker = () => {
    const d = parseIso(copyTargetDate);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: d,
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "set" && date) {
            setCopyTargetDate(toIsoDate(date));
          }
        },
      });
    } else {
      setCopyTempDate(d);
      setShowIosCopyDatePicker(true);
    }
  };

  const loader = useCallback(async (): Promise<WeekData> => {
    const [entries, mealTypes, currentTargets] = await Promise.all([
      listPlanEntries(weekStart, weekEnd),
      listAllMealTypes(),
      getTargetsFor(selectedDate),
    ]);
    const applied: Record<string, boolean> = {};
    for (const day of Array.from({ length: 7 }, (_, i) =>
      addDays(weekStart, i),
    )) {
      applied[day] = await isPlanApplied(day);
    }
    return { entries, mealTypes, applied, currentTargets };
  }, [weekStart, weekEnd, selectedDate]);

  const { data, loading, reload } = useFocusData<WeekData>(loader);

  const changeWeek = (delta: number) => {
    const nextStart = addDays(weekStart, delta * 7);
    setWeekStart(nextStart);
    // Il giorno selezionato segue la settimana, mantenendo la posizione: senza,
    // resterebbe fuori dai chip e non si capirebbe più cosa si sta guardando.
    setSelectedDate(addDays(selectedDate, delta * 7));
  };

  const dayEntries = (data?.entries ?? []).filter(
    (entry) => entry.row.date === selectedDate,
  );
  const knownKcal = dayEntries
    .filter((entry) => entry.kcal !== null)
    .reduce((sum, entry) => sum + (entry.kcal ?? 0), 0);
  const hasUnknown = dayEntries.some((entry) => entry.kcal === null);
  /* Le colonne sono i pasti attivi, piu' quelli spenti che in questo giorno
     hanno gia' delle righe: spegnere un pasto toglie una scelta, non nasconde
     quel che era gia' pianificato. Il foglio Aggiungi invece offre solo gli
     attivi. */
  const activeMealTypes = (data?.mealTypes ?? []).filter(
    (type) => type.hidden === 0,
  );
  const columnMealTypes = (data?.mealTypes ?? []).filter(
    (type) =>
      type.hidden === 0 ||
      dayEntries.some((entry) => entry.row.meal_type_id === type.id),
  );
  const isApplied = data?.applied[selectedDate] ?? false;

  const openAdd = (mealTypeId: string) => {
    setPendingMealTypeId(mealTypeId);
    addSheetRef.current?.present();
  };

  const onPick = (picked: DiaryPick) => {
    addSheetRef.current?.dismiss();
    if (picked.kind === "free") {
      setLabelText("");
    }
    setPendingPick(picked);
  };

  /**
   * Esegue un'azione riportando l'esito. Senza, una promise rigettata dopo la
   * chiusura del dialogo non lascia traccia: l'utente vede il tocco non
   * produrre nulla e non sa perché. Capita davvero, per esempio quando il piano
   * referenzia un alimento cancellato dall'archivio.
   */
  const guarded = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
      reload();
    } catch (error) {
      logger.error("[MealPlanScreen] azione fallita", error);
      showToast.error({ title: t(failure) });
    }
  };

  const saveQuantity = async (value: number) => {
    const pick = pendingPick;
    const mealTypeId = pendingMealTypeId;
    setPendingPick(null);
    if (!pick || !mealTypeId || pick.kind === "free") return;

    await guarded(
      () =>
        addPlanEntry({
          date: selectedDate,
          mealTypeId,
          foodId: pick.kind === "food" ? pick.food.id : null,
          recipeId: pick.kind === "recipe" ? pick.recipe.id : null,
          quantityG: pick.kind === "food" ? value : null,
          servings: pick.kind === "recipe" ? value : null,
        }),
      "plan.save_failed",
    );
  };

  const saveLabel = async () => {
    const mealTypeId = pendingMealTypeId;
    const label = labelText.trim();
    if (!mealTypeId || label === "") {
      showToast.error({ title: t("plan.label_required") });
      return;
    }
    setPendingPick(null);
    await guarded(
      () => addPlanEntry({ date: selectedDate, mealTypeId, label }),
      "plan.save_failed",
    );
  };

  const removeEntry = async () => {
    const entry = pendingDelete;
    setPendingDelete(null);
    if (!entry) return;
    await deletePlanEntry(entry.row.id);
    showToast.success({ title: t("plan.deleted") });
    reload();
  };

  const applyDay = async () => {
    setConfirmApply(false);
    let result: Awaited<ReturnType<typeof applyPlanToDiary>>;
    try {
      result = await applyPlanToDiary(selectedDate, applyTargetDate);
    } catch (error) {
      // Capita quando il piano referenzia un alimento poi cancellato: la
      // transazione va in rollback e senza questo il tocco non produrrebbe
      // nulla, senza spiegazione.
      logger.error("[MealPlanScreen] trasferimento nel diario fallito", error);
      showToast.error({ title: t("plan.apply_failed") });
      return;
    }
    if (result.alreadyApplied) {
      showToast.info({ title: t("plan.apply_already") });
      return;
    }
    if (result.created === 0 && result.skipped === 0) {
      showToast.info({ title: t("plan.apply_empty") });
      return;
    }
    showToast.success({
      title: t("plan.apply_done", { count: result.created }),
      message:
        result.skipped > 0
          ? t("plan.apply_skipped", { count: result.skipped })
          : undefined,
    });
    reload();
  };

  const handleCopyDays = async () => {
    if (copySourceDays.length === 0) return;
    setConfirmCopy(false);
    try {
      const copied = await copyPlanDays(copySourceDays, copyTargetDate);
      if (copied === 0) {
        showToast.info({ title: t("plan.copy_days_empty") });
        return;
      }
      showToast.success({
        title: t("plan.copy_days_done", { count: copied }),
      });
      reload();
    } catch (error) {
      logger.error("[MealPlanScreen] copia giornate fallita", error);
      showToast.error({ title: t("plan.copy_days_failed") });
    }
  };

  const openShoppingList = () => {
    // NavParams di useAppNav non conosce ancora questa rotta (il file è
    // condiviso): finché non ci viene aggiunta si passa dal navigator grezzo.
    const navigate = navigation.navigate as unknown as (
      name: string,
      params?: object,
    ) => void;
    navigate("ShoppingList");
  };

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
            {t("plan.title")}
          </Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => setAiModalOpen(true)}
              activeOpacity={0.6}
              hitSlop={10}
            >
              <Sparkles size={20} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openShoppingList}
              activeOpacity={0.6}
              hitSlop={10}
            >
              <ShoppingCart size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.weekRow}>
          <TouchableOpacity
            onPress={() => changeWeek(-1)}
            activeOpacity={0.6}
            hitSlop={10}
            style={styles.weekNavButton}
          >
            <ChevronLeft size={16} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.weekLabel, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {t("plan.week_of", { date: formatDay(weekStart) })}
          </Text>
          <TouchableOpacity
            onPress={() => changeWeek(1)}
            activeOpacity={0.6}
            hitSlop={10}
            style={styles.weekNavButton}
          >
            <ChevronRight size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.dayChipsRow}>
          {days.map((day, index) => (
            <DayChip
              key={day}
              weekday={WEEKDAYS[index]}
              dayNumber={Number(day.slice(8, 10))}
              selected={day === selectedDate}
              isToday={day === todayIso()}
              planned={(data?.entries ?? []).some((e) => e.row.date === day)}
              onPress={() => setSelectedDate(day)}
            />
          ))}
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.summary}>
              <Text
                style={[styles.summaryText, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {dayEntries.length === 0
                  ? t("plan.empty_day")
                  : t(hasUnknown ? "plan.day_kcal_partial" : "plan.day_kcal", {
                      kcal: Math.round(knownKcal),
                    })}
              </Text>
              {isApplied ? (
                <View style={styles.badge}>
                  <CheckCheck size={14} color={colors.textMuted} />
                  <Text style={[styles.badgeText, { color: colors.textMuted }]}>
                    {t("plan.applied_badge")}
                  </Text>
                </View>
              ) : null}
            </View>

            <PlanDayColumn
              mealTypes={columnMealTypes}
              entries={dayEntries}
              onAdd={openAdd}
              onDelete={setPendingDelete}
            />

            <View style={styles.actions}>
              <DfButton
                label={t("plan.apply")}
                onPress={openApply}
                disabled={dayEntries.length === 0}
                icon={<CheckCheck size={16} color={colors.text} />}
              />
              <DfButton
                label={t("plan.copy_days")}
                variant="ghost"
                onPress={openCopy}
                icon={<CopyPlus size={16} color={colors.textSecondary} />}
              />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      <AddEntrySheet
        ref={addSheetRef}
        mealTypes={activeMealTypes}
        mealTypeId={pendingMealTypeId}
        onChangeMealType={setPendingMealTypeId}
        onPick={onPick}
      />

      <QuantityPrompt
        isOpen={pendingPick !== null && pendingPick.kind !== "free"}
        title={
          pendingPick?.kind === "recipe"
            ? pendingPick.recipe.name
            : pendingPick?.kind === "food"
              ? pendingPick.food.name
              : ""
        }
        unit={
          pendingPick?.kind === "recipe"
            ? t("recipes.servings_unit")
            : t("plan.grams_unit")
        }
        initialValue={pendingPick?.kind === "recipe" ? 1 : DEFAULT_GRAMS}
        onConfirm={saveQuantity}
        onClose={() => setPendingPick(null)}
      />

      <DfAlert
        isOpen={pendingPick?.kind === "free"}
        title={t("plan.label_title")}
        confirmLabel={t("save")}
        onConfirm={saveLabel}
        onClose={() => setPendingPick(null)}
      >
        <TextInput
          value={labelText}
          onChangeText={setLabelText}
          placeholder={t("plan.label_placeholder")}
          placeholderTextColor={colors.textFaint}
          autoFocus
          style={[
            styles.labelInput,
            { borderColor: colors.border, color: colors.text },
          ]}
        />
      </DfAlert>

      <DfAlert
        isOpen={confirmApply}
        title={t("plan.apply_title")}
        confirmLabel={t("confirm")}
        onConfirm={applyDay}
        onClose={() => setConfirmApply(false)}
      >
        <View style={styles.modalBody}>
          <Text style={[styles.modalDesc, { color: colors.textMuted }]}>
            {t("plan.apply_dialog_desc")}
          </Text>

          <View style={styles.quickChips}>
            <TouchableOpacity
              onPress={() => setApplyTargetDate(todayIso())}
              activeOpacity={0.6}
              style={[
                styles.quickChip,
                {
                  backgroundColor:
                    applyTargetDate === todayIso()
                      ? colors.accent
                      : colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[
                  styles.quickChipText,
                  {
                    color:
                      applyTargetDate === todayIso()
                        ? colors.accentOn
                        : colors.textMuted,
                  },
                ]}
              >
                {t("diary.day_today")}
              </Text>
            </TouchableOpacity>

            {selectedDate !== todayIso() ? (
              <TouchableOpacity
                onPress={() => setApplyTargetDate(selectedDate)}
                activeOpacity={0.6}
                style={[
                  styles.quickChip,
                  {
                    backgroundColor:
                      applyTargetDate === selectedDate
                        ? colors.accent
                        : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.quickChipText,
                    {
                      color:
                        applyTargetDate === selectedDate
                          ? colors.accentOn
                          : colors.textMuted,
                    },
                  ]}
                >
                  {formatDay(selectedDate)}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={openApplyDatePicker}
            activeOpacity={0.6}
            style={[styles.datePickerBtn, { borderColor: colors.border }]}
          >
            <Calendar size={18} color={colors.textSecondary} />
            <Text style={[styles.datePickerText, { color: colors.text }]}>
              {formatLong(applyTargetDate)}
            </Text>
          </TouchableOpacity>
        </View>
      </DfAlert>

      <DfAlert
        isOpen={confirmCopy}
        title={t("plan.copy_days_title")}
        confirmLabel={t("confirm")}
        confirmColor={colors.accent}
        onConfirm={handleCopyDays}
        onClose={() => setConfirmCopy(false)}
      >
        <View style={styles.modalBody}>
          <Text style={[styles.modalSectionTitle, { color: colors.text }]}>
            {t("plan.copy_days_source_desc")}
          </Text>

          <View style={styles.copyDaysRow}>
            {days.map((day, index) => {
              const selected = copySourceDays.includes(day);
              const hasEntries = (data?.entries ?? []).some(
                (e) => e.row.date === day,
              );
              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => toggleCopySourceDay(day)}
                  activeOpacity={0.6}
                  style={[
                    styles.copyDayChip,
                    {
                      backgroundColor: selected
                        ? colors.accent
                        : colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.copyDayChipWeekday,
                      { color: selected ? colors.accentOn : colors.textMuted },
                    ]}
                  >
                    {WEEKDAYS[index]}
                  </Text>
                  <Text
                    style={[
                      styles.copyDayChipNum,
                      { color: selected ? colors.accentOn : colors.text },
                    ]}
                  >
                    {Number(day.slice(8, 10))}
                  </Text>
                  <View
                    style={[
                      styles.copyDayDot,
                      {
                        backgroundColor: hasEntries
                          ? selected
                            ? colors.accentOn
                            : colors.textSecondary
                          : "transparent",
                      },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.copyQuickSelect}>
            <TouchableOpacity
              onPress={() => setCopySourceDays([selectedDate])}
              activeOpacity={0.6}
            >
              <Text style={[styles.quickSelectLink, { color: colors.accent }]}>
                {t("plan.current_day")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setCopySourceDays(days)}
              activeOpacity={0.6}
            >
              <Text style={[styles.quickSelectLink, { color: colors.accent }]}>
                {t("plan.all_week")}
              </Text>
            </TouchableOpacity>
          </View>

          <Text
            style={[
              styles.modalSectionTitle,
              { color: colors.text, marginTop: theme.spacing.xs },
            ]}
          >
            {t("plan.copy_days_target_desc")}
          </Text>

          <View style={styles.quickChips}>
            <TouchableOpacity
              onPress={() => setCopyTargetDate(addDays(todayIso(), 1))}
              activeOpacity={0.6}
              style={[
                styles.quickChip,
                {
                  backgroundColor:
                    copyTargetDate === addDays(todayIso(), 1)
                      ? colors.accent
                      : colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[
                  styles.quickChipText,
                  {
                    color:
                      copyTargetDate === addDays(todayIso(), 1)
                        ? colors.accentOn
                        : colors.textMuted,
                  },
                ]}
              >
                {t("diary.day_tomorrow")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setCopyTargetDate(addDays(weekStart, 7))}
              activeOpacity={0.6}
              style={[
                styles.quickChip,
                {
                  backgroundColor:
                    copyTargetDate === addDays(weekStart, 7)
                      ? colors.accent
                      : colors.surfaceMuted,
                },
              ]}
            >
              <Text
                style={[
                  styles.quickChipText,
                  {
                    color:
                      copyTargetDate === addDays(weekStart, 7)
                        ? colors.accentOn
                        : colors.textMuted,
                  },
                ]}
              >
                {t("shopping.range_next_week")}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={openCopyDatePicker}
            activeOpacity={0.6}
            style={[styles.datePickerBtn, { borderColor: colors.border }]}
          >
            <Calendar size={18} color={colors.textSecondary} />
            <Text style={[styles.datePickerText, { color: colors.text }]}>
              {formatLong(copyTargetDate)}
            </Text>
          </TouchableOpacity>
        </View>
      </DfAlert>

      <DfAlert
        isOpen={pendingDelete !== null}
        title={t("plan.delete_title")}
        message={pendingDelete?.name}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        onConfirm={removeEntry}
        onClose={() => setPendingDelete(null)}
      />

      {showIosApplyDatePicker && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setShowIosApplyDatePicker(false)}
        >
          <Pressable
            style={styles.iosModalOverlay}
            onPress={() => setShowIosApplyDatePicker(false)}
          >
            <Pressable
              style={[
                styles.iosModalContent,
                { backgroundColor: colors.surface },
              ]}
            >
              <View
                style={[
                  styles.iosModalHeader,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Pressable onPress={() => setShowIosApplyDatePicker(false)}>
                  <Text
                    style={[styles.iosModalCancel, { color: colors.textMuted }]}
                  >
                    {t("cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setApplyTargetDate(toIsoDate(applyTempDate));
                    setShowIosApplyDatePicker(false);
                  }}
                >
                  <Text
                    style={[styles.iosModalConfirm, { color: colors.accent }]}
                  >
                    {t("confirm")}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={applyTempDate}
                mode="date"
                display="spinner"
                locale="it"
                onChange={(_event, selected) => {
                  if (selected) setApplyTempDate(selected);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {showIosCopyDatePicker && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setShowIosCopyDatePicker(false)}
        >
          <Pressable
            style={styles.iosModalOverlay}
            onPress={() => setShowIosCopyDatePicker(false)}
          >
            <Pressable
              style={[
                styles.iosModalContent,
                { backgroundColor: colors.surface },
              ]}
            >
              <View
                style={[
                  styles.iosModalHeader,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Pressable onPress={() => setShowIosCopyDatePicker(false)}>
                  <Text
                    style={[styles.iosModalCancel, { color: colors.textMuted }]}
                  >
                    {t("cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setCopyTargetDate(toIsoDate(copyTempDate));
                    setShowIosCopyDatePicker(false);
                  }}
                >
                  <Text
                    style={[styles.iosModalConfirm, { color: colors.accent }]}
                  >
                    {t("confirm")}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={copyTempDate}
                mode="date"
                display="spinner"
                locale="it"
                onChange={(_event, selected) => {
                  if (selected) setCopyTempDate(selected);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <GenerateMealPlanModal
        isOpen={aiModalOpen}
        selectedDate={selectedDate}
        weekStart={weekStart}
        currentTargets={data?.currentTargets}
        onGenerated={() => reload()}
        onClose={() => setAiModalOpen(false)}
      />
    </View>
  );
}

const DayChip: React.FC<{
  weekday: string;
  dayNumber: number;
  selected: boolean;
  isToday: boolean;
  planned: boolean;
  onPress: () => void;
}> = ({ weekday, dayNumber, selected, isToday, planned, onPress }) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.dayChip,
        {
          backgroundColor: selected ? colors.accent : colors.surfaceMuted,
          borderWidth: 2,
          borderColor: isToday ? theme.colors.white : "transparent",
        },
      ]}
    >
      <Text
        style={[
          styles.dayChipWeekday,
          { color: selected ? colors.accentOn : colors.textMuted },
        ]}
        numberOfLines={1}
      >
        {weekday}
      </Text>
      <Text
        style={[
          styles.dayChipDay,
          { color: selected ? colors.accentOn : colors.text },
        ]}
        numberOfLines={1}
      >
        {dayNumber}
      </Text>
      <View
        style={[
          styles.dayChipDot,
          {
            backgroundColor: planned
              ? selected
                ? colors.accentOn
                : colors.textSecondary
              : "transparent",
          },
        ]}
      />
    </TouchableOpacity>
  );
};

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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 2,
  },
  weekNavButton: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabel: { fontSize: 13, fontWeight: "600" },
  dayChipsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    gap: 6,
  },
  dayChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: theme.radius.md,
  },
  dayChipWeekday: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
    lineHeight: 14,
  },
  dayChipDay: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 1,
  },
  dayChipDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  summaryText: { flexShrink: 1, fontSize: 13 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  loader: { marginTop: theme.spacing.xl },
  labelInput: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  modalBody: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  modalDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  quickChips: {
    flexDirection: "row",
    gap: theme.spacing.xs,
    alignItems: "center",
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    marginTop: 2,
  },
  datePickerText: {
    fontSize: 15,
    fontWeight: "500",
  },
  copyDaysRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    marginTop: 2,
  },
  copyDayChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: theme.radius.md,
  },
  copyDayChipWeekday: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  copyDayChipNum: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 1,
  },
  copyDayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
  copyQuickSelect: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginTop: -2,
  },
  quickSelectLink: {
    fontSize: 12,
    fontWeight: "600",
  },
  iosModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  iosModalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    alignItems: "center",
  },
  iosModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iosModalCancel: {
    fontSize: 16,
  },
  iosModalConfirm: {
    fontSize: 16,
    fontWeight: "600",
  },
});
