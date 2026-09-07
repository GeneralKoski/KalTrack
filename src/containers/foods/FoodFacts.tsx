import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { decimalSeparator, formatInteger } from "@/src/utils/number";
import { formatGrams } from "@/src/domain/serving";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodRow } from "@/src/types/nutrition";
import { Salad } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

interface FoodFactsProps {
  food: FoodRow;
}

/**
 * La foto dell'alimento, o il segnaposto quando non ce n'e' una.
 *
 * Esce da qui perche' la usa anche la finestra dei grammi, che il resto del
 * pannello non lo mostra piu'.
 */
export const FoodThumb: React.FC<{ food: FoodRow; size: number }> = ({
  food,
  size,
}) => {
  const { colors } = useAppTheme();

  if (food.image_uri) {
    return (
      <SyncedPhoto
        uri={food.image_uri}
        style={{ width: size, height: size, borderRadius: theme.radius.lg }}
      />
    );
  }

  return (
    <View
      style={[
        styles.photoEmpty,
        { width: size, height: size, backgroundColor: colors.surfaceMuted },
      ]}
    >
      <Salad size={size < 60 ? 20 : 32} color={colors.textFaint} />
    </View>
  );
};

/**
 * I tre macro con il loro pallino colorato.
 *
 * Anche questi servono in due posti - qui per cento grammi, nella finestra dei
 * grammi per la quantita' scritta - e per questo prendono i valori gia'
 * calcolati invece dell'alimento: chi li disegna decide su quale base stanno.
 */
export const MacroTriple: React.FC<{
  protein: number;
  carbs: number;
  fat: number;
}> = ({ protein, carbs, fat }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const macro = (label: string, value: number, color: string) => (
    <View style={styles.macro}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={[styles.macroValue, { color: colors.text }]}>
        {formatGrams(value, decimalSeparator())} g
      </Text>
      <Text
        style={[styles.macroLabel, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  return (
    <View style={styles.macros}>
      {macro(t("diary.protein_short"), protein, theme.colors.macroProtein)}
      {macro(t("diary.carbs_short"), carbs, theme.colors.macroCarbs)}
      {macro(t("diary.fat_short"), fat, theme.colors.macroFat)}
    </View>
  );
};

/**
 * Cosa c'e' dentro un alimento, per cento grammi.
 *
 * I valori sono SEMPRE per cento, ed e' la ragione per cui questo pannello non
 * sta piu' nella finestra dei grammi: li' accanto ai valori della quantita'
 * scritta erano due basi di lettura vicine, e non si sapeva piu' quale si
 * stesse leggendo.
 */
export const FoodFacts: React.FC<FoodFactsProps> = ({ food }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const unit = food.is_liquid === 1 ? "ml" : "g";

  const minor = (label: string, value: number) => (
    <View style={styles.minorRow}>
      <Text
        style={[styles.minorLabel, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text style={[styles.minorValue, { color: colors.textSecondary }]}>
        {formatGrams(value, decimalSeparator())} g
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <FoodThumb food={food} size={88} />

        {/* Il nome NON si ripete qui: chi mostra questo pannello lo ha già
            scritto sopra - il titolo della finestra o la riga scelta. */}
        <View style={styles.headText}>
          {food.brand ? (
            <Text
              style={[styles.brand, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {food.brand}
            </Text>
          ) : null}
          <Text style={[styles.kcal, { color: colors.text }]}>
            {formatInteger(food.kcal)} kcal
          </Text>
          <Text style={[styles.per, { color: colors.textFaint }]}>
            {t("foods.per_hundred", { unit })}
          </Text>
          {food.default_serving_g ? (
            <Text
              style={[styles.per, { color: colors.textFaint }]}
              numberOfLines={1}
            >
              {food.serving_label?.trim()
                ? food.serving_label
                : t("quantity.serving_is", {
                    grams: formatGrams(food.default_serving_g, decimalSeparator()),
                  })}
            </Text>
          ) : null}
        </View>
      </View>

      <MacroTriple protein={food.protein} carbs={food.carbs} fat={food.fat} />

      <View style={[styles.minor, { borderTopColor: colors.border }]}>
        {minor(t("foods.sugars_short"), food.sugars)}
        {minor(t("foods.saturated_fat_short"), food.saturated_fat)}
        {minor(t("foods.fiber_short"), food.fiber)}
        {minor(t("foods.salt_short"), food.salt)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: theme.spacing.sm },
  head: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  photoEmpty: {
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1 },
  brand: { fontSize: 13 },
  kcal: { fontSize: 18, fontWeight: "700", marginTop: 2 },
  per: { fontSize: 11 },
  macros: { flexDirection: "row", gap: theme.spacing.sm },
  macro: { flex: 1, alignItems: "center", gap: 2 },
  macroDot: { width: 8, height: 8, borderRadius: theme.radius.full },
  macroValue: { fontSize: 14, fontWeight: "700" },
  macroLabel: { fontSize: 11 },
  minor: {
    borderTopWidth: 1,
    paddingTop: theme.spacing.sm,
    gap: 2,
  },
  minorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  minorLabel: { flex: 1, fontSize: 13 },
  minorValue: { fontSize: 13, fontWeight: "600" },
});
