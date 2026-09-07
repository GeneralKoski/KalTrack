import { HeroPanel, Segmented } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { TrendChart } from "@/src/containers/progress/TrendChart";
import type { TrendWindow } from "@/src/domain/stats";
import { TREND_WINDOWS } from "@/src/domain/stats";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";

interface MetricHistoryHeroProps {
  /** Gia' formattato: le cifre decimali dipendono dalla grandezza. */
  value: string;
  unit: string;
  valueLabel: string;
  /** Il secondo numero: la variazione per il peso, il totale per i passi. */
  detail: string;
  detailLabel: string;
  values: number[];
  emptyLabel: string;
  variant?: "line" | "bars";
  window: TrendWindow;
  onWindowChange: (window: TrendWindow) => void;
}

/**
 * L'hero degli storici di peso e passi: il numero di adesso, il secondo numero
 * che lo mette in prospettiva, il grafico esteso e la finestra.
 *
 * Il grafico grande vive QUI e non su Progressi, dove le tre metriche sono
 * righe di un blocco. E' la meta' mancante di quella scelta: senza, ridurre le
 * righe avrebbe tolto il grafico dall'app invece di spostarlo.
 */
export const MetricHistoryHero: React.FC<MetricHistoryHeroProps> = ({
  value,
  unit,
  valueLabel,
  detail,
  detailLabel,
  values,
  emptyLabel,
  variant = "line",
  window,
  onWindowChange,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <HeroPanel contentStyle={styles.body}>
      <View style={styles.numbers}>
        <View style={styles.number}>
          <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
            {value}
            <Text style={[styles.unit, { color: colors.textMuted }]}>
              {` ${unit}`}
            </Text>
          </Text>
          <Text style={[styles.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {valueLabel}
          </Text>
        </View>

        <View style={[styles.number, styles.numberRight]}>
          <Text
            style={[styles.detail, { color: colors.text }]}
            numberOfLines={1}
          >
            {detail}
          </Text>
          <Text style={[styles.caption, { color: colors.textMuted }]} numberOfLines={1}>
            {detailLabel}
          </Text>
        </View>
      </View>

      <TrendChart
        values={values}
        emptyLabel={emptyLabel}
        sparseLabel={t("tracking.chart_needs_two")}
        variant={variant}
      />

      <Segmented
        compact
        tone="hero"
        value={window}
        onChange={onWindowChange}
        options={TREND_WINDOWS.map((w) => ({
          value: w,
          label: t(`tracking.window_${w}`),
        }))}
      />
    </HeroPanel>
  );
};

const styles = StyleSheet.create({
  body: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm + 4,
  },
  numbers: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  number: { flex: 1, gap: 2 },
  numberRight: { alignItems: "flex-end" },
  value: { fontSize: 26, fontWeight: "700" },
  unit: { fontSize: 15, fontWeight: "600" },
  detail: { fontSize: 20, fontWeight: "700" },
  caption: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
