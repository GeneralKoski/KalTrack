import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import type { PlanEntry } from "@/src/db/queries/mealPlan";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { MealTypeRow } from "@/src/types/nutrition";
import { Plus, X } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface PlanDayColumnProps {
  mealTypes: MealTypeRow[];
  /** Voci del solo giorno mostrato, già in ordine. */
  entries: PlanEntry[];
  onAdd: (mealTypeId: string) => void;
  onDelete: (entry: PlanEntry) => void;
}

/**
 * Il piano di un giorno, un riquadro per tipo di pasto.
 *
 * I pasti senza voci restano visibili (a differenza del diario, che nasconde i
 * pasti vuoti): qui il vuoto è il punto, è lo spazio che si sta programmando.
 */
export const PlanDayColumn: React.FC<PlanDayColumnProps> = ({
  mealTypes,
  entries,
  onAdd,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View style={styles.root}>
      {mealTypes.map((type) => {
        const meal = entries.filter((e) => e.row.meal_type_id === type.id);

        return (
          /* Nudo come le sezioni di Oggi, e per lo stesso motivo: cinque pasti
             erano cinque riquadri, e su una giornata vuota erano cinque
             rettangoli con dentro una parola e un "+ Aggiungi". */
          <View key={type.id} style={styles.meal}>
            <View style={styles.header}>
              <Text
                style={[styles.mealName, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {type.name}
              </Text>
              <TouchableOpacity
                onPress={() => onAdd(type.id)}
                activeOpacity={0.6}
                hitSlop={10}
                style={styles.addButton}
              >
                <Plus size={14} color={colors.textMuted} />
                <Text style={[styles.addLabel, { color: colors.textMuted }]}>
                  {t("plan.add")}
                </Text>
              </TouchableOpacity>
            </View>

            {meal.map((entry) => (
              <PlanRow
                key={entry.row.id}
                entry={entry}
                onDelete={() => onDelete(entry)}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
};

const PlanRow: React.FC<{ entry: PlanEntry; onDelete: () => void }> = ({
  entry,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { row } = entry;

  const quantity = row.food_id
    ? `${Math.round(row.quantity_g ?? 0)} g`
    : row.recipe_id
      ? t("plan.servings_short", { count: row.servings ?? 0 })
      : null;

  // Le kcal assenti si dicono, non si scrivono zero: una voce libera non ha
  // valori e fingere che ne abbia falserebbe il totale del giorno.
  const kcal =
    entry.kcal === null
      ? t("plan.kcal_unknown")
      : `${Math.round(entry.kcal)} kcal`;

  return (
    <View style={[styles.row, { borderTopColor: colors.border }]}>
      <View style={styles.rowText}>
        <Text
          style={[styles.rowName, { color: colors.text }]}
          numberOfLines={1}
        >
          {entry.name}
        </Text>
        <Text
          style={[styles.rowMeta, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {quantity ? `${quantity} · ${kcal}` : kcal}
        </Text>
      </View>

      <TouchableOpacity onPress={onDelete} activeOpacity={0.6} hitSlop={10}>
        <X size={18} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: theme.spacing.md },
  meal: { paddingHorizontal: theme.spacing.xs },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  // Stessa forma dell'etichetta di sezione di Oggi: il nome di un pasto e' un
  // titolo di gruppo, non il titolo di una scheda.
  mealName: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addLabel: { fontSize: 12, fontWeight: "500" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "500" },
  rowMeta: { fontSize: 12, marginTop: 1 },
});
