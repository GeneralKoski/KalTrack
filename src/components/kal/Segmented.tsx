import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import React from "react";
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

/**
 * Selettore a segmenti: poche opzioni fisse, tutte visibili insieme.
 *
 * E' l'alternativa ai chip scorrevoli, che in un selettore sono il difetto
 * peggiore: il punto di un selettore e' vedere le alternative, e una riga che
 * scorre le taglia a meta' parola ("Dropset" -> "Drops", "Prossima" ->
 * "Pross..."). Con due, tre o quattro opzioni corte la larghezza c'e'.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Segmenti da 28 invece che da 36: per quando sta in riga con altro. */
  compact?: boolean;
  /**
   * Sopra il metallo di `HeroPanel` la cornice chiara sparisce: `hero` la
   * sostituisce con un incavo scuro, che regge su entrambi i temi.
   */
  tone?: "surface" | "hero";
  style?: StyleProp<ViewStyle>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  tone = "surface",
  style,
}: SegmentedProps<T>) {
  const { colors } = useAppTheme();
  const onHero = tone === "hero";

  return (
    <View
      style={[
        styles.track,
        onHero
          ? { backgroundColor: "rgba(0, 0, 0, 0.25)" }
          : {
              backgroundColor: colors.surfaceMuted,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.segment,
              compact ? styles.segmentCompact : styles.segmentRegular,
              active && { backgroundColor: colors.accent },
            ]}
          >
            <Text
              style={[
                compact ? styles.labelCompact : styles.label,
                { color: active ? colors.accentOn : colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderRadius: theme.radius.md,
    padding: 2,
    gap: 2,
  },
  segment: {
    flexGrow: 1,
    flexBasis: 0,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentRegular: { height: 36 },
  segmentCompact: { height: 28 },
  label: { fontSize: 13, fontWeight: "600" },
  labelCompact: { fontSize: 11, fontWeight: "600" },
});
