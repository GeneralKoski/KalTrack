import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import type { TargetStatus } from "@/src/domain/targets";
import { theme, type AppTheme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";

// Stato rispetto all'obiettivo -> colore. Riusata da anello calorico, barre dei
// macro e badge, cosi' le tre rappresentazioni restano coerenti. `under` non e'
// ancora un dato da segnalare (l'obiettivo semplicemente non e' stato
// raggiunto): resta neutro, il colore compare solo quando dice qualcosa.
export function targetColor(
  status: TargetStatus,
  colors: AppTheme["colors"],
): string {
  switch (status) {
    case "on_target":
      return theme.colors.success;
    case "over":
      return theme.colors.warning;
    case "under":
      return colors.textMuted;
  }
}

interface TargetDotProps {
  status: TargetStatus;
  /** Valore da mostrare accanto al pallino. Omesso o 0 = nascosto. */
  badge?: number;
  size?: number;
}

/**
 * Pallino di stato rispetto all'obiettivo giornaliero. Il colore da solo non
 * porta mai l'informazione: chi lo usa affianca sempre il numero.
 */
export const TargetDot: React.FC<TargetDotProps> = ({
  status,
  badge = 0,
  size = 12,
}) => {
  const { colors } = useAppTheme();
  const color = targetColor(status, colors);

  return (
    <View style={styles.row}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
      {badge > 0 && (
        <Text style={[styles.badge, { color }]}>{badge}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { fontSize: 15, fontWeight: "700" },
});
