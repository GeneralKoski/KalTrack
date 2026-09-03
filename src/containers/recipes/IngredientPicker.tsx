import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { EmptyState, SearchBar } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { searchFoods } from "@/src/db/queries/foods";
import { searchRecipes } from "@/src/db/queries/recipes";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodRow, RecipeRow } from "@/src/types/nutrition";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import React, { forwardRef, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export type PickedIngredient =
  | { kind: "food"; food: FoodRow }
  | { kind: "recipe"; recipe: RecipeRow };

interface IngredientPickerProps {
  /** Ricetta in modifica: va esclusa dai candidati, non può contenersi. */
  excludeRecipeId?: string;
  onPick: (picked: PickedIngredient) => void;
}

type Tab = "foods" | "recipes";

/** Risultati mostrati nel picker: oltre non si scorre, si cerca. */
const PICKER_LIMIT = 30;

export const IngredientPicker = forwardRef<
  BottomSheetModal,
  IngredientPickerProps
>(({ excludeRecipeId, onPick }, ref) => {
  const { t } = useTranslation();
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
      } else {
        const rows = await searchRecipes(term, PICKER_LIMIT);
        if (active) {
          setRecipes(rows.filter((r) => r.id !== excludeRecipeId));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [tab, term, excludeRecipeId]);

  return (
    <DfBottomSheet ref={ref} title={t("recipes.add_ingredient")}>
      <View style={styles.tabs}>
        <TabButton
          label={t("recipes.tab_foods")}
          active={tab === "foods"}
          onPress={() => setTab("foods")}
        />
        <TabButton
          label={t("recipes.tab_recipes")}
          active={tab === "recipes"}
          onPress={() => setTab("recipes")}
        />
      </View>

      <View style={styles.search}>
        <SearchBar value={term} onChangeText={setTerm} />
      </View>

      {/*
        Righe renderizzate con map() e non con una FlatList: DfBottomSheet
        avvolge già i figli in un BottomSheetScrollView, e annidarci una lista
        virtualizzata rompe lo scroll (warning "VirtualizedLists should never be
        nested"). I risultati sono limitati a PICKER_LIMIT, quindi il costo è
        trascurabile e la ricerca restringe comunque l'elenco.
      */}
      {tab === "foods" ? (
        foods.length === 0 ? (
          <EmptyState message={t("foods.empty")} />
        ) : (
          foods.map((item, index) => (
            <PickerRow
              key={item.id}
              title={item.name}
              subtitle={`${Math.round(item.kcal)} kcal / 100 ${item.is_liquid === 1 ? "ml" : "g"}`}
              isLast={index === foods.length - 1}
              onPress={() => onPick({ kind: "food", food: item })}
            />
          ))
        )
      ) : recipes.length === 0 ? (
        <EmptyState message={t("recipes.empty")} />
      ) : (
        recipes.map((item, index) => (
          <PickerRow
            key={item.id}
            title={item.name}
            subtitle={t("recipes.servings_count", { count: item.servings })}
            isLast={index === recipes.length - 1}
            onPress={() => onPick({ kind: "recipe", recipe: item })}
          />
        ))
      )}
    </DfBottomSheet>
  );
});

IngredientPicker.displayName = "IngredientPicker";

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
  isLast: boolean;
  onPress: () => void;
}> = ({ title, subtitle, isLast, onPress }) => {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      style={[
        styles.row,
        { borderBottomColor: colors.border, borderBottomWidth: isLast ? 0 : 1 },
      ]}
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
    // md e senza bordo sull'ultima riga: stessa altezza e stesso divisore
    // del drawer di riferimento (scelta pasto in AddEntrySheet).
    paddingVertical: theme.spacing.md,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 1,
  },
});
