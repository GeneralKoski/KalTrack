import { Text } from "@/src/components/ui";
import type { TargetStatus } from "@/src/domain/targets";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";

// Mappa stato rispetto all'obiettivo -> colore. Riusata da anello calorico,
// barre dei macro e badge, così le tre rappresentazioni restano coerenti.
export const TARGET_COLOR: Record<TargetStatus, string> = {
  under: theme.colors.primary,
  on_target: theme.colors.success,
  over: theme.colors.warning,
};

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
}) => (
  <View style={styles.row}>
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: TARGET_COLOR[status],
      }}
    />
    {badge > 0 && (
      <Text style={[styles.badge, { color: TARGET_COLOR[status] }]}>
        {badge}
      </Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: { fontSize: 15, fontWeight: "700" },
});
