import { DfAlert } from "@/src/components/DfAlert";
import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { EmptyState, SearchBar } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { searchFoods } from "@/src/db/queries/foods";
import { searchRecipes } from "@/src/db/queries/recipes";
import { useTranslation } from "@/src/hooks/useTranslation";
import { FoodFacts } from "@/src/containers/foods/FoodFacts";
import { theme } from "@/src/styles";
import type { FoodRow, MealTypeRow, RecipeRow } from "@/src/types/nutrition";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Check, Info } from "lucide-react-native";
import React, { forwardRef, useCallback, useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export type DiaryPick =
  | { kind: "food"; food: FoodRow }
  | { kind: "recipe"; recipe: RecipeRow }
  | { kind: "free" }
  | { kind: "photo"; source: "camera" | "library" };

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
    /** Aperta la sotto-vista che cambia il pasto: il corpo lascia il posto. */
    const [pickingMeal, setPickingMeal] = useState(false);
    const [term, setTerm] = useState("");
    const [foods, setFoods] = useState<FoodRow[]>([]);
    const [recipes, setRecipes] = useState<RecipeRow[]>([]);
    /** L'alimento di cui si stanno guardando i valori, non quello scelto. */
    const [detail, setDetail] = useState<FoodRow | null>(null);

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

    const mealType = mealTypes.find((type) => type.id === mealTypeId) ?? null;

    /* Il back di Android chiude prima la sotto-vista dei pasti, poi il foglio. */
    const onAndroidBack = useCallback(() => {
      if (!pickingMeal) return false;
      setPickingMeal(false);
      return true;
    }, [pickingMeal]);

    return (
      <DfBottomSheet
        ref={ref}
        /* Il titolo e' la destinazione della riga, non la parola "Aggiungi":
           e' il dato che si cambia piu' spesso, e da titolo non occupa una
           riga sua. */
        title={mealType?.name ?? t("diary.add_title")}
        onPressTitle={
          mealTypes.length > 0
            ? () => setPickingMeal((open) => !open)
            : undefined
        }
        titleOpen={pickingMeal}
        onAndroidBack={onAndroidBack}
        onDismiss={() => setPickingMeal(false)}
      >
        {/*
          Il pasto sceglie dove finisce la riga, ed e' il titolo del foglio:
          qui si cambia, e finche' questa sotto-vista e' aperta il corpo lascia
          il posto invece di scorrere sotto.
        */}
        {pickingMeal ? (
          <View>
            {mealTypes.map((type, index) => {
              const selected = type.id === mealTypeId;
              return (
                <TouchableOpacity
                  key={type.id}
                  onPress={() => {
                    onChangeMealType(type.id);
                    setPickingMeal(false);
                  }}
                  activeOpacity={0.6}
                  style={[
                    styles.mealRow,
                    {
                      borderBottomColor: colors.border,
                      /* L'ultima riga non porta la riga sotto: non separa da
                         niente, e resta appesa in fondo al foglio. */
                      borderBottomWidth: index === mealTypes.length - 1 ? 0 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.mealName,
                      { color: selected ? colors.accent : colors.text },
                    ]}
                  >
                    {type.name}
                  </Text>
                  {selected ? <Check size={18} color={colors.accent} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <>
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
              <View style={styles.freeChoices}>
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

                <TouchableOpacity
                  style={[styles.freeRow, { borderColor: colors.border }]}
                  onPress={() => onPick({ kind: "photo", source: "camera" })}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.freeTitle, { color: colors.text }]}>
                    {t("photo_entry.from_camera")}
                  </Text>
                  <Text style={[styles.freeHint, { color: colors.textMuted }]}>
                    {t("photo_entry.entry_hint")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.freeRow, { borderColor: colors.border }]}
                  onPress={() => onPick({ kind: "photo", source: "library" })}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.freeTitle, { color: colors.text }]}>
                    {t("photo_entry.from_library")}
                  </Text>
                </TouchableOpacity>
              </View>
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
                foods.map((item, index) => (
                  <PickerRow
                    key={item.id}
                    title={item.name}
                    subtitle={`${Math.round(item.kcal)} kcal / 100 ${item.is_liquid === 1 ? "ml" : "g"}`}
                    isLast={index === foods.length - 1}
                    onPress={() => onPick({ kind: "food", food: item })}
                    /* Il tocco sulla riga sceglie, come sempre: i valori stanno
                   dietro un bottone loro, o guardarli vorrebbe dire aggiungere
                   l'alimento per sbaglio. */
                    onInfo={() => setDetail(item)}
                  />
                ))
              )
            ) : null}

            {tab === "recipes" ? (
              recipes.length === 0 ? (
                <EmptyState message={t("recipes.empty")} />
              ) : (
                recipes.map((item, index) => (
                  <PickerRow
                    key={item.id}
                    title={item.name}
                    subtitle={t("recipes.servings_count", {
                      count: item.servings,
                    })}
                    isLast={index === recipes.length - 1}
                    onPress={() => onPick({ kind: "recipe", recipe: item })}
                  />
                ))
              )
            ) : null}
          </>
        )}

        <DfAlert
          isOpen={detail !== null}
          title={detail?.name}
          confirmLabel={t("close")}
          hideCancel
          onConfirm={() => setDetail(null)}
          onClose={() => setDetail(null)}
        >
          {detail ? <FoodFacts food={detail} /> : null}
        </DfAlert>
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
        { borderBottomColor: active ? colors.accent : colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text
        style={[
          styles.tabLabel,
          { color: active ? colors.accent : colors.textMuted },
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
  onInfo?: () => void;
}> = ({ title, subtitle, isLast, onPress, onInfo }) => {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.border, borderBottomWidth: isLast ? 0 : 1 },
      ]}
    >
      <TouchableOpacity
        style={styles.rowBody}
        onPress={onPress}
        activeOpacity={0.6}
      >
        <Text
          style={[styles.rowTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.rowSubtitle, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </TouchableOpacity>

      {onInfo ? (
        <TouchableOpacity
          onPress={onInfo}
          activeOpacity={0.6}
          hitSlop={10}
          accessibilityLabel={t("foods.detail_title")}
        >
          <Info size={20} color={colors.textFaint} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  freeChoices: { gap: theme.spacing.sm },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  mealName: {
    fontSize: 16,
    fontWeight: "500",
  },
  tabs: {
    flexDirection: "row",
    marginBottom: theme.spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: "center",
    borderBottomWidth: 2,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  search: {
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    // md e senza bordo sull'ultima riga, come mealRow qui sopra: stessa
    // altezza e stesso divisore in tutti i drawer di scelta.
    paddingVertical: theme.spacing.md,
  },
  rowBody: { flex: 1 },
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
