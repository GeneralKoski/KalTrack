import { Card, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { MetricEntrySheet } from "@/src/containers/progress/MetricEntrySheet";
import { Sparkline } from "@/src/containers/progress/Sparkline";
import { WeeklyCoachCard } from "@/src/containers/progress/WeeklyCoachCard";
import { getDayDiary } from "@/src/db/queries/diary";
import { listSteps, listWeights, setSteps, setWeight } from "@/src/db/queries/tracking";
import { addDays, todayIso } from "@/src/domain/date";
import { average } from "@/src/domain/stats";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Plus } from "lucide-react-native";
import React, { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
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
  const { navigate } = useAppNav();
  const weightSheetRef = useRef<BottomSheetModal>(null);
  const stepsSheetRef = useRef<BottomSheetModal>(null);

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

  const { data, loading, reload } = useFocusData<ProgressData>(loader);

  // null quando la finestra non ha dati: niente da mostrare qui, lo dice già
  // il messaggio dedicato dentro Sparkline, sotto. Le due cose insieme
  // ripetevano lo stesso "non c'è niente" con due frasi diverse.
  const stat = (value: number | null, unit: string) =>
    value === null ? null : (
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

            <SectionLabel
              style={styles.section}
              right={
                <TouchableOpacity
                  onPress={() => weightSheetRef.current?.present()}
                  activeOpacity={0.6}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("tracking.add_weight")}
                >
                  <Plus size={18} color={colors.accent} />
                </TouchableOpacity>
              }
            >
              {t("progress.weight")}
            </SectionLabel>
            <Card
              style={styles.card}
              onPress={() => navigate("WeightHistory")}
            >
              {stat(data?.latestWeight ?? null, "kg")}
              <Sparkline
                values={data?.weights ?? []}
                emptyLabel={t("progress.weight_empty")}
              />
            </Card>

            <SectionLabel
              style={styles.section}
              right={
                <TouchableOpacity
                  onPress={() => stepsSheetRef.current?.present()}
                  activeOpacity={0.6}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("tracking.add_steps")}
                >
                  <Plus size={18} color={colors.accent} />
                </TouchableOpacity>
              }
            >
              {t("progress.steps_weekly")}
            </SectionLabel>
            <Card style={styles.card} onPress={() => navigate("StepsHistory")}>
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

      <MetricEntrySheet
        ref={weightSheetRef}
        title={t("tracking.add_weight")}
        unit="kg"
        onSave={async (date, value) => {
          await setWeight(date, value);
          reload();
        }}
      />

      <MetricEntrySheet
        ref={stepsSheetRef}
        title={t("tracking.add_steps")}
        unit={t("tracking.steps_unit")}
        onSave={async (date, value) => {
          await setSteps(date, value);
          reload();
        }}
      />
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
  loader: {
    marginTop: theme.spacing.xl,
  },
});
