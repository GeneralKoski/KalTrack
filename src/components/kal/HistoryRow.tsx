import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import React from "react";
import { StyleSheet, View } from "react-native";

interface HistoryRowProps {
  date: string;
  /** Già formattato con la sua unità (es. "72,4 kg", "8.412 passi"). */
  value: string;
  /** Già formattato (es. "+0,4", "prima"): il significato del delta dipende dal dominio. */
  delta: string;
  note?: string | null;
}

/** Riga di uno storico data/valore/delta, riusata da misure, peso e passi. */
export const HistoryRow: React.FC<HistoryRowProps> = ({
  date,
  value,
  delta,
  note,
}) => {
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
        {value}
      </Text>

      <Text style={[styles.delta, { color: colors.textMuted }]} numberOfLines={1}>
        {delta}
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
