import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { MealEntryRow } from "@/src/types/nutrition";
import { Sparkles, Trash2 } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface EntryRowProps {
  entry: MealEntryRow;
  /** Nome risolto: l'alimento o il pasto a cui punta, o la voce libera. */
  name: string;
  onPress: () => void;
  onDelete: () => void;
}

export const EntryRow: React.FC<EntryRowProps> = ({
  entry,
  name,
  onPress,
  onDelete,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const quantity =
    entry.source_kind === "recipe"
      ? t("recipes.servings_count", { count: entry.servings ?? 0 })
      : `${Math.round(entry.quantity_g ?? 0)} g`;

  return (
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
          </View>
          <Text style={[styles.quantity, { color: colors.textMuted }]}>
            {quantity}
          </Text>
        </View>

        <Text style={[styles.kcal, { color: colors.textSecondary }]}>
          {Math.round(entry.kcal)} kcal
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onDelete} activeOpacity={0.6} hitSlop={10}>
        <Trash2 size={17} color={colors.textFaint} />
      </TouchableOpacity>
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
});
