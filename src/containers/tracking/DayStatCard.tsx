import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import type { LucideIcon } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

interface DayStatCardProps {
  icon: LucideIcon;
  label: string;
  /** Null quando il giorno non ha una misura: diverso da zero. */
  value: number | null;
  unit: string;
  /** Obiettivo, se esiste: aggiunge la barra di avanzamento. */
  target?: number | null;
  emptyLabel: string;
  onPress: () => void;
}

export const DayStatCard: React.FC<DayStatCardProps> = ({
  icon: Icon,
  label,
  value,
  unit,
  target,
  emptyLabel,
  onPress,
}) => {
  const { colors } = useAppTheme();
  const ratio =
    value !== null && target && target > 0 ? Math.min(value / target, 1) : 0;

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Icon size={18} color={colors.textMuted} />
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>

      {value === null ? (
        <Text style={[styles.empty, { color: colors.textFaint }]}>
          {emptyLabel}
        </Text>
      ) : (
        <Text style={[styles.value, { color: colors.text }]}>
          {value.toLocaleString("it-IT")}
          <Text style={[styles.unit, { color: colors.textMuted }]}>
            {` ${unit}`}
          </Text>
        </Text>
      )}

      {target && target > 0 ? (
        <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: colors.accent, width: `${ratio * 100}%` },
            ]}
          />
        </View>
      ) : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 22,
    fontWeight: "700",
  },
  unit: {
    fontSize: 13,
    fontWeight: "500",
  },
  empty: {
    fontSize: 15,
    fontWeight: "500",
  },
  track: {
    height: 5,
    borderRadius: theme.radius.full,
    overflow: "hidden",
    marginTop: 2,
  },
  fill: {
    height: "100%",
    borderRadius: theme.radius.full,
  },
});
