import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  componentNutrients,
  parseComposition,
} from "@/src/domain/entryComposition";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { MealEntryRow } from "@/src/types/nutrition";
import { ChevronDown, ChevronUp, Pencil, Sparkles, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface EntryRowProps {
  entry: MealEntryRow;
  /** Nome risolto: l'alimento o il pasto a cui punta, o la voce libera. */
  name: string;
  onPress: () => void;
  /**
   * Apre la modifica della composizione. L'ingresso sta in coda all'elenco
   * degli ingredienti e non sul tocco della riga: il tocco cambia le porzioni,
   * e sono due gesti diversi su due quantita' diverse.
   */
  onEditComposition: () => void;
  onDelete: () => void;
}

export const EntryRow: React.FC<EntryRowProps> = ({
  entry,
  name,
  onPress,
  onEditComposition,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  /**
   * La composizione della voce, quando ne ha una.
   *
   * Chiusa di serie: un pasto con tre ricette da sei ingredienti sarebbe un
   * muro, e chi guarda il diario vuole prima i totali.
   */
  const composition = parseComposition(entry.components);
  const [open, setOpen] = useState(false);
  const hasIngredients = (composition?.items.length ?? 0) > 0;

  /**
   * Una voce libera non ha grammi: la sua `quantity_g` e' un moltiplicatore che
   * parte da 1. Scriverla come "1 g" faceva sembrare una pizza da 800 kcal un
   * grammo di qualcosa, e invitava a "correggerla" a 350 - che moltiplicava le
   * calorie per trecentocinquanta.
   */
  const quantity =
    entry.source_kind === "recipe"
      ? t("recipes.servings_count", { count: entry.servings ?? 0 })
      : entry.source_kind === "free"
        ? (entry.quantity_g ?? 1) === 1
          ? ""
          : t("diary.multiplier", { count: entry.quantity_g ?? 1 })
        : `${Math.round(entry.quantity_g ?? 0)} g`;

  return (
    <View>
      <View style={styles.row}>
      <TouchableOpacity style={styles.main} onPress={onPress} activeOpacity={0.6}>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
            {/* Una stima non è un dato misurato: va detto, non nascosto. */}
            {entry.is_estimated === 1 ? (
              <Sparkles size={13} color={colors.textMuted} />
            ) : null}
            {/*
              Senza questo si legge "Crepes di zucchine", si riconosce il nome
              della ricetta e si crede di vedere la ricetta - mentre dentro c'e'
              il salame al posto del cotto.
            */}
            {composition?.edited ? (
              <Text style={[styles.edited, { color: colors.textFaint }]}>
                {t("diary.edited")}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.quantity, { color: colors.textMuted }]}>
            {quantity}
          </Text>
        </View>

        <Text style={[styles.kcal, { color: colors.textSecondary }]}>
          {Math.round(entry.kcal)} kcal
        </Text>
      </TouchableOpacity>

      {hasIngredients ? (
        <TouchableOpacity
          onPress={() => setOpen((v) => !v)}
          activeOpacity={0.6}
          hitSlop={8}
          accessibilityLabel={t("diary.ingredients_show")}
        >
          {open ? (
            <ChevronUp size={17} color={colors.textFaint} />
          ) : (
            <ChevronDown size={17} color={colors.textFaint} />
          )}
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity onPress={onDelete} activeOpacity={0.6} hitSlop={10}>
        <Trash2 size={17} color={colors.textFaint} />
      </TouchableOpacity>
      </View>

      {open && composition
        ? composition.items.map((item, index) => (
            <View
              // Non l'indice da solo: due ingredienti possono chiamarsi uguale,
              // e la lista si modifica altrove mentre questa e' a schermo.
              key={`${item.label}-${index}`}
              style={styles.ingredient}
            >
              <Text
                style={[styles.ingredientName, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              <Text style={[styles.ingredientQty, { color: colors.textFaint }]}>
                {t("diary.ingredient_detail", {
                  grams: Math.round(item.quantityG),
                  kcal: Math.round(componentNutrients(item).kcal),
                })}
              </Text>
            </View>
          ))
        : null}

      {open && composition ? (
        <TouchableOpacity
          onPress={onEditComposition}
          activeOpacity={0.6}
          style={styles.editComposition}
        >
          <Pencil size={13} color={colors.accent} />
          <Text style={[styles.editLabel, { color: colors.accent }]}>
            {t("diary.composition_title")}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  body: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  quantity: {
    fontSize: 13,
    marginTop: 1,
  },
  kcal: {
    fontSize: 14,
    fontWeight: "600",
  },
  edited: {
    fontSize: 11,
  },
  ingredient: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingBottom: 3,
  },
  ingredientName: {
    flex: 1,
    fontSize: 12,
  },
  ingredientQty: {
    fontSize: 11,
  },
  editComposition: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: theme.spacing.md,
    paddingTop: 2,
    paddingBottom: theme.spacing.xs,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
});
