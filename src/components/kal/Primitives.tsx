import { useAppTheme } from "@/src/components/ThemeContext";
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
}> = ({ children, right, style }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.sectionRow, style]}>
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
        {children}
      </Text>
      {right}
    </View>
  );
};

// Stato vuoto centrato con icona e messaggio.
export const EmptyState: React.FC<{ message: string; icon?: ReactNode }> = ({
  message,
  icon,
}) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.empty}>
      {icon ?? <Inbox size={40} color={colors.textFaint} />}
      <Text style={[styles.emptyText, { color: colors.textFaint }]}>
        {message}
      </Text>
    </View>
  );
};

// Tile quadrato arrotondato per l'icona nelle liste (nave, sezione, ecc.).
export const IconTile: React.FC<{
  children: ReactNode;
  color?: string;
  bg?: string;
  size?: number;
}> = ({ children, bg, size = 56 }) => {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.iconTile,
        {
          width: size,
          height: size,
          backgroundColor: bg ?? colors.surfaceMuted,
        },
      ]}
    >
      {children}
    </View>
  );
};

// Chip/pill filtro selezionabile.
export const Chip: React.FC<{
  label: string;
  active?: boolean;
  onPress?: () => void;
  dotColor?: string;
  // "primary": interattivo se selezionato, tenue se cliccabile (es. filtri notifiche).
  // "dot": se selezionato prende lo sfondo del colore del pallino (che diventa
  //   bianco per contrasto), dimensione leggermente ridotta (storico movimenti).
  variant?: "default" | "primary" | "dot";
}> = ({ label, active = false, onPress, dotColor, variant = "default" }) => {
  const { colors } = useAppTheme();
  const primary = variant === "primary";
  const dot = variant === "dot";
  const chipDotColor = dot && active ? theme.colors.white : dotColor;
  const inactive = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };
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
            : inactive
          : active
            ? { backgroundColor: colors.accent }
            : primary
              ? { backgroundColor: colors.surfaceMuted }
              : inactive,
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
          styles.chipText,
          dot && styles.chipTextSmall,
          {
            // Un chip "dot" attivo sta sopra un colore di dato: li' il bianco
            // resta bianco. Gli altri stanno sopra `accent`.
            color: active
              ? dot
                ? theme.colors.white
                : colors.accentOn
              : primary
                ? colors.textMuted
                : colors.textSecondary,
          },
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
}) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.statRow, { backgroundColor: colors.surface }, style]}>
      {tiles.map((tile, idx) => (
        <React.Fragment key={tile.label}>
          {idx > 0 && (
            <View
              style={[styles.statDivider, { backgroundColor: colors.border }]}
            />
          )}
          <View style={styles.statTile}>
            <Text
              style={[styles.statValue, { color: tile.color ?? colors.text }]}
            >
              {tile.value}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>
              {tile.label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
};

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
    textTransform: "uppercase",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl * 2,
    gap: theme.spacing.md,
  },
  emptyText: { fontSize: 14, textAlign: "center" },
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
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipDotSmall: { width: 7, height: 7, borderRadius: 3.5 },
  chipTextSmall: { fontSize: 13 },
  chipText: { fontSize: 14, fontWeight: "600" },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.md,
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  statTile: { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, height: 32 },
  statValue: { fontSize: 24, fontWeight: "700" },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
