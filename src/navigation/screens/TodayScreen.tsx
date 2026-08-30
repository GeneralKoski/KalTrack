import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import {
  Card,
  EmptyState,
  MetalSurface,
  ScreenBackground,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { AddEntrySheet, type DiaryPick } from "@/src/containers/diary/AddEntrySheet";
import { CalorieRing } from "@/src/containers/diary/CalorieRing";
import { DayStatCard } from "@/src/containers/tracking/DayStatCard";
import { QuickLogSheet } from "@/src/containers/tracking/QuickLogSheet";
import { WaterCard } from "@/src/containers/wellbeing/WaterCard";
import { DayHeader } from "@/src/containers/diary/DayHeader";
import { DayPickerSheet } from "@/src/containers/diary/DayPickerSheet";
import { FreeEntrySheet } from "@/src/containers/diary/FreeEntrySheet";
import { MacroBars } from "@/src/containers/diary/MacroBars";
import { MealSection } from "@/src/containers/diary/MealSection";
import { QuantityPrompt } from "@/src/containers/recipes/QuantityPrompt";
import {
  addFoodEntry,
  addFreeEntry,
  addRecipeEntry,
  deleteEntry,
  entryDisplayNames,
  getDayDiary,
  listMealTypes,
  updateEntryQuantity,
  type DayDiary,
} from "@/src/db/queries/diary";
import { getTargetsFor } from "@/src/db/queries/settings";
import {
  getSteps,
  getWeight,
  setSteps,
  setWeight,
  deleteSteps,
  deleteWeight,
} from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useFocusEffect } from "@react-navigation/native";
import { useDayContextStore } from "@/src/stores/dayContextStore";
import { theme } from "@/src/styles";
import type { MealEntryRow, MealTypeRow, TargetRow } from "@/src/types/nutrition";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Footprints, Plus, Scale, UtensilsCrossed } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

interface DayData {
  diary: DayDiary;
  /** Nome risolto di ogni riga, indicizzato per id della riga. */
  names: Record<string, string>;
  mealTypes: MealTypeRow[];
  /** Obiettivo in vigore in quel giorno, non quello di oggi. */
  targets: TargetRow | null;
  /** Null, non zero, quando il giorno non ha una misura. */
  steps: number | null;
  weightKg: number | null;
}

export function TodayScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { navigate } = useAppNav();
  const today = todayIso();

  const [date, setDate] = useState(today);
  const [pendingPick, setPendingPick] = useState<DiaryPick | null>(null);
  const [editingEntry, setEditingEntry] = useState<MealEntryRow | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [weightOpen, setWeightOpen] = useState(false);
  const [mealTypeId, setMealTypeId] = useState<string | null>(null);
  const addSheetRef = useRef<BottomSheetModal>(null);
  const dayPickerRef = useRef<BottomSheetModal>(null);
  // Cambia a ogni apertura del calendario: e' quel che gli fa rileggere gli
  // anelli invece di mostrare quelli di quando e' stato montato.
  const [dayPickerKey, setDayPickerKey] = useState(0);

  // L'assistente e' montato sopra la navigazione e non vede questo stato:
  // glielo passiamo, altrimenti scriverebbe sempre su oggi anche mentre si
  // sta guardando un altro giorno.
  const setReferenceDate = useDayContextStore((s) => s.setReferenceDate);
  useFocusEffect(
    useCallback(() => {
      setReferenceDate(date);
      return () => setReferenceDate(null);
    }, [date, setReferenceDate]),
  );

  const loader = useCallback(async (): Promise<DayData> => {
    const [diary, mealTypes, targets, stepRow, weightRow] = await Promise.all([
      getDayDiary(date),
      listMealTypes(),
      getTargetsFor(date),
      getSteps(date),
      getWeight(date),
    ]);

    const names = await entryDisplayNames(diary);

    return {
      diary,
      names,
      mealTypes,
      targets,
      steps: stepRow?.steps ?? null,
      weightKg: weightRow?.weight_kg ?? null,
    };
  }, [date]);

  const { data, loading, reload } = useFocusData<DayData>(loader);


  const openAdd = (typeId?: string) => {
    setMealTypeId(typeId ?? data?.mealTypes[0]?.id ?? null);
    addSheetRef.current?.present();
  };

  const onPick = (picked: DiaryPick) => {
    addSheetRef.current?.dismiss();
    if (picked.kind === "free") {
      setFreeOpen(true);
      return;
    }
    setPendingPick(picked);
  };

  const confirmQuantity = async (value: number) => {
    try {
      if (editingEntry) {
        await updateEntryQuantity(editingEntry.id, value);
        setEditingEntry(null);
      } else if (pendingPick && mealTypeId) {
        if (pendingPick.kind === "food") {
          await addFoodEntry({
            date,
            mealTypeId,
            foodId: pendingPick.food.id,
            quantityG: value,
          });
        } else if (pendingPick.kind === "recipe") {
          await addRecipeEntry({
            date,
            mealTypeId,
            recipeId: pendingPick.recipe.id,
            servings: value,
          });
        }
        setPendingPick(null);
      }
      reload();
    } catch {
      showToast.error({ title: t("general_error") });
    }
  };

  const confirmFree = async (label: string, nutrients: Nutrients) => {
    if (!mealTypeId) return;
    try {
      await addFreeEntry({
        date,
        mealTypeId,
        label,
        nutrients,
        isEstimated: true,
      });
      setFreeOpen(false);
      reload();
    } catch {
      showToast.error({ title: t("general_error") });
    }
  };

  const onDeleteEntry = async (entryId: string) => {
    await deleteEntry(entryId);
    reload();
  };

  const onEditEntry = (entryId: string) => {
    const entry = data?.diary.meals
      .flatMap((m) => m.entries)
      .find((e) => e.id === entryId);
    if (entry) setEditingEntry(entry);
  };

  const promptOpen = pendingPick !== null || editingEntry !== null;
  const promptIsRecipe =
    editingEntry?.source_kind === "recipe" || pendingPick?.kind === "recipe";
  // Una voce libera si scala per moltiplicatore, non per grammi: chiederle
  // "quanti g?" e passare il numero a updateEntryQuantity moltiplicava lo
  // snapshot per quel numero.
  const promptIsFree = editingEntry?.source_kind === "free";

  const promptTitle = editingEntry
    ? (data?.names[editingEntry.id] ?? "")
    : pendingPick?.kind === "food"
      ? pendingPick.food.name
      : pendingPick?.kind === "recipe"
        ? pendingPick.recipe.name
        : "";

  const promptValue = editingEntry
    ? (editingEntry.servings ?? editingEntry.quantity_g ?? 100)
    : pendingPick?.kind === "food"
      ? (pendingPick.food.default_serving_g ?? 100)
      : 1;

  const totals = data?.diary.totals;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <DayHeader
          date={date}
          today={today}
          onChange={setDate}
          onOpenPicker={() => {
            setDayPickerKey((k) => k + 1);
            dayPickerRef.current?.present();
          }}
        />

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + ASSISTANT_FAB_CLEARANCE },
            ]}
          >
            <Card style={styles.summary}>
              <CalorieRing
                consumed={totals?.kcal ?? 0}
                target={data?.targets?.kcal ?? null}
                nutrients={totals ?? null}
              />

              {data?.targets ? null : (
                <TouchableOpacity
                  onPress={() => navigate("Targets")}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.setTarget, { color: colors.accent }]}>
                    {t("diary.set_target")}
                  </Text>
                </TouchableOpacity>
              )}

              <MacroBars
                consumed={totals ?? EMPTY_NUTRIENTS}
                targets={
                  data?.targets
                    ? {
                        proteinG: data.targets.protein_g,
                        carbsG: data.targets.carbs_g,
                        fatG: data.targets.fat_g,
                      }
                    : null
                }
              />
            </Card>

            <View style={styles.stats}>
              <DayStatCard
                icon={Footprints}
                label={t("tracking.steps")}
                value={data?.steps ?? null}
                unit={t("tracking.steps_unit")}
                target={data?.targets?.steps ?? null}
                emptyLabel={t("tracking.not_recorded")}
                onPress={() => setStepsOpen(true)}
              />
              <DayStatCard
                icon={Scale}
                label={t("tracking.weight")}
                value={data?.weightKg ?? null}
                unit="kg"
                emptyLabel={t("tracking.not_recorded")}
                onPress={() => setWeightOpen(true)}
              />
            </View>

            {/* L'acqua e' un dato del giorno come i passi: sta qui, dove si
                guarda ogni volta, non dietro una voce di menu. */}
            <WaterCard date={date} />

            {data && data.diary.meals.length === 0 ? (
              <EmptyState
                message={t("diary.empty")}
                icon={<UtensilsCrossed size={40} color={colors.textFaint} />}
              />
            ) : (
              data?.diary.meals.map((meal) => (
                <MealSection
                  key={meal.meal.id}
                  meal={meal}
                  names={data.names}
                  onAdd={() => openAdd(meal.type.id)}
                  onEditEntry={onEditEntry}
                  onDeleteEntry={onDeleteEntry}
                />
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + theme.spacing.lg }]}
        activeOpacity={0.6}
        onPress={() => openAdd()}
      >
        <MetalSurface radius={28} style={styles.fabSurface}>
          <Plus size={26} color={colors.text} strokeWidth={2.5} />
        </MetalSurface>
      </TouchableOpacity>

      <DayPickerSheet
        ref={dayPickerRef}
        date={date}
        today={today}
        refreshKey={dayPickerKey}
        onPick={(giorno) => {
          setDate(giorno);
          dayPickerRef.current?.dismiss();
        }}
      />

      <AddEntrySheet
        ref={addSheetRef}
        mealTypes={data?.mealTypes ?? []}
        mealTypeId={mealTypeId}
        onChangeMealType={setMealTypeId}
        onPick={onPick}
      />

      <QuantityPrompt
        isOpen={promptOpen}
        title={promptTitle}
        unit={
          promptIsRecipe
            ? t("recipes.servings_unit")
            : promptIsFree
              ? t("diary.multiplier_unit")
              : "g"
        }
        initialValue={promptValue}
        onConfirm={confirmQuantity}
        onClose={() => {
          setPendingPick(null);
          setEditingEntry(null);
        }}
      />

      <FreeEntrySheet
        isOpen={freeOpen}
        onConfirm={confirmFree}
        onClose={() => setFreeOpen(false)}
      />

      <QuickLogSheet
        isOpen={stepsOpen}
        title={t("tracking.steps")}
        unit={t("tracking.steps_unit")}
        initialValue={data?.steps ?? null}
        onConfirm={async (value) => {
          await setSteps(date, value);
          setStepsOpen(false);
          reload();
        }}
        onDelete={
          data?.steps != null
            ? async () => {
                await deleteSteps(date);
                setStepsOpen(false);
                reload();
              }
            : undefined
        }
        onClose={() => setStepsOpen(false)}
      />

      <QuickLogSheet
        isOpen={weightOpen}
        title={t("tracking.weight")}
        unit="kg"
        initialValue={data?.weightKg ?? null}
        onConfirm={async (value) => {
          await setWeight(date, value);
          setWeightOpen(false);
          reload();
        }}
        onDelete={
          data?.weightKg != null
            ? async () => {
                await deleteWeight(date);
                setWeightOpen(false);
                reload();
              }
            : undefined
        }
        onClose={() => setWeightOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  summary: {
    gap: theme.spacing.sm,
  },
  stats: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  setTarget: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  loader: {
    marginTop: theme.spacing.xl,
  },
  fab: {
    position: "absolute",
    right: theme.spacing.md,
    borderRadius: 28,
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabSurface: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
