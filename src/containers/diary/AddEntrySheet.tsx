import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { EmptyState, SearchBar } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { searchFoods } from "@/src/db/queries/foods";
import { searchRecipes } from "@/src/db/queries/recipes";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodRow, MealTypeRow, RecipeRow } from "@/src/types/nutrition";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import React, { forwardRef, useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

export type DiaryPick =
  | { kind: "food"; food: FoodRow }
  | { kind: "recipe"; recipe: RecipeRow }
  | { kind: "free" };

interface AddEntrySheetProps {
  mealTypes: MealTypeRow[];
  /** Tipo preselezionato: quello della sezione da cui si è partiti. */
  mealTypeId: string | null;
  onChangeMealType: (id: string) => void;
  onPick: (picked: DiaryPick) => void;
}

type Tab = "foods" | "recipes" | "free";

/** Risultati mostrati: oltre non si scorre, si cerca. */
const PICKER_LIMIT = 30;

export const AddEntrySheet = forwardRef<BottomSheetModal, AddEntrySheetProps>(
  ({ mealTypes, mealTypeId, onChangeMealType, onPick }, ref) => {
    const { t } = useTranslation();
    const { colors } = useAppTheme();
    const [tab, setTab] = useState<Tab>("foods");
    const [term, setTerm] = useState("");
    const [foods, setFoods] = useState<FoodRow[]>([]);
    const [recipes, setRecipes] = useState<RecipeRow[]>([]);

    useEffect(() => {
      let active = true;
      (async () => {
        if (tab === "foods") {
          const rows = await searchFoods(term, PICKER_LIMIT);
          if (active) setFoods(rows);
        } else if (tab === "recipes") {
          const rows = await searchRecipes(term, PICKER_LIMIT);
          if (active) setRecipes(rows);
        }
      })();
      return () => {
        active = false;
      };
    }, [tab, term]);

    return (
      <DfBottomSheet ref={ref} title={t("diary.add_title")}>
        {/* Il tipo di pasto è la prima scelta: dice dove finisce la riga. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.mealTypes}
        >
          {mealTypes.map((type) => {
            const selected = type.id === mealTypeId;
            return (
              <TouchableOpacity
                key={type.id}
                onPress={() => onChangeMealType(type.id)}
                activeOpacity={0.6}
                style={[
                  styles.mealType,
                  {
                    backgroundColor: selected
                      ? colors.accent
                      : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.mealTypeLabel,
                    { color: selected ? colors.accentOn : colors.textMuted },
                  ]}
                >
                  {type.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.tabs}>
          <TabButton
            label={t("diary.tab_foods")}
            active={tab === "foods"}
            onPress={() => setTab("foods")}
          />
          <TabButton
            label={t("diary.tab_recipes")}
            active={tab === "recipes"}
            onPress={() => setTab("recipes")}
          />
          <TabButton
            label={t("diary.tab_free")}
            active={tab === "free"}
            onPress={() => setTab("free")}
          />
        </View>

        {tab !== "free" ? (
          <View style={styles.search}>
            <SearchBar value={term} onChangeText={setTerm} />
          </View>
        ) : null}

        {tab === "free" ? (
          <TouchableOpacity
            style={[styles.freeRow, { borderColor: colors.border }]}
            onPress={() => onPick({ kind: "free" })}
            activeOpacity={0.6}
          >
            <Text style={[styles.freeTitle, { color: colors.text }]}>
              {t("diary.free_entry")}
            </Text>
            <Text style={[styles.freeHint, { color: colors.textMuted }]}>
              {t("diary.free_entry_hint")}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/*
          Righe con map() e non FlatList: DfBottomSheet avvolge già i figli in
          un BottomSheetScrollView e annidarci una lista virtualizzata rompe lo
          scroll. I risultati sono al massimo PICKER_LIMIT.
        */}
        {tab === "foods" ? (
          foods.length === 0 ? (
            <EmptyState message={t("foods.empty")} />
          ) : (
            foods.map((item) => (
              <PickerRow
                key={item.id}
                title={item.name}
                subtitle={`${Math.round(item.kcal)} kcal / 100 ${item.is_liquid === 1 ? "ml" : "g"}`}
                onPress={() => onPick({ kind: "food", food: item })}
              />
            ))
          )
        ) : null}

        {tab === "recipes" ? (
          recipes.length === 0 ? (
            <EmptyState message={t("recipes.empty")} />
          ) : (
            recipes.map((item) => (
              <PickerRow
                key={item.id}
                title={item.name}
                subtitle={t("recipes.servings_count", { count: item.servings })}
                onPress={() => onPick({ kind: "recipe", recipe: item })}
              />
            ))
          )
        ) : null}

      </DfBottomSheet>
    );
  },
);

AddEntrySheet.displayName = "AddEntrySheet";

const TabButton: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      style={[
        styles.tab,
        { backgroundColor: active ? colors.accent : colors.surfaceMuted },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text
        style={[
          styles.tabLabel,
          { color: active ? colors.accentOn : colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const PickerRow: React.FC<{
  title: string;
  subtitle: string;
  onPress: () => void;
}> = ({ title, subtitle, onPress }) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  mealTypes: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  mealType: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  mealTypeLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  tabs: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    alignItems: "center",
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  search: {
    marginBottom: theme.spacing.sm,
  },
  row: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  freeRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  freeTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  freeHint: {
    fontSize: 13,
    marginTop: 2,
  },
});
