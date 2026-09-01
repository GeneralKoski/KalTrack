import { DfButton } from "@/src/components/form/DfButton";
import {
  Card,
  Chip,
  EmptyState,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { Sparkline } from "@/src/containers/progress/Sparkline";
import {
  formatCm,
  formatDelta,
  MeasurementRow,
} from "@/src/containers/wellbeing/MeasurementRow";
import {
  listMeasurements,
  listMeasurementSites,
  setMeasurement,
  type MeasurementRow as MeasurementRecord,
} from "@/src/db/queries/wellbeing";
import { todayIso } from "@/src/domain/date";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { MEASUREMENT_SITES } from "@/src/types/wellbeing";
import { formatDate } from "@/src/utils/dateUtils";
import { logger } from "@/src/utils/logger";
import {
  Check,
  ChevronLeft,
  Info,
  Minus,
  Ruler,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

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
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

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

  const rows = data?.rows ?? [];
  const today = todayIso();
  const todayRow = rows.find((r) => r.date === today) ?? null;
  const first = rows.length > 0 ? rows[0] : null;
  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  // Il senso della schermata: quanto è cambiato dal punto di partenza. Il valore
  // di oggi da solo non dice niente, la differenza sì.
  const totalDelta =
    first && last && rows.length > 1 ? last.value_cm - first.value_cm : null;

  const parsed = Number(text.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await setMeasurement(today, site, parsed);
      setText("");
      Keyboard.dismiss();
      reload();
    } catch (error) {
      logger.error("[MeasurementsScreen] salvataggio misura fallito", error);
    } finally {
      setSaving(false);
    }
  };

  const siteLabel = (value: string) =>
    t(`measurements.sites.${value}`, { defaultValue: value });

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {t("measurements.title")}
          </Text>
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

            <Card style={styles.inputCard}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>
                {t("measurements.new")}
              </Text>
              <View style={styles.inputBlock}>
                <View
                  style={[
                    styles.inputFieldWrapper,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor:
                        text.length > 0 ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Ruler size={18} color={colors.textSecondary} />
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    keyboardType="decimal-pad"
                    placeholder={t("measurements.placeholder")}
                    placeholderTextColor={colors.textFaint}
                    style={[styles.inputTextInput, { color: colors.text }]}
                  />
                  <View
                    style={[
                      styles.unitPill,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitPillText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {t("measurements.unit")}
                    </Text>
                  </View>
                </View>

                <DfButton
                  label={t("save")}
                  icon={<Check size={16} color={colors.text} />}
                  onPress={save}
                  disabled={!valid}
                  loading={saving}
                />
              </View>

              {todayRow ? (
                <View
                  style={[
                    styles.hintBox,
                    { backgroundColor: colors.surfaceMuted },
                  ]}
                >
                  <Info size={14} color={colors.textSecondary} />
                  <Text style={[styles.hintText, { color: colors.textMuted }]}>
                    {t("measurements.today_replace", {
                      value: formatCm(todayRow.value_cm),
                    })}
                  </Text>
                </View>
              ) : null}
            </Card>

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
                    .map(({ row, delta }, index) => (
                      <View key={row.id}>
                        {index > 0 ? (
                          <View
                            style={[
                              styles.separator,
                              { backgroundColor: colors.border },
                            ]}
                          />
                        ) : null}
                        <MeasurementRow
                          date={row.date}
                          valueCm={row.value_cm}
                          deltaCm={delta}
                          note={row.note}
                        />
                      </View>
                    ))}
                </Card>
              </View>
            ) : null}
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
  inputCard: {
    gap: theme.spacing.sm,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "600",
  },
  inputBlock: {
    gap: theme.spacing.sm,
  },
  inputFieldWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    gap: theme.spacing.sm,
  },
  inputTextInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    paddingVertical: 0,
  },
  unitPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
  },
  unitPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
  },
  hintText: {
    fontSize: 12,
    flex: 1,
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
  loader: {
    marginTop: theme.spacing.xl,
  },
});
