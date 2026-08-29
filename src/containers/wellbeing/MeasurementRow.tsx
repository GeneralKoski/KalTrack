import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import React from "react";
import { StyleSheet, View } from "react-native";

/** Un centimetro e mezzo è una differenza reale: il decimo di cm no, è rumore del metro. */
export function formatCm(value: number): string {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/** Delta con segno esplicito: senza il "+" un aumento si legge come un valore assoluto. */
export function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${formatCm(rounded)}`;
}

interface MeasurementRowProps {
  date: string;
  valueCm: number;
  /** Differenza rispetto alla misura precedente; null sulla prima della serie. */
  deltaCm: number | null;
  note?: string | null;
}

export const MeasurementRow: React.FC<MeasurementRowProps> = ({
  date,
  valueCm,
  deltaCm,
  note,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <Text style={[styles.date, { color: colors.text }]} numberOfLines={1}>
          {formatDate(date)}
        </Text>
        {note ? (
          <Text
            style={[styles.note, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {note}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
        {`${formatCm(valueCm)} ${t("measurements.unit")}`}
      </Text>

      <Text style={[styles.delta, { color: colors.textMuted }]} numberOfLines={1}>
        {deltaCm === null ? t("measurements.first") : formatDelta(deltaCm)}
      </Text>
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
  },
  date: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  note: {
    flexShrink: 1,
    fontSize: 13,
    marginTop: 1,
  },
  value: {
    fontSize: 15,
    fontWeight: "600",
  },
  delta: {
    fontSize: 13,
    // Larghezza fissa: le differenze restano incolonnate anche cambiando segno.
    minWidth: 62,
    textAlign: "right",
  },
});
