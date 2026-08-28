import {
  Card,
  EmptyState,
  MetalSurface,
  ScreenBackground,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { AddEntrySheet, type DiaryPick } from "@/src/containers/diary/AddEntrySheet";
import { DayHeader } from "@/src/containers/diary/DayHeader";
import { FreeEntrySheet } from "@/src/containers/diary/FreeEntrySheet";
import { MacroBars } from "@/src/containers/diary/MacroBars";
import { MealSection } from "@/src/containers/diary/MealSection";
import { QuantityPrompt } from "@/src/containers/recipes/QuantityPrompt";
import {
  addFoodEntry,
  addFreeEntry,
  addRecipeEntry,
  deleteEntry,
  getDayDiary,
  listMealTypes,
  updateEntryQuantity,
  type DayDiary,
} from "@/src/db/queries/diary";
import { getFood } from "@/src/db/queries/foods";
import { getRecipe } from "@/src/db/queries/recipes";
import { todayIso } from "@/src/domain/date";
import type { Nutrients } from "@/src/domain/nutrition";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { MealEntryRow, MealTypeRow } from "@/src/types/nutrition";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Plus, UtensilsCrossed } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
}

export function TodayScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const today = todayIso();

  const [date, setDate] = useState(today);
  const [pendingPick, setPendingPick] = useState<DiaryPick | null>(null);
  const [editingEntry, setEditingEntry] = useState<MealEntryRow | null>(null);
  const [freeOpen, setFreeOpen] = useState(false);
  const [mealTypeId, setMealTypeId] = useState<string | null>(null);
  const addSheetRef = useRef<BottomSheetModal>(null);

  const loader = useCallback(async (): Promise<DayData> => {
    const [diary, mealTypes] = await Promise.all([
      getDayDiary(date),
      listMealTypes(),
    ]);

    // I nomi non stanno sulla riga (che porta solo lo snapshot dei macro):
    // vanno risolti dall'alimento o dal pasto a cui punta.
    const names: Record<string, string> = {};
    for (const meal of diary.meals) {
      for (const entry of meal.entries) {
        if (entry.label) {
          names[entry.id] = entry.label;
        } else if (entry.food_id) {
          names[entry.id] = (await getFood(entry.food_id))?.name ?? "";
        } else if (entry.recipe_id) {
          names[entry.id] = (await getRecipe(entry.recipe_id))?.name ?? "";
        }
      }
    }

    return { diary, names, mealTypes };
  }, [date]);

  const { data, loading, reload } = useFocusData<DayData>(loader);

  useEffect(() => {
    reload();
  }, [date, reload]);

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
        <DayHeader date={date} today={today} onChange={setDate} />

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + 96 },
            ]}
          >
            <Card style={styles.summary}>
              <Text style={[styles.kcal, { color: colors.text }]}>
                {Math.round(totals?.kcal ?? 0)}
                <Text style={[styles.kcalUnit, { color: colors.textMuted }]}>
                  {" kcal"}
                </Text>
              </Text>
              <MacroBars
                consumed={
                  totals ?? {
                    kcal: 0,
                    protein: 0,
                    carbs: 0,
                    sugars: 0,
                    fat: 0,
                    saturatedFat: 0,
                    fiber: 0,
                    salt: 0,
                  }
                }
              />
            </Card>

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
        unit={promptIsRecipe ? t("recipes.servings_unit") : "g"}
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
  kcal: {
    fontSize: 34,
    fontWeight: "700",
  },
  kcalUnit: {
    fontSize: 16,
    fontWeight: "500",
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
