import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import type { AchievementMetric } from "@/src/domain/achievements";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import { Lock, Trophy } from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";

export interface AchievementView {
  code: string;
  metric: AchievementMetric;
  /** Quando è scattato. Null se il traguardo non è ancora raggiunto. */
  unlockedAt: string | null;
  /** Valore che l'ha fatto scattare. Null se non registrato. */
  value: number | null;
  /**
   * Quanto manca alla soglia, già nel verso giusto per la metrica. Null quando
   * la distanza non è calcolabile (es. peso senza nessuna pesata): meglio non
   * dire niente che inventare un numero.
   */
  remaining: number | null;
  /** Avanzamento 0..1. Null dove non ha senso (il peso non parte da zero). */
  progress: number | null;
  /** Sbloccato proprio ora: va messo in evidenza. */
  justUnlocked: boolean;
}

/** Il peso è l'unica metrica con decimali; gli altri sono conteggi. */
const formatValue = (metric: AchievementMetric, value: number): string =>
  metric === "bestWeightKg"
    ? value.toFixed(1).replace(".", ",")
    : Math.round(value).toLocaleString("it-IT");

export const AchievementCard: React.FC<{ item: AchievementView }> = ({
  item,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const unlocked = item.unlockedAt !== null;

  const valueLabel =
    item.value === null
      ? null
      : // `count` serve al plurale, `value` alla formattazione: senza il primo
        // il traguardo diceva "1 allenamenti".
        t(`achievements.value.${item.metric}`, {
          count: item.value,
          value: formatValue(item.metric, item.value),
        });

  let meta: string;
  if (unlocked) {
    const on = t("achievements.unlocked_on", {
      date: formatDate(item.unlockedAt ?? undefined),
    });
    meta = valueLabel === null ? on : `${on} · ${valueLabel}`;
  } else if (item.remaining === null) {
    meta =
      item.metric === "bestWeightKg"
        ? t("achievements.no_weight")
        : t("achievements.locked");
  } else {
    meta = t(`achievements.remaining.${item.metric}`, {
      count: item.remaining,
      value: formatValue(item.metric, item.remaining),
    });
  }

  return (
    <Card style={styles.card}>
      {/*
        Interfaccia monocroma: raggiunto e da raggiungere si distinguono per
        pieno vs vuoto e per il peso del testo, non per un colore.
      */}
      <View
        style={[
          styles.icon,
          {
            backgroundColor: unlocked ? colors.accent : colors.surfaceMuted,
          },
        ]}
      >
        {unlocked ? (
          <Trophy size={18} color={colors.accentOn} />
        ) : (
          <Lock size={16} color={colors.textFaint} />
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              {
                color: unlocked ? colors.text : colors.textSecondary,
                fontWeight: unlocked ? "700" : "500",
              },
            ]}
            numberOfLines={1}
          >
            {t(`achievements.goal.${item.code}`)}
          </Text>
          {item.justUnlocked ? (
            <View style={[styles.badge, { borderColor: colors.accent }]}>
              <Text style={[styles.badgeText, { color: colors.text }]}>
                {t("achievements.new")}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          style={[styles.meta, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {meta}
        </Text>

        {!unlocked && item.progress !== null ? (
          <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.round(item.progress * 100)}%` as const,
                },
              ]}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 2 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  title: { flexShrink: 1, fontSize: 15 },
  badge: {
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  meta: { flexShrink: 1, fontSize: 13 },
  track: {
    height: 4,
    borderRadius: theme.radius.full,
    marginTop: 6,
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: theme.radius.full },
});
