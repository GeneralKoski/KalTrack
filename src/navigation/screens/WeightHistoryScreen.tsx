import { DfAlert } from "@/src/components/DfAlert";
import { Card, EmptyState, HistoryRow, ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { earliestRecordedDate } from "@/src/db/queries/history";
import { deleteWeight, listWeights } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { WeightLogRow } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { Check, ChevronLeft, Scale, Trash2, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
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
  return kg.toLocaleString("it-IT", { maximumFractionDigits: 1 });
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
  const rows = data ?? [];

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isSelecting = selectedDates.size > 0;

  const toggleSelection = (date: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const exitSelection = () => setSelectedDates(new Set());

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
            <Card style={styles.historyCard}>
              {/* Dal più recente in giù: lo storico si legge a ritroso. */}
              {rows
                .map((row, index) => ({
                  row,
                  delta:
                    index === 0
                      ? null
                      : row.weight_kg - rows[index - 1].weight_kg,
                }))
                .reverse()
                .map(({ row, delta }, index) => {
                  const selected = selectedDates.has(row.date);
                  return (
                    <View key={row.id}>
                      {index > 0 ? (
                        <View
                          style={[
                            styles.separator,
                            { backgroundColor: colors.border },
                          ]}
                        />
                      ) : null}
                      <TouchableOpacity
                        onPress={() => onRowPress(row.date)}
                        onLongPress={() => onRowLongPress(row.date)}
                        activeOpacity={0.6}
                        style={styles.rowTouchable}
                      >
                        <View style={styles.rowMain}>
                          <HistoryRow
                            date={row.date}
                            value={`${formatWeight(row.weight_kg)} kg`}
                            delta={
                              delta === null
                                ? t("tracking.first_entry")
                                : formatWeightDelta(delta)
                            }
                          />
                        </View>
                        {isSelecting ? (
                          <View
                            style={[
                              styles.rowCheck,
                              selected
                                ? { backgroundColor: colors.accent }
                                : {
                                    backgroundColor: "transparent",
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                  },
                            ]}
                          >
                            {selected ? (
                              <Check size={14} color={colors.accentOn} />
                            ) : null}
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    </View>
                  );
                })}
            </Card>
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
  historyCard: {
    paddingVertical: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  rowTouchable: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  rowMain: {
    flex: 1,
  },
  rowCheck: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  loader: {
    marginTop: theme.spacing.xl,
  },
});
