import { Card, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { Sparkline } from "@/src/containers/progress/Sparkline";
import { WeeklyCoachCard } from "@/src/containers/progress/WeeklyCoachCard";
import { getDayDiary } from "@/src/db/queries/diary";
import { listSteps, listWeights } from "@/src/db/queries/tracking";
import { addDays, todayIso } from "@/src/domain/date";
import { average } from "@/src/domain/stats";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React, { useCallback } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/** Finestra dei grafici: due settimane bastano a vedere una tendenza. */
const WINDOW_DAYS = 14;

interface ProgressData {
  weights: number[];
  latestWeight: number | null;
  stepsByDay: (number | null)[];
  stepsAverage: number | null;
  kcalByDay: (number | null)[];
  kcalAverage: number | null;
}

export function ProgressScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  const loader = useCallback(async (): Promise<ProgressData> => {
    const today = todayIso();
    const from = addDays(today, -(WINDOW_DAYS - 1));
    const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(from, i));

    const [weightRows, stepRows] = await Promise.all([
      listWeights(from, today),
      listSteps(from, today),
    ]);

    const stepsByDate = new Map(stepRows.map((r) => [r.date, r.steps]));
    const stepsByDay = days.map((d) => stepsByDate.get(d) ?? null);

    // Le calorie non hanno una tabella per giorno: si aggregano dal diario.
    const kcalByDay: (number | null)[] = [];
    for (const day of days) {
      const diary = await getDayDiary(day);
      kcalByDay.push(diary.meals.length === 0 ? null : diary.totals.kcal);
    }

    const weights = weightRows.map((r) => r.weight_kg);

    return {
      weights,
      latestWeight: weights.length > 0 ? weights[weights.length - 1] : null,
      stepsByDay,
      stepsAverage: average(stepsByDay),
      kcalByDay,
      kcalAverage: average(kcalByDay),
    };
  }, []);

  const { data, loading } = useFocusData<ProgressData>(loader);

  const stat = (value: number | null, unit: string) =>
    value === null ? (
      <Text style={[styles.statEmpty, { color: colors.textFaint }]}>
        {t("progress.no_data")}
      </Text>
    ) : (
      <Text style={[styles.statValue, { color: colors.text }]}>
        {Math.round(value).toLocaleString("it-IT")}
        <Text style={[styles.statUnit, { color: colors.textMuted }]}>
          {` ${unit}`}
        </Text>
      </Text>
    );

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t("tabs.progress")}
        </Text>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
          >
            <WeeklyCoachCard />

            <SectionLabel style={styles.section}>
              {t("progress.weight")}
            </SectionLabel>
            <Card style={styles.card}>
              {stat(data?.latestWeight ?? null, "kg")}
              <Sparkline
                values={data?.weights ?? []}
                emptyLabel={t("progress.weight_empty")}
              />
            </Card>

            <SectionLabel style={styles.section}>
              {t("progress.steps_weekly")}
            </SectionLabel>
            <Card style={styles.card}>
              {stat(data?.stepsAverage ?? null, t("tracking.steps_unit"))}
              <Sparkline
                values={(data?.stepsByDay ?? []).filter(
                  (v): v is number => v !== null,
                )}
                emptyLabel={t("progress.steps_empty")}
              />
            </Card>

            <SectionLabel style={styles.section}>
              {t("progress.kcal_weekly")}
            </SectionLabel>
            <Card style={styles.card}>
              {stat(data?.kcalAverage ?? null, "kcal")}
              <Sparkline
                values={(data?.kcalByDay ?? []).filter(
                  (v): v is number => v !== null,
                )}
                emptyLabel={t("progress.kcal_empty")}
              />
            </Card>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  title: {
    fontSize: 24,
    fontWeight: "700",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  card: {
    gap: theme.spacing.sm,
  },
  section: {
    marginTop: theme.spacing.md,
  },
  statValue: {
    fontSize: 26,
    fontWeight: "700",
  },
  statUnit: {
    fontSize: 14,
    fontWeight: "500",
  },
  statEmpty: {
    fontSize: 15,
  },
  loader: {
    marginTop: theme.spacing.xl,
  },
});
