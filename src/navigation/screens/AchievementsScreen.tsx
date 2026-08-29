import { MetalPanel, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  AchievementCard,
  type AchievementView,
} from "@/src/containers/progress/AchievementCard";
import {
  collectStats,
  listUnlocked,
  syncAchievements,
} from "@/src/db/queries/achievements";
import {
  ACHIEVEMENTS,
  currentStreak,
  type AchievementDefinition,
  type AchievementMetric,
  type AchievementStats,
} from "@/src/domain/achievements";
import { todayIso } from "@/src/domain/date";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, Flame } from "lucide-react-native";
import React, { useCallback } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Ordine di lettura delle famiglie: dal gesto quotidiano al risultato. */
const FAMILIES: AchievementMetric[] = [
  "loggedDays",
  "workoutDays",
  "totalSteps",
  "bestDaySteps",
  "bestWeightKg",
];

interface AchievementGroup {
  metric: AchievementMetric;
  items: AchievementView[];
}

interface AchievementsData {
  streak: number;
  unlockedCount: number;
  groups: AchievementGroup[];
}

function toView(
  definition: AchievementDefinition,
  stats: AchievementStats,
  unlockedAt: string | null,
  storedValue: number | null,
  justUnlocked: boolean,
): AchievementView {
  const current = stats[definition.metric];
  const unlocked = unlockedAt !== null;

  // Il peso si supera scendendo: la distanza è quanto c'è ANCORA SOPRA la
  // soglia, non quanto manca a raggiungerla salendo. Senza pesate non c'è
  // nessuna distanza da mostrare.
  const distance =
    unlocked || current === null
      ? null
      : definition.lowerIsBetter
        ? current - definition.threshold
        : definition.threshold - current;

  return {
    code: definition.code,
    metric: definition.metric,
    unlockedAt,
    // Sul traguardo raggiunto conta il valore che l'ha fatto scattare, non
    // quello di oggi: è un fatto storico e non deve cambiare col tempo.
    value: unlocked ? storedValue : current,
    remaining: distance !== null && distance > 0 ? distance : null,
    // Il peso non ha uno zero di partenza: una percentuale sarebbe arbitraria.
    progress:
      unlocked || current === null || definition.lowerIsBetter
        ? null
        : Math.min(1, Math.max(0, current / definition.threshold)),
    justUnlocked,
  };
}

export function AchievementsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();

  const loader = useCallback(async (): Promise<AchievementsData> => {
    // Sync prima di leggere: i traguardi maturano mentre si usa l'app, quindi
    // devono essere già aggiornati quando la schermata li mostra.
    const fresh = await syncAchievements();
    const freshCodes = new Set(fresh.map((a) => a.code));
    const [stats, rows] = await Promise.all([collectStats(), listUnlocked()]);

    if (fresh.length > 0) {
      showToast.success({
        title: t("achievements.new_unlocked", { count: fresh.length }),
      });
    }

    const unlockedRows = new Map(rows.map((row) => [row.code, row]));

    return {
      streak: currentStreak(stats.loggedDates, todayIso()),
      unlockedCount: rows.length,
      groups: FAMILIES.map((metric) => ({
        metric,
        items: ACHIEVEMENTS.filter((d) => d.metric === metric).map((d) => {
          const row = unlockedRows.get(d.code);
          return toView(
            d,
            stats,
            row?.unlocked_at ?? null,
            row?.value ?? null,
            freshCodes.has(d.code),
          );
        }),
      })),
    };
  }, [t]);

  const { data, loading } = useFocusData<AchievementsData>(loader);

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("achievements.title")}
          </Text>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <MetalPanel radius={theme.radius.xl} style={styles.streak}>
              <Flame size={26} color={colors.text} />
              <View style={styles.streakBody}>
                {data && data.streak > 0 ? (
                  <Text
                    style={[styles.streakValue, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {data.streak}
                    <Text
                      style={[styles.streakUnit, { color: colors.textSecondary }]}
                    >
                      {` ${t("achievements.streak_days", { count: data.streak })}`}
                    </Text>
                  </Text>
                ) : (
                  <Text
                    style={[styles.streakNone, { color: colors.textSecondary }]}
                    numberOfLines={2}
                  >
                    {t("achievements.streak_none")}
                  </Text>
                )}
                <Text
                  style={[styles.streakMeta, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {t("achievements.counter", {
                    done: data?.unlockedCount ?? 0,
                    total: ACHIEVEMENTS.length,
                  })}
                </Text>
              </View>
            </MetalPanel>

            {(data?.groups ?? []).map((group) => (
              <View key={group.metric}>
                <SectionLabel style={styles.section}>
                  {t(`achievements.family.${group.metric}`)}
                </SectionLabel>
                <View style={styles.groupItems}>
                  {group.items.map((item) => (
                    <AchievementCard key={item.code} item={item} />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  streak: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  streakBody: { flex: 1, gap: 2 },
  streakValue: { fontSize: 26, fontWeight: "700" },
  streakUnit: { fontSize: 14, fontWeight: "500" },
  streakNone: { flexShrink: 1, fontSize: 15, fontWeight: "600" },
  streakMeta: { flexShrink: 1, fontSize: 13 },
  section: { marginTop: theme.spacing.md },
  groupItems: { gap: theme.spacing.sm },
  loader: { marginTop: theme.spacing.xl },
});
