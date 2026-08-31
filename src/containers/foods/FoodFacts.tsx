import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { formatGrams } from "@/src/domain/serving";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodRow } from "@/src/types/nutrition";
import { Salad } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

interface FoodFactsProps {
  food: FoodRow;
  /** Compatto: foto piccola e i soli quattro numeri che si guardano sempre. */
  compact?: boolean;
}

/**
 * Cosa c'e' dentro un alimento, per cento grammi.
 *
 * Serve in due posti - l'elenco da cui si sceglie e la finestra in cui si
 * scrivono i grammi - e per questo e' un componente e non due blocchi di JSX:
 * due copie degli stessi numeri divergono al primo campo aggiunto.
 *
 * I valori sono SEMPRE per cento: quelli della quantita' scelta si vedono un
 * momento dopo nel diario, e mescolare le due basi qui vorrebbe dire non
 * sapere piu' quale delle due si sta leggendo.
 */
export const FoodFacts: React.FC<FoodFactsProps> = ({ food, compact }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const unit = food.is_liquid === 1 ? "ml" : "g";
  const photoSize = compact ? 44 : 88;

  const macro = (label: string, value: number, color: string) => (
    <View style={styles.macro}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={[styles.macroValue, { color: colors.text }]}>
        {formatGrams(value)} g
      </Text>
      <Text
        style={[styles.macroLabel, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );

  const minor = (label: string, value: number) => (
    <View style={styles.minorRow}>
      <Text
        style={[styles.minorLabel, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text style={[styles.minorValue, { color: colors.textSecondary }]}>
        {formatGrams(value)} g
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        {food.image_uri ? (
          <SyncedPhoto
            uri={food.image_uri}
            style={{
              width: photoSize,
              height: photoSize,
              borderRadius: theme.radius.lg,
            }}
          />
        ) : (
          <View
            style={[
              styles.photoEmpty,
              {
                width: photoSize,
                height: photoSize,
                backgroundColor: colors.surfaceMuted,
              },
            ]}
          >
            <Salad size={compact ? 20 : 32} color={colors.textFaint} />
          </View>
        )}

        <View style={styles.headText}>
          {!compact ? (
            <Text
              style={[styles.name, { color: colors.text }]}
              numberOfLines={2}
            >
              {food.name}
            </Text>
          ) : null}
          {food.brand ? (
            <Text
              style={[styles.brand, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {food.brand}
            </Text>
          ) : null}
          <Text style={[styles.kcal, { color: colors.text }]}>
            {Math.round(food.kcal)} kcal
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
                    grams: formatGrams(food.default_serving_g),
                  })}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.macros}>
        {macro(
          t("diary.protein_short"),
          food.protein,
          theme.colors.macroProtein,
        )}
        {macro(t("diary.carbs_short"), food.carbs, theme.colors.macroCarbs)}
        {macro(t("diary.fat_short"), food.fat, theme.colors.macroFat)}
      </View>

      {/* Il resto solo per esteso: in un elenco sarebbero otto numeri per
          riga, e nessuno li legge. */}
      {!compact ? (
        <View style={[styles.minor, { borderTopColor: colors.border }]}>
          {minor(t("foods.sugars_short"), food.sugars)}
          {minor(t("foods.saturated_fat_short"), food.saturated_fat)}
          {minor(t("foods.fiber_short"), food.fiber)}
          {minor(t("foods.salt_short"), food.salt)}
        </View>
      ) : null}
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
  name: { fontSize: 16, fontWeight: "700" },
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
