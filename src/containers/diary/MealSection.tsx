import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { EntryRow } from "@/src/containers/diary/EntryRow";
import type { DiaryMeal } from "@/src/db/queries/diary";
import { useTranslation } from "@/src/hooks/useTranslation";
import { formatInteger } from "@/src/utils/number";
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
    /*
      Un pasto e' contenuto che si scorre, non un oggetto da incorniciare: con
      quattro pasti la schermata era quattro card impilate, ognuna con bordo e
      ombra a ripetere la stessa cosa. Il nome del pasto e' ora un'etichetta di
      sezione - lo stesso ruolo che ha ovunque nell'app - e le voci sono righe
      separate da una linea.
    */
    <View style={styles.section}>
      <View style={styles.header}>
        <Text
          style={[styles.title, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {meal.type.name}
        </Text>
        <Text style={[styles.kcal, { color: colors.textMuted }]}>
          {formatInteger(meal.totals.kcal)} kcal
        </Text>
      </View>

      {meal.entries.map((entry, index) => (
        <View
          key={entry.id}
          style={
            index > 0
              ? {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                }
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

      <TouchableOpacity
        style={[styles.add, { borderTopColor: colors.border }]}
        onPress={onAdd}
        activeOpacity={0.6}
        accessibilityRole="button"
      >
        <Plus size={14} color={colors.textFaint} />
        <Text style={[styles.addLabel, { color: colors.textFaint }]}>
          {t("diary.add_here")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: theme.spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs + 1,
  },
  // Stessa forma dell'etichetta di sezione del resto dell'app: e' quel che il
  // nome di un pasto e' - un titolo di gruppo, non il titolo di una scheda.
  title: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  kcal: {
    fontSize: 12,
    fontWeight: "500",
  },
  add: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
});
