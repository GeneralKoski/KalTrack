import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import type { Nutrients } from "@/src/domain/nutrition";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";

interface MacroBarsProps {
  consumed: Nutrients;
  /** Obiettivi in grammi. Assenti, le barre mostrano solo i valori. */
  targets?: { proteinG: number; carbsG: number; fatG: number } | null;
}

/**
 * Le tre barre dei macro. Il colore qui è dato, non decorazione: identifica il
 * macronutriente ed è lo stesso token usato ovunque.
 */
export const MacroBars: React.FC<MacroBarsProps> = ({ consumed, targets }) => {
  const { t } = useTranslation();

  return (
    <View style={styles.group}>
      <Bar
        label={t("diary.protein_short")}
        value={consumed.protein}
        target={targets?.proteinG}
        color={theme.colors.macro.protein}
      />
      <Bar
        label={t("diary.carbs_short")}
        value={consumed.carbs}
        target={targets?.carbsG}
        color={theme.colors.macro.carbs}
      />
      <Bar
        label={t("diary.fat_short")}
        value={consumed.fat}
        target={targets?.fatG}
        color={theme.colors.macro.fat}
      />
    </View>
  );
};

const Bar: React.FC<{
  label: string;
  value: number;
  target?: number;
  color: string;
}> = ({ label, value, target, color }) => {
  const { colors } = useAppTheme();
  const ratio = target && target > 0 ? Math.min(value / target, 1) : 0;

  return (
    <View style={styles.bar}>
      <View style={styles.labelRow}>
        <Text
          style={[styles.label, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={[styles.value, { color: colors.text }]}
          numberOfLines={1}
        >
          {Math.round(value)}
          {target ? (
            <Text style={[styles.target, { color: colors.textFaint }]}>
              {` / ${Math.round(target)} g`}
            </Text>
          ) : (
            <Text style={[styles.target, { color: colors.textFaint }]}> g</Text>
          )}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: color, width: `${ratio * 100}%` },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  group: {
    gap: theme.spacing.sm,
  },
  bar: {
    gap: 4,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  label: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    fontSize: 13,
    fontWeight: "600",
  },
  target: {
    fontSize: 12,
    fontWeight: "400",
  },
  track: {
    height: 6,
    borderRadius: theme.radius.full,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: theme.radius.full,
  },
});
