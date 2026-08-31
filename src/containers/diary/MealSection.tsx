import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { EntryRow } from "@/src/containers/diary/EntryRow";
import type { DiaryMeal } from "@/src/db/queries/diary";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { Plus } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface MealSectionProps {
  meal: DiaryMeal;
  /** Nome risolto per ciascuna riga, indicizzato per id. */
  names: Record<string, string>;
  onAdd: () => void;
  onEditEntry: (entryId: string) => void;
  onEditComposition: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
}

export const MealSection: React.FC<MealSectionProps> = ({
  meal,
  names,
  onAdd,
  onEditEntry,
  onEditComposition,
  onDeleteEntry,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
        >
          {meal.type.name}
        </Text>
        <Text style={[styles.kcal, { color: colors.textMuted }]}>
          {Math.round(meal.totals.kcal)} kcal
        </Text>
      </View>

      {meal.entries.map((entry, index) => (
        <View
          key={entry.id}
          style={
            index > 0
              ? { borderTopWidth: 1, borderTopColor: colors.border }
              : undefined
          }
        >
          <EntryRow
            entry={entry}
            name={names[entry.id] ?? t("diary.unknown_entry")}
            onPress={() => onEditEntry(entry.id)}
            onEditComposition={() => onEditComposition(entry.id)}
            onDelete={() => onDeleteEntry(entry.id)}
          />
        </View>
      ))}

      <TouchableOpacity style={styles.add} onPress={onAdd} activeOpacity={0.6}>
        <Plus size={16} color={colors.textMuted} />
        <Text style={[styles.addLabel, { color: colors.textMuted }]}>
          {t("diary.add_here")}
        </Text>
      </TouchableOpacity>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingVertical: theme.spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: theme.spacing.xs,
  },
  title: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  kcal: {
    fontSize: 14,
    fontWeight: "600",
  },
  add: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: theme.spacing.sm,
  },
  addLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
});
