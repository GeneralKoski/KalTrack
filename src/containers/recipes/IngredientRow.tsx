import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { Trash2 } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface IngredientRowProps {
  name: string;
  /** "200 g" per un alimento, "2 porzioni" per una ricetta annidata. */
  quantityLabel: string;
  kcal: number;
  /** Le ricette annidate si distinguono a colpo d'occhio dagli alimenti. */
  isRecipe?: boolean;
  onPress: () => void;
  onRemove: () => void;
}

export const IngredientRow: React.FC<IngredientRowProps> = ({
  name,
  quantityLabel,
  kcal,
  isRecipe = false,
  onPress,
  onRemove,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <TouchableOpacity
        style={styles.main}
        onPress={onPress}
        activeOpacity={0.6}
      >
        <View style={styles.body}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text
            style={[
              styles.quantity,
              { color: colors.textMuted },
              isRecipe && styles.quantityRecipe,
            ]}
          >
            {quantityLabel}
          </Text>
        </View>
        <Text style={[styles.kcal, { color: colors.textSecondary }]}>
          {Math.round(kcal)} kcal
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onRemove} activeOpacity={0.6} hitSlop={10}>
        <Trash2 size={18} color={colors.textFaint} />
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
    borderBottomWidth: 1,
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
  name: {
    fontSize: 15,
    fontWeight: "500",
  },
  quantity: {
    fontSize: 13,
    marginTop: 1,
  },
  quantityRecipe: {
    color: theme.colors.primaryDark,
    fontWeight: "600",
  },
  kcal: {
    fontSize: 14,
    fontWeight: "600",
  },
});
