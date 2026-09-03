import { DfAlert } from "@/src/components/DfAlert";
import {
  Card,
  Chip,
  EmptyState,
  HistoryRow,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { DfButton } from "@/src/components/form/DfButton";
import { MetricEntrySheet } from "@/src/containers/progress/MetricEntrySheet";
import { Sparkline } from "@/src/containers/progress/Sparkline";
import {
  deleteMeasurement,
  listMeasurements,
  listMeasurementSites,
  setMeasurement,
  type MeasurementRow as MeasurementRecord,
} from "@/src/db/queries/wellbeing";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { MEASUREMENT_SITES } from "@/src/types/wellbeing";
import { formatDate } from "@/src/utils/dateUtils";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  Check,
  ChevronLeft,
  Minus,
  Plus,
  Ruler,
  TrendingDown,
  TrendingUp,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
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

/** Un centimetro e mezzo è una differenza reale: il decimo di cm no, è rumore del metro. */
function formatCm(value: number): string {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

/** Delta con segno esplicito: senza il "+" un aumento si legge come un valore assoluto. */
function formatDelta(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${formatCm(rounded)}`;
}

interface MeasurementsData {
  /** Siti noti più quelli già registrati che non stanno nell'elenco. */
  sites: string[];
  /** Misure del sito selezionato, dalla più vecchia alla più recente. */
  rows: MeasurementRecord[];
}

export function MeasurementsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const insets = useSafeAreaInsets();

  // string e non l'unione dei siti noti: l'utente puo' averne registrato uno
  // che non e' nell'elenco, e quello deve restare selezionabile.
  const [site, setSite] = useState<string>(MEASUREMENT_SITES[0]);
  const sheetRef = useRef<BottomSheetModal>(null);

  const loader = useCallback(async (): Promise<MeasurementsData> => {
    const [stored, rows] = await Promise.all([
      listMeasurementSites(),
      listMeasurements(site),
    ]);
    const known: readonly string[] = MEASUREMENT_SITES;
    const extra = stored.filter((s) => !known.includes(s));
    return { sites: [...MEASUREMENT_SITES, ...extra], rows };
  }, [site]);

  const { data, loading, reload } = useFocusData<MeasurementsData>(loader);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isSelecting = selectedIds.size > 0;

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelection = () => setSelectedIds(new Set());

  const onRowPress = (id: string) => {
    if (isSelecting) toggleSelection(id);
  };

  const onRowLongPress = (id: string) => {
    if (!isSelecting) toggleSelection(id);
  };

  const removeSelected = async () => {
    if (selectedIds.size === 0 || deleting) return;
    setDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteMeasurement(id)));
      exitSelection();
      reload();
      showToast.success({ title: t("measurements.deleted") });
    } catch (error) {
      logger.error("[misure] eliminazione misure fallita", error);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const rows = data?.rows ?? [];
  const first = rows.length > 0 ? rows[0] : null;
  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  // Il senso della schermata: quanto è cambiato dal punto di partenza. Il valore
  // di oggi da solo non dice niente, la differenza sì.
  const totalDelta =
    first && last && rows.length > 1 ? last.value_cm - first.value_cm : null;

  const siteLabel = (value: string) =>
    t(`measurements.sites.${value}`, { defaultValue: value });

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
                  selectedIds.size === 1
                    ? "measurements.selected_one"
                    : "measurements.selected_many",
                  { count: selectedIds.size },
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
              >
                <ChevronLeft size={26} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
              >
                {t("measurements.title")}
              </Text>
            </>
          )}
        </View>

        <View style={styles.sitesWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sites}
          >
            {(data?.sites ?? MEASUREMENT_SITES).map((value) => (
              <Chip
                key={value}
                label={siteLabel(value)}
                active={value === site}
                onPress={() => setSite(value)}
              />
            ))}
          </ScrollView>
        </View>

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + theme.spacing.lg },
            ]}
          >
            <Card style={styles.overviewCard}>
              {last ? (
                <>
                  <View style={styles.valueRow}>
                    <View style={styles.valueGroup}>
                      <Text style={[styles.value, { color: colors.text }]}>
                        {formatCm(last.value_cm)}
                      </Text>
                      <Text
                        style={[styles.unitBadge, { color: colors.textMuted }]}
                      >
                        {t("measurements.unit")}
                      </Text>
                    </View>
                    {totalDelta !== null ? (
                      <View
                        style={[
                          styles.deltaBadge,
                          {
                            backgroundColor: colors.surfaceMuted,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        {totalDelta > 0 ? (
                          <TrendingUp size={14} color={colors.accent} />
                        ) : totalDelta < 0 ? (
                          <TrendingDown size={14} color={colors.accent} />
                        ) : (
                          <Minus size={14} color={colors.textMuted} />
                        )}
                        <Text
                          style={[
                            styles.deltaBadgeText,
                            { color: colors.text },
                          ]}
                        >
                          {formatDelta(totalDelta)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.deltaSub, { color: colors.textSecondary }]}
                  >
                    {totalDelta === null || !first
                      ? t("measurements.only_one")
                      : t("measurements.since_first", {
                          delta: formatDelta(totalDelta),
                          date: formatDate(first.date),
                        })}
                  </Text>
                  <View style={styles.chartWrapper}>
                    <Sparkline
                      values={rows.map((r) => r.value_cm)}
                      emptyLabel={t("measurements.chart_empty")}
                    />
                  </View>
                </>
              ) : (
                <EmptyState
                  message={t("measurements.empty", { site: siteLabel(site) })}
                  icon={<Ruler size={40} color={colors.textFaint} />}
                />
              )}
            </Card>

            <DfButton
              label={t("measurements.add")}
              icon={<Plus size={18} color={colors.accent} />}
              variant="outlined"
              onPress={() => sheetRef.current?.present()}
            />

            {rows.length > 0 ? (
              <View style={styles.historySection}>
                <SectionLabel style={styles.sectionHeader}>
                  {`${t("measurements.history")} (${rows.length})`}
                </SectionLabel>
                <Card style={styles.historyCard}>
                  {/* Dal più recente in giù: lo storico si legge a ritroso. */}
                  {rows
                    .map((row, index) => ({
                      row,
                      // Il delta guarda la misura precedente in ordine di data,
                      // non quella sopra nella lista, che è la successiva.
                      delta:
                        index === 0
                          ? null
                          : row.value_cm - rows[index - 1].value_cm,
                    }))
                    .reverse()
                    .map(({ row, delta }, index) => {
                      const selected = selectedIds.has(row.id);
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
                            onPress={() => onRowPress(row.id)}
                            onLongPress={() => onRowLongPress(row.id)}
                            activeOpacity={0.6}
                            style={styles.rowTouchable}
                          >
                            <View style={styles.rowMain}>
                              <HistoryRow
                                date={row.date}
                                value={`${formatCm(row.value_cm)} ${t("measurements.unit")}`}
                                delta={
                                  delta === null
                                    ? t("measurements.first")
                                    : formatDelta(delta)
                                }
                                note={row.note}
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
              </View>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>

      <MetricEntrySheet
        ref={sheetRef}
        title={t("measurements.add_for", { site: siteLabel(site) })}
        unit={t("measurements.unit")}
        onSave={async (date, value) => {
          await setMeasurement(date, site, value);
          reload();
        }}
      />

      <DfAlert
        isOpen={confirmDelete}
        title={t("measurements.delete_title", { count: selectedIds.size })}
        message={t("measurements.delete_message")}
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
  sitesWrapper: {
    flexGrow: 0,
    paddingBottom: 6,
  },
  sites: {
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    gap: 6,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  overviewCard: {
    gap: theme.spacing.sm,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueGroup: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  value: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  unitBadge: {
    fontSize: 16,
    fontWeight: "600",
  },
  deltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  deltaBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  deltaSub: {
    fontSize: 13,
    marginTop: -4,
  },
  chartWrapper: {
    marginTop: 4,
  },
  historySection: {
    gap: 4,
  },
  sectionHeader: {
    marginTop: theme.spacing.xs,
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
