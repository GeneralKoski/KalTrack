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
import { deleteWeight, listWeights } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import { trendWindowStart, type TrendWindow } from "@/src/domain/stats";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { WeightLogRow } from "@/src/types/nutrition";
import { formatDecimal } from "@/src/utils/number";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, Scale, Trash2, X } from "lucide-react-native";
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

function formatWeight(kg: number): string {
  return formatDecimal(kg, 1);
}

function formatWeightDelta(deltaKg: number): string {
  const rounded = Math.round(deltaKg * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${formatWeight(rounded)}`;
}

export function WeightHistoryScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

  const loader = useCallback(async (): Promise<WeightLogRow[]> => {
    const from = (await earliestRecordedDate()) ?? todayIso();
    return listWeights(from, todayIso());
  }, []);

  const { data, loading, reload } = useFocusData<WeightLogRow[]>(loader);
  const rows = useMemo(() => data ?? [], [data]);

  const [window, setWindow] = useState<TrendWindow>("30d");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isSelecting = selectedDates.size > 0;

  /** La finestra vale per tutta la schermata: grafico, numeri ed elenco. */
  const visible = useMemo(() => {
    const from = trendWindowStart(window, todayIso());
    return from === null ? rows : rows.filter((row) => row.date >= from);
  }, [rows, window]);

  const values = visible.map((row) => row.weight_kg);
  const latest = values.length > 0 ? values[values.length - 1] : null;
  const change =
    values.length > 1 ? values[values.length - 1] - values[0] : null;

  /**
   * Il delta si calcola nell'ordine in cui le pesate sono avvenute e si
   * disegna a ritroso: invertire prima cambierebbe il segno di ogni riga.
   */
  const items = useMemo(
    () =>
      visible
        .map((row, index) => ({
          id: row.id,
          date: row.date,
          value: `${formatWeight(row.weight_kg)} kg`,
          delta:
            index === 0
              ? NO_DELTA
              : formatWeightDelta(row.weight_kg - visible[index - 1].weight_kg),
        }))
        .reverse(),
    [visible],
  );

  const exitSelection = () => setSelectedDates(new Set());

  const changeWindow = (next: TrendWindow) => {
    // Una riga selezionata e poi uscita dalla finestra resterebbe selezionata
    // senza vedersi, e la cancellazione porterebbe via anche quella.
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
      await Promise.all([...selectedDates].map((date) => deleteWeight(date)));
      exitSelection();
      reload();
      showToast.success({ title: t("tracking.weight_deleted") });
    } catch (error) {
      logger.error("[tracking] eliminazione pesate fallita", error);
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
                    ? "tracking.weight_selected_one"
                    : "tracking.weight_selected_many",
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
                {t("tracking.weight_history")}
              </Text>
            </>
          )}
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : rows.length === 0 ? (
          <EmptyState
            message={t("progress.weight_empty")}
            icon={<Scale size={40} color={colors.textFaint} />}
          />
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
          >
            <MetricHistoryHero
              value={latest === null ? "–" : formatWeight(latest)}
              unit="kg"
              valueLabel={t("tracking.weight_latest")}
              detail={change === null ? NO_DELTA : formatWeightDelta(change)}
              detailLabel={t("tracking.weight_change")}
              values={values}
              emptyLabel={t("tracking.window_empty")}
              window={window}
              onWindowChange={changeWindow}
            />

            <SectionLabel style={styles.section}>
              {t("tracking.weight_list")}
            </SectionLabel>

            {items.length === 0 ? (
              // Compatto: uno stato vuoto a piena altezza sotto un hero
              // riserverebbe lo spazio del pieno.
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
        title={t("tracking.delete_weight_title", { count: selectedDates.size })}
        message={t("tracking.delete_weight_message")}
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
