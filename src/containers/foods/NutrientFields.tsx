import { DfNumberInput } from "@/src/components/form/DfNumberInput";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { kcalFromMacros } from "@/src/domain/nutrition";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useWatch } from "react-hook-form";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // DfNumberInput usa il formato italiano: migliaia con ".", decimali con ",".
    const parsed = Number(value.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Gli otto valori nutrizionali per 100 g/ml. Sotto le calorie mostra il valore
 * ricalcolato dai macro: se i due numeri divergono molto c'è un refuso, e si
 * vede mentre si digita invece che mesi dopo nei totali.
 */
export const NutrientFields: React.FC = () => {
  const { t } = useTranslation();
  const [kcal, protein, carbs, fat] = useWatch({
    name: ["kcal", "protein", "carbs", "fat"],
  });

  const computed = kcalFromMacros(
    toNumber(protein),
    toNumber(carbs),
    toNumber(fat),
  );
  const entered = toNumber(kcal);
  const drifted = entered > 0 && Math.abs(computed - entered) > entered * 0.25 + 25;

  return (
    <View>
      <DfNumberInput
        name="kcal"
        label={t("foods.kcal")}
        decimals={0}
        rules={{ required: t("required_field") }}
      />
      <Text style={[styles.hint, drifted && styles.hintWarning]}>
        {t("foods.kcal_from_macros", { value: Math.round(computed) })}
      </Text>

      <View style={styles.row}>
        <View style={styles.col}>
          <DfNumberInput name="protein" label={t("foods.protein")} decimals={1} />
        </View>
        <View style={styles.col}>
          <DfNumberInput name="carbs" label={t("foods.carbs")} decimals={1} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <DfNumberInput name="sugars" label={t("foods.sugars")} decimals={1} />
        </View>
        <View style={styles.col}>
          <DfNumberInput name="fat" label={t("foods.fat")} decimals={1} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <DfNumberInput
            name="saturatedFat"
            label={t("foods.saturated_fat")}
            decimals={1}
          />
        </View>
        <View style={styles.col}>
          <DfNumberInput name="fiber" label={t("foods.fiber")} decimals={1} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <DfNumberInput name="salt" label={t("foods.salt")} decimals={2} />
        </View>
        <View style={styles.col} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hint: {
    fontSize: 12,
    color: theme.colors.gray500,
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  hintWarning: {
    color: theme.colors.warning,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  col: {
    flex: 1,
  },
});
