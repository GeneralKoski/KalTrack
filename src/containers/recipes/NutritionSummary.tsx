import { MetalPanel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { roundNutrients, type Nutrients } from "@/src/domain/nutrition";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";

interface NutritionSummaryProps {
  totals: Nutrients;
  servings: number;
}

/**
 * Totali e valori a porzione. Riceve i totali già sommati in memoria dal
 * chiamante, così i numeri si muovono mentre si digita senza passare dal DB.
 */
export const NutritionSummary: React.FC<NutritionSummaryProps> = ({
  totals: rawTotals,
  servings,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const divisor = servings > 0 ? servings : 1;
  const totals = roundNutrients(rawTotals);
  const perServing = roundNutrients({
    kcal: rawTotals.kcal / divisor,
    protein: rawTotals.protein / divisor,
    carbs: rawTotals.carbs / divisor,
    sugars: rawTotals.sugars / divisor,
    fat: rawTotals.fat / divisor,
    saturatedFat: rawTotals.saturatedFat / divisor,
    fiber: rawTotals.fiber / divisor,
    salt: rawTotals.salt / divisor,
  });

  return (
    <MetalPanel radius={theme.radius.xl} style={styles.card}>
      <View style={styles.column}>
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t("recipes.per_serving")}
        </Text>
        <Text style={[styles.kcal, { color: colors.text }]}>
          {Math.round(perServing.kcal)} kcal
        </Text>
        <MacroLine nutrients={perServing} />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.column}>
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {t("recipes.total")}
        </Text>
        <Text style={[styles.kcal, { color: colors.textMuted }]}>
          {Math.round(totals.kcal)} kcal
        </Text>
        <MacroLine nutrients={totals} muted />
      </View>
    </MetalPanel>
  );
};

const MacroLine: React.FC<{
  nutrients: { protein: number; carbs: number; fat: number };
  muted?: boolean;
}> = ({ nutrients, muted = false }) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.macros}>
      <Macro
        value={nutrients.protein}
        color={muted ? colors.textMuted : theme.colors.macro.protein}
        suffix="P"
      />
      <Macro
        value={nutrients.carbs}
        color={muted ? colors.textMuted : theme.colors.macro.carbs}
        suffix="C"
      />
      <Macro
        value={nutrients.fat}
        color={muted ? colors.textMuted : theme.colors.macro.fat}
        suffix="G"
      />
    </View>
  );
};

const Macro: React.FC<{ value: number; color: string; suffix: string }> = ({
  value,
  color,
  suffix,
}) => (
  <Text style={[styles.macro, { color }]}>
    {Math.round(value)}
    {suffix}
  </Text>
);

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  column: {
    flex: 1,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    marginHorizontal: theme.spacing.md,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  kcal: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 2,
  },
  macros: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: 2,
  },
  macro: {
    fontSize: 13,
    fontWeight: "600",
  },
});
