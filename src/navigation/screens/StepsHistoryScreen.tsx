import { DfAlert } from "@/src/components/DfAlert";
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
import { earliestRecordedDate } from "@/src/db/queries/history";
import { deleteSteps, listSteps } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import { average, trendWindowStart, type TrendWindow } from "@/src/domain/stats";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { StepLogRow } from "@/src/types/nutrition";
import { formatInteger } from "@/src/utils/number";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, Footprints, Trash2, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
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

function formatSteps(steps: number): string {
  return formatInteger(steps);
}

function formatStepsDelta(delta: number): string {
  const rounded = Math.round(delta);
  return `${rounded > 0 ? "+" : ""}${formatSteps(rounded)}`;
}

export function StepsHistoryScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

  const loader = useCallback(async (): Promise<StepLogRow[]> => {
    const from = (await earliestRecordedDate()) ?? todayIso();
    return listSteps(from, todayIso());
  }, []);

  const { data, loading, reload } = useFocusData<StepLogRow[]>(loader);
  const rows = useMemo(() => data ?? [], [data]);

  const [window, setWindow] = useState<TrendWindow>("30d");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isSelecting = selectedDates.size > 0;

  const visible = useMemo(() => {
    const from = trendWindowStart(window, todayIso());
    return from === null ? rows : rows.filter((row) => row.date >= from);
  }, [rows, window]);

  const values = visible.map((row) => row.steps);

  /**
   * In cima la media al giorno e il totale, non l'ultimo valore: i passi non
   * sono una grandezza che scorre come il peso - un martedì in casa non dice
   * niente su come si sta camminando.
   *
   * La media è sui giorni REGISTRATI e non su quelli della finestra: un giorno
   * senza registrazione non è un giorno a zero passi.
   */
  const daily = average(values);
  const total = values.reduce((sum, v) => sum + v, 0);

  const items = useMemo(
    () =>
      visible
        .map((row, index) => ({
          id: row.id,
          date: row.date,
          value: `${formatSteps(row.steps)} ${t("tracking.steps_unit")}`,
          delta:
            index === 0
              ? NO_DELTA
              : formatStepsDelta(row.steps - visible[index - 1].steps),
        }))
        .reverse(),
    [visible, t],
  );

  const exitSelection = () => setSelectedDates(new Set());

  const changeWindow = (next: TrendWindow) => {
    // Come nel peso: una riga selezionata fuori dalla finestra sparirebbe
    // dalla vista restando nel gruppo da cancellare.
    exitSelection();
    setWindow(next);
  };

  const toggleSelection = (date: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const onRowPress = (date: string) => {
    if (isSelecting) toggleSelection(date);
  };

  const onRowLongPress = (date: string) => {
    if (!isSelecting) toggleSelection(date);
  };

  const removeSelected = async () => {
    if (selectedDates.size === 0 || deleting) return;
    setDeleting(true);
    try {
      await Promise.all([...selectedDates].map((date) => deleteSteps(date)));
      exitSelection();
      reload();
      showToast.success({ title: t("tracking.steps_deleted") });
    } catch (error) {
      logger.error("[tracking] eliminazione passi fallita", error);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          {isSelecting ? (
            <>
              <TouchableOpacity
                onPress={exitSelection}
                activeOpacity={0.6}
                hitSlop={10}
              >
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {t(
                  selectedDates.size === 1
                    ? "tracking.steps_selected_one"
                    : "tracking.steps_selected_many",
                  { count: selectedDates.size },
                )}
              </Text>
              <TouchableOpacity
                onPress={() => setConfirmDelete(true)}
                activeOpacity={0.6}
                hitSlop={10}
              >
                <Trash2 size={22} color={theme.colors.error} />
              </TouchableOpacity>
            </>
          ) : (
            <>
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
                {t("tracking.steps_history")}
              </Text>
            </>
          )}
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : rows.length === 0 ? (
          <EmptyState
            message={t("progress.steps_empty")}
            icon={<Footprints size={40} color={colors.textFaint} />}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
          >
            <MetricHistoryHero
              value={daily === null ? "–" : formatSteps(daily)}
              unit={t("tracking.steps_unit")}
              valueLabel={t("tracking.steps_daily")}
              detail={values.length === 0 ? NO_DELTA : formatSteps(total)}
              detailLabel={t("tracking.steps_total")}
              values={values}
              emptyLabel={t("tracking.window_empty")}
              variant="bars"
              window={window}
              onWindowChange={changeWindow}
            />

            <SectionLabel style={styles.section}>
              {t("tracking.steps_list")}
            </SectionLabel>

            {items.length === 0 ? (
              <EmptyState compact message={t("tracking.window_empty")} />
            ) : (
              <HistoryList
                items={items}
                selected={selectedDates}
                onPress={onRowPress}
                onLongPress={onRowLongPress}
              />
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <DfAlert
        isOpen={confirmDelete}
        title={t("tracking.delete_steps_title", { count: selectedDates.size })}
        message={t("tracking.delete_steps_message")}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        cancelLabel={t("cancel")}
        loading={deleting}
        onConfirm={removeSelected}
        onClose={() => setConfirmDelete(false)}
      />
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
