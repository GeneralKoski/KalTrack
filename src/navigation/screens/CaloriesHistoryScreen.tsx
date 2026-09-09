import {
  EmptyState,
  NO_DELTA,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { HistoryList } from "@/src/containers/progress/HistoryList";
import { MetricHistoryHero } from "@/src/containers/progress/MetricHistoryHero";
import { dailyKcalRange, type DayKcal } from "@/src/db/queries/diary";
import { earliestRecordedDate } from "@/src/db/queries/history";
import { todayIso } from "@/src/domain/date";
import { average, trendWindowStart, type TrendWindow } from "@/src/domain/stats";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatInteger } from "@/src/utils/number";
import { ChevronLeft, Flame } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

function formatKcal(kcal: number): string {
  return formatInteger(kcal);
}

function formatKcalDelta(delta: number): string {
  const rounded = Math.round(delta);
  return `${rounded > 0 ? "+" : ""}${formatKcal(rounded)}`;
}

/**
 * Il resoconto delle calorie, gemello degli storici di peso e passi ma senza
 * modifica, eliminazione ne' selezione multipla: un giorno di calorie e' un
 * totale che si calcola dal diario, non una riga di metrica scritta a mano -
 * non c'e' niente da correggere qui dentro.
 */
export function CaloriesHistoryScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

  // `dailyKcalRange`, non `getDayDiary` in ciclo: su una finestra "tutto" che
  // parte dal primo pasto registrato sarebbero centinaia di viaggi nel
  // database per disegnare una riga per giorno.
  const loader = useCallback(async (): Promise<DayKcal[]> => {
    const from = (await earliestRecordedDate()) ?? todayIso();
    return dailyKcalRange(from, todayIso());
  }, []);

  const { data, loading } = useFocusData<DayKcal[]>(loader);
  const rows = useMemo(() => data ?? [], [data]);

  const [window, setWindow] = useState<TrendWindow>("30d");

  /** La finestra vale per tutta la schermata: grafico, numeri ed elenco. */
  const visible = useMemo(() => {
    const from = trendWindowStart(window, todayIso());
    return from === null ? rows : rows.filter((row) => row.date >= from);
  }, [rows, window]);

  const values = visible.map((row) => row.kcal);

  /**
   * Come i passi: le calorie ripartono da zero ogni giorno, quindi in cima
   * vanno media al giorno e totale, non l'ultimo valore. `dailyKcalRange` non
   * restituisce i giorni senza pasti, quindi `values` porta gia' solo i
   * giorni REGISTRATI - la media non li deve dividere per i giorni della
   * finestra.
   */
  const daily = average(values);
  const total = values.reduce((sum, v) => sum + v, 0);

  const items = useMemo(
    () =>
      visible
        .map((row, index) => ({
          id: row.date,
          date: row.date,
          value: `${formatKcal(row.kcal)} kcal`,
          delta:
            index === 0
              ? NO_DELTA
              : formatKcalDelta(row.kcal - visible[index - 1].kcal),
        }))
        .reverse(),
    [visible],
  );

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={goBack}
            activeOpacity={0.6}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("back")}
          >
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {t("tracking.kcal_history")}
          </Text>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : rows.length === 0 ? (
          <EmptyState
            message={t("progress.kcal_empty")}
            icon={<Flame size={40} color={colors.textFaint} />}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
          >
            <MetricHistoryHero
              value={daily === null ? "–" : formatKcal(daily)}
              unit="kcal"
              valueLabel={t("tracking.kcal_daily")}
              detail={values.length === 0 ? NO_DELTA : formatKcal(total)}
              detailLabel={t("tracking.kcal_total")}
              values={values}
              emptyLabel={t("tracking.window_empty")}
              variant="bars"
              window={window}
              onWindowChange={setWindow}
            />

            <SectionLabel style={styles.section}>
              {t("tracking.kcal_list")}
            </SectionLabel>

            {items.length === 0 ? (
              <EmptyState compact message={t("tracking.window_empty")} />
            ) : (
              <HistoryList items={items} />
            )}
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
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  section: { marginTop: theme.spacing.sm },
  loader: {
    marginTop: theme.spacing.xl,
  },
});
