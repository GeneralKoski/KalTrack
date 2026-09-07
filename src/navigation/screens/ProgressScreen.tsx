import {
  ListGroup,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
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
import { formatInteger } from "@/src/utils/number";
import { theme } from "@/src/styles";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { ChevronRight, Plus } from "lucide-react-native";
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

/** La linea in riga: abbastanza per una tendenza, non un grafico da leggere. */
const CHART_WIDTH = 110;
const CHART_HEIGHT = 30;

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

  /**
   * Una riga dell'andamento.
   *
   * Erano tre card impilate, ognuna con la sua etichetta di sezione sopra e un
   * riquadro alto un terzo di schermo dentro: con la finestra vuota - il caso
   * normale di chi ha appena installato - restavano tre rettangoli grandi e
   * vuoti, e la pagina sembrava piena e vuota insieme.
   *
   * Il grafico esteso vive nello storico (`MetricHistoryHero`), che si apre
   * toccando la riga. Per una settimana questo commento lo ha promesso e basta:
   * gli storici non avevano nessun grafico, quindi il grafico grande non
   * esisteva piu' da nessuna parte.
   *
   * `onAdd` assente vuol dire che quel numero non si scrive a mano: le calorie
   * si ricavano dal diario.
   */
  const metric = (
    label: string,
    value: number | null,
    unit: string,
    values: number[],
    emptyLabel: string,
    onOpen?: () => void,
    onAdd?: () => void,
    addLabel?: string,
  ) => (
    <TouchableOpacity
      activeOpacity={0.6}
      disabled={!onOpen}
      accessibilityRole={onOpen ? "button" : undefined}
      accessibilityLabel={label}
      onPress={onOpen}
      style={styles.metricRow}
    >
      <View style={styles.metricHead}>
        <Text style={[styles.metricLabel, { color: colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
          {value === null ? (
            "–"
          ) : (
            <>
              {formatInteger(value)}
              <Text style={[styles.statUnit, { color: colors.textMuted }]}>
                {` ${unit}`}
              </Text>
            </>
          )}
        </Text>
      </View>

      <View style={styles.metricChart}>
        {/* Da due punti in su, perche' UNO non e' una tendenza: un pallino solo
            in mezzo al vuoto sembra un difetto, e il numero c'e' gia' a
            sinistra. Zero punti invece e' un'informazione, e si scrive.
            La cornice ha larghezza fissa perche' `Sparkline` disegna un `Svg` a
            `width="100%"`: in un contenitore elastico si prenderebbe tutto lo
            spazio e il grafico uscirebbe dalla colonna delle altre righe. */}
        {values.length >= 2 ? (
          <View style={styles.metricChartInner}>
            <Sparkline
              values={values}
              emptyLabel={emptyLabel}
              height={CHART_HEIGHT}
              width={CHART_WIDTH}
            />
          </View>
        ) : values.length === 0 ? (
          <Text
            style={[styles.metricEmpty, { color: colors.textFaint }]}
            numberOfLines={1}
          >
            {emptyLabel}
          </Text>
        ) : null}
      </View>

      {/* Lo spazio del chevron e del "+" e' riservato anche a chi non li ha
          (le calorie non si scrivono a mano, si ricavano dal diario): senza,
          l'ultima riga allargherebbe il grafico e le tre non sarebbero piu'
          incolonnate. */}
      {onOpen ? (
        <ChevronRight size={18} color={colors.textFaint} />
      ) : (
        <View style={styles.chevronSpacer} />
      )}

      {onAdd ? (
        <TouchableOpacity
          onPress={onAdd}
          activeOpacity={0.6}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          style={[
            styles.addButton,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        >
          <Plus size={15} color={colors.accent} />
        </TouchableOpacity>
      ) : (
        <View style={styles.addSpacer} />
      )}
    </TouchableOpacity>
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

            {/* La finestra sta nel titolo della sezione e non in ogni riga:
                "Passi, media di 14 giorni" non ci sta in una colonna da 88 px e
                si troncava a "Passi, media di 1...". */}
            <SectionLabel style={styles.section}>
              {t("progress.trend", { days: WINDOW_DAYS })}
            </SectionLabel>

            <ListGroup indent={theme.spacing.md}>
              {metric(
                t("progress.weight"),
                data?.latestWeight ?? null,
                "kg",
                data?.weights ?? [],
                t("progress.weight_empty"),
                () => navigate("WeightHistory"),
                () => weightSheetRef.current?.present(),
                t("tracking.add_weight"),
              )}
              {metric(
                t("progress.steps"),
                data?.stepsAverage ?? null,
                t("tracking.steps_unit"),
                (data?.stepsByDay ?? []).filter((v): v is number => v !== null),
                t("progress.steps_empty"),
                () => navigate("StepsHistory"),
                () => stepsSheetRef.current?.present(),
                t("tracking.add_steps"),
              )}
              {metric(
                t("progress.kcal"),
                data?.kcalAverage ?? null,
                "kcal",
                (data?.kcalByDay ?? []).filter((v): v is number => v !== null),
                t("progress.kcal_empty"),
              )}
            </ListGroup>
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
  section: {
    marginTop: theme.spacing.md,
  },
  metricRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  // Larghezza fissa: senza, il numero piu' lungo sposta il grafico e le tre
  // righe non hanno piu' la stessa colonna.
  metricHead: { width: 88, gap: 1 },
  metricLabel: { fontSize: 11, fontWeight: "500" },
  metricChart: { flex: 1, alignItems: "flex-end", justifyContent: "center" },
  metricChartInner: { width: CHART_WIDTH, height: CHART_HEIGHT },
  metricEmpty: { fontSize: 11 },
  chevronSpacer: { width: 18 },
  statValue: {
    fontSize: 19,
    fontWeight: "700",
  },
  statUnit: {
    fontSize: 11,
    fontWeight: "500",
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  // Solo la larghezza: riusare `addButton` disegnava il bordo del bottone
  // anche dove il bottone non c'e', cioe' un cerchio vuoto che si poteva
  // provare a premere.
  addSpacer: { width: 30 },
  loader: {
    marginTop: theme.spacing.xl,
  },
});
