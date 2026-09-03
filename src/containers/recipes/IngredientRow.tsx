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
  /** L'ultima riga non porta la divisione sotto: non separa da niente. */
  isLast: boolean;
  onPress: () => void;
  onRemove: () => void;
}

export const IngredientRow: React.FC<IngredientRowProps> = ({
  name,
  quantityLabel,
  kcal,
  isRecipe = false,
  isLast,
  onPress,
  onRemove,
}) => {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.border, borderBottomWidth: isLast ? 0 : 1 },
      ]}
    >
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
              { color: isRecipe ? colors.text : colors.textMuted },
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
    // md e senza bordo sull'ultima riga: stessa altezza e stesso divisore
    // del drawer di riferimento (scelta pasto in AddEntrySheet).
    paddingVertical: theme.spacing.md,
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
    fontWeight: "600",
  },
  kcal: {
    fontSize: 14,
    fontWeight: "600",
  },
});
