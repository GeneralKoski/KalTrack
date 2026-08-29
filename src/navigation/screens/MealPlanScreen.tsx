import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  AddEntrySheet,
  type DiaryPick,
} from "@/src/containers/diary/AddEntrySheet";
import { PlanDayColumn } from "@/src/containers/planning/PlanDayColumn";
import { QuantityPrompt } from "@/src/containers/recipes/QuantityPrompt";
import { listMealTypes } from "@/src/db/queries/diary";
import {
  addPlanEntry,
  applyPlanToDiary,
  copyPlanWeek,
  deletePlanEntry,
  isPlanApplied,
  listPlanEntries,
  type PlanEntry,
} from "@/src/db/queries/mealPlan";
import { addDays, startOfWeek, todayIso } from "@/src/domain/date";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { MealTypeRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useNavigation } from "@react-navigation/native";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  ShoppingCart,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
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

/** Quantità di partenza di un alimento messo a piano, in grammi. */
const DEFAULT_GRAMS = 100;

interface WeekData {
  entries: PlanEntry[];
  mealTypes: MealTypeRow[];
  /** Giorni della settimana già trasferiti nel diario. */
  applied: Record<string, boolean>;
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
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlanEntry | null>(null);
  const addSheetRef = useRef<BottomSheetModal>(null);

  const weekEnd = addDays(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const loader = useCallback(async (): Promise<WeekData> => {
    const [entries, mealTypes] = await Promise.all([
      listPlanEntries(weekStart, weekEnd),
      listMealTypes(),
    ]);
    const applied: Record<string, boolean> = {};
    for (const day of Array.from({ length: 7 }, (_, i) =>
      addDays(weekStart, i),
    )) {
      applied[day] = await isPlanApplied(day);
    }
    return { entries, mealTypes, applied };
  }, [weekStart, weekEnd]);

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
      result = await applyPlanToDiary(selectedDate);
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

  const copyWeek = async () => {
    setConfirmCopy(false);
    try {
      const copied = await copyPlanWeek(weekStart, addDays(weekStart, 7));
      if (copied === 0) {
        showToast.info({ title: t("plan.copy_week_empty") });
        return;
      }
      showToast.success({ title: t("plan.copy_week_done") });
    } catch (error) {
      logger.error("[MealPlanScreen] copia settimana fallita", error);
      showToast.error({ title: t("plan.copy_week_failed") });
    }
  };

  const openShoppingList = () => {
    // NavParams di useAppNav non conosce ancora questa rotta (il file è
    // condiviso): finché non ci viene aggiunta si passa dal navigator grezzo.
    const navigate = navigation.navigate as unknown as (
      name: string,
      params?: object,
    ) => void;
    navigate("ShoppingList", { from: weekStart, to: weekEnd });
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
          <TouchableOpacity
            onPress={openShoppingList}
            activeOpacity={0.6}
            hitSlop={10}
          >
            <ShoppingCart size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          <TouchableOpacity
            onPress={() => changeWeek(-1)}
            activeOpacity={0.6}
            hitSlop={12}
          >
            <ChevronLeft size={22} color={colors.text} />
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
            hitSlop={12}
          >
            <ChevronRight size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.dayChips}
        >
          {days.map((day, index) => (
            <DayChip
              key={day}
              label={`${WEEKDAYS[index]} ${Number(day.slice(8, 10))}`}
              selected={day === selectedDate}
              planned={(data?.entries ?? []).some((e) => e.row.date === day)}
              onPress={() => setSelectedDate(day)}
            />
          ))}
        </ScrollView>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + ASSISTANT_FAB_CLEARANCE },
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
              mealTypes={data?.mealTypes ?? []}
              entries={dayEntries}
              onAdd={openAdd}
              onDelete={setPendingDelete}
            />

            <View style={styles.actions}>
              <DfButton
                label={t("plan.apply")}
                onPress={() => setConfirmApply(true)}
                disabled={isApplied || dayEntries.length === 0}
                icon={<CheckCheck size={16} color={colors.text} />}
              />
              <DfButton
                label={t("plan.copy_week")}
                variant="outlined"
                onPress={() => setConfirmCopy(true)}
                icon={<CopyPlus size={16} color={colors.accent} />}
              />
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

      <AddEntrySheet
        ref={addSheetRef}
        mealTypes={data?.mealTypes ?? []}
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
        message={t("plan.apply_message")}
        confirmLabel={t("confirm")}
        onConfirm={applyDay}
        onClose={() => setConfirmApply(false)}
      />

      <DfAlert
        isOpen={confirmCopy}
        title={t("plan.copy_week_title")}
        message={t("plan.copy_week_message")}
        confirmLabel={t("confirm")}
        onConfirm={copyWeek}
        onClose={() => setConfirmCopy(false)}
      />

      <DfAlert
        isOpen={pendingDelete !== null}
        title={t("plan.delete_title")}
        message={pendingDelete?.name}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        onConfirm={removeEntry}
        onClose={() => setPendingDelete(null)}
      />
    </View>
  );
}

const DayChip: React.FC<{
  label: string;
  selected: boolean;
  planned: boolean;
  onPress: () => void;
}> = ({ label, selected, planned, onPress }) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.dayChip,
        {
          backgroundColor: selected ? colors.accent : colors.surfaceMuted,
        },
      ]}
    >
      <Text
        style={[
          styles.dayChipLabel,
          { color: selected ? colors.accentOn : colors.textMuted },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {/* Il pallino dice solo "questo giorno ha un piano": senza, i giorni
          programmati e quelli vuoti sarebbero indistinguibili. */}
      <View
        style={[
          styles.dayChipDot,
          {
            backgroundColor: planned
              ? selected
                ? colors.accentOn
                : colors.textMuted
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
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
  },
  weekLabel: { flexShrink: 1, fontSize: 14, fontWeight: "600" },
  dayChips: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  dayChip: {
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
  },
  dayChipLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  dayChipDot: { width: 5, height: 5, borderRadius: 2.5 },
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
});
