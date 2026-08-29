import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
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
import { ChevronLeft, Ruler } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";


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
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("measurements.title")}
          </Text>
        </View>

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

        {loading && !data ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.content,
              { paddingBottom: insets.bottom + ASSISTANT_FAB_CLEARANCE },
            ]}
          >
            <Card style={styles.card}>
              {last ? (
                <>
                  <Text style={[styles.value, { color: colors.text }]}>
                    {formatCm(last.value_cm)}
                    <Text style={[styles.unit, { color: colors.textMuted }]}>
                      {` ${t("measurements.unit")}`}
                    </Text>
                  </Text>
                  <Text style={[styles.delta, { color: colors.textSecondary }]}>
                    {totalDelta === null || !first
                      ? t("measurements.only_one")
                      : t("measurements.since_first", {
                          delta: formatDelta(totalDelta),
                          date: formatDate(first.date),
                        })}
                  </Text>
                  <Sparkline
                    values={rows.map((r) => r.value_cm)}
                    emptyLabel={t("measurements.chart_empty")}
                  />
                </>
              ) : (
                <EmptyState
                  message={t("measurements.empty", { site: siteLabel(site) })}
                  icon={<Ruler size={40} color={colors.textFaint} />}
                />
              )}
            </Card>

            <SectionLabel style={styles.section}>
              {t("measurements.new")}
            </SectionLabel>
            <Card style={styles.card}>
              <View style={styles.inputRow}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  keyboardType="decimal-pad"
                  placeholder={t("measurements.placeholder")}
                  placeholderTextColor={colors.textFaint}
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                />
                <Text style={[styles.inputUnit, { color: colors.textMuted }]}>
                  {t("measurements.unit")}
                </Text>
              </View>

              {todayRow ? (
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {t("measurements.today_replace", {
                    value: formatCm(todayRow.value_cm),
                  })}
                </Text>
              ) : null}

              <DfButton
                label={t("save")}
                onPress={save}
                disabled={!valid}
                loading={saving}
              />
            </Card>

            {rows.length > 0 ? (
              <>
                <SectionLabel style={styles.section}>
                  {t("measurements.history")}
                </SectionLabel>
                <Card>
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
              </>
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
  sites: {
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  card: { gap: theme.spacing.sm },
  section: { marginTop: theme.spacing.md },
  value: { fontSize: 30, fontWeight: "700" },
  unit: { fontSize: 15, fontWeight: "500" },
  delta: { fontSize: 14 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm,
  },
  inputUnit: { fontSize: 16, fontWeight: "600", minWidth: 32 },
  hint: { fontSize: 13 },
  separator: { height: StyleSheet.hairlineWidth },
  loader: { marginTop: theme.spacing.xl },
});
