import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { Inbox } from "lucide-react-native";
import React, { type ReactNode } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

// Etichetta di sezione (es. "SEZIONI", "NAVI · 5").
export const SectionLabel: React.FC<{
  children: ReactNode;
  right?: ReactNode;
  style?: ViewStyle;
}> = ({ children, right, style }) => (
  <View style={[styles.sectionRow, style]}>
    <Text style={styles.sectionLabel}>{children}</Text>
    {right}
  </View>
);

// Stato vuoto centrato con icona e messaggio.
export const EmptyState: React.FC<{ message: string; icon?: ReactNode }> = ({
  message,
  icon,
}) => (
  <View style={styles.empty}>
    {icon ?? <Inbox size={40} color={theme.colors.gray300} />}
    <Text style={styles.emptyText}>{message}</Text>
  </View>
);

// Tile quadrato arrotondato per l'icona nelle liste (nave, sezione, ecc.).
export const IconTile: React.FC<{
  children: ReactNode;
  color?: string;
  bg?: string;
  size?: number;
}> = ({ children, bg = theme.colors.brand50, size = 56 }) => (
  <View
    style={[
      styles.iconTile,
      { width: size, height: size, backgroundColor: bg },
    ]}
  >
    {children}
  </View>
);

// Chip/pill filtro selezionabile.
export const Chip: React.FC<{
  label: string;
  active?: boolean;
  onPress?: () => void;
  dotColor?: string;
  // "primary": blu se selezionato, azzurrino se cliccabile (es. filtri notifiche).
  // "dot": se selezionato prende lo sfondo del colore del pallino (che diventa
  //   bianco per contrasto), dimensione leggermente ridotta (storico movimenti).
  variant?: "default" | "primary" | "dot";
}> = ({ label, active = false, onPress, dotColor, variant = "default" }) => {
  const primary = variant === "primary";
  const dot = variant === "dot";
  const chipDotColor = dot && active ? theme.colors.white : dotColor;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        styles.chip,
        dot && styles.chipSmall,
        dot
          ? active
            ? { backgroundColor: dotColor ?? theme.colors.gray600 }
            : styles.chipInactive
          : primary
            ? active
              ? styles.chipActivePrimary
              : styles.chipInactivePrimary
            : active
              ? styles.chipActive
              : styles.chipInactive,
      ]}
    >
      {dotColor && (
        <View
          style={[
            styles.chipDot,
            dot && styles.chipDotSmall,
            { backgroundColor: chipDotColor },
          ]}
        />
      )}
      <Text
        style={[
          active
            ? styles.chipTextActive
            : primary
              ? styles.chipTextInactivePrimary
              : styles.chipTextInactive,
          dot && styles.chipTextSmall,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export interface StatTile {
  value: string | number;
  label: string;
  color?: string;
}

// Riga di riquadri statistici (es. VALIDI / IN SCAD / SCADUTI).
export const StatTiles: React.FC<{ tiles: StatTile[]; style?: ViewStyle }> = ({
  tiles,
  style,
}) => (
  <View style={[styles.statRow, style]}>
    {tiles.map((tile, idx) => (
      <React.Fragment key={tile.label}>
        {idx > 0 && <View style={styles.statDivider} />}
        <View style={styles.statTile}>
          <Text
            style={[
              styles.statValue,
              tile.color ? { color: tile.color } : null,
            ]}
          >
            {tile.value}
          </Text>
          <Text style={styles.statLabel}>{tile.label}</Text>
        </View>
      </React.Fragment>
    ))}
  </View>
);

const styles = StyleSheet.create({
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: theme.colors.gray500,
    textTransform: "uppercase",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl * 2,
    gap: theme.spacing.md,
  },
  emptyText: { fontSize: 14, color: theme.colors.gray400, textAlign: "center" },
  iconTile: {
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: theme.radius.full,
    // Bordo sempre presente (trasparente di default) così attivo/inattivo hanno
    // la stessa dimensione e il chip non si muove al tap.
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { backgroundColor: theme.colors.gray600 },
  chipInactive: {
    backgroundColor: theme.colors.white,
    borderColor: theme.colors.gray200,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipDotSmall: { width: 7, height: 7, borderRadius: 3.5 },
  chipTextSmall: { fontSize: 13 },
  chipActivePrimary: { backgroundColor: theme.colors.primary },
  chipInactivePrimary: { backgroundColor: "#f1f5f9" },
  chipTextActive: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.white,
  },
  chipTextInactive: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.gray700,
  },
  chipTextInactivePrimary: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.md,
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statTile: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: theme.colors.gray200 },
  statValue: { fontSize: 24, fontWeight: "700", color: theme.colors.brand700 },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: theme.colors.gray500,
    textTransform: "uppercase",
  },
});
