import { hasGroqKey } from "@/src/ai/config";
import {
  MIN_LOGGED_DAYS,
  WEEK_DAYS,
  weeklyReview,
  weeklyStats,
  type CoachComment,
  type WeeklyMetric,
  type WeeklyStats,
} from "@/src/ai/weeklyCoach";
import { Card, MetalSurface, targetColor } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { targetStatus } from "@/src/domain/targets";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { Sparkles } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";

const integer = (value: number): string =>
  Math.round(value).toLocaleString("it-IT");

const oneDecimal = (value: number): string =>
  value.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/**
 * Uno scostamento senza segno non dice da che parte sta.
 *
 * Il segno si decide sul numero ARROTONDATO, non su quello grezzo: -0,04 kg
 * arrotondato a un decimale è zero, e stampare "-0,0" farebbe leggere un calo
 * dove non c'è nulla.
 */
const signed = (value: number, decimals: 0 | 1): string => {
  const factor = decimals === 0 ? 1 : 10;
  const rounded = Math.round(value * factor) / factor;
  const rendered =
    decimals === 0 ? integer(Math.abs(rounded)) : oneDecimal(Math.abs(rounded));
  return rounded < 0 ? `-${rendered}` : `+${rendered}`;
};

interface Row {
  label: string;
  /** Null quando la settimana non ha nessuna misura: si mostra come assente. */
  value: string | null;
  hint: string | null;
  hintColor?: string;
}

const StatRow: React.FC<{ row: Row; emptyLabel: string }> = ({
  row,
  emptyLabel,
}) => {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        <Text
          style={[styles.label, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {row.label}
        </Text>
        {row.hint ? (
          <Text
            style={[styles.hint, { color: row.hintColor ?? colors.textMuted }]}
            numberOfLines={1}
          >
            {row.hint}
          </Text>
        ) : null}
      </View>
      {/* Il valore non si restringe: è il dato, l'etichetta può troncarsi. */}
      {row.value === null ? (
        <Text style={[styles.empty, { color: colors.textFaint }]}>
          {emptyLabel}
        </Text>
      ) : (
        <Text style={[styles.value, { color: colors.text }]}>{row.value}</Text>
      )}
    </View>
  );
};

/**
 * Il coach settimanale: statistiche calcolate in locale, sempre visibili, più
 * un commento del modello che si chiede a mano.
 *
 * Il commento non parte da solo all'apertura della schermata: costa una
 * chiamata ogni volta che si passa di qui, e su una settimana i numeri
 * cambiano poco. Chi lo vuole lo chiede, e può rigenerarlo.
 */
export const WeeklyCoachCard: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const loader = useCallback(() => weeklyStats(), []);
  const { data, loading } = useFocusData<WeeklyStats>(loader);
  const [busy, setBusy] = useState(false);
  const [commented, setCommented] = useState<{
    key: string;
    comment: CoachComment;
  } | null>(null);

  // Il commento descrive una fotografia precisa della settimana. Se i dati
  // cambiano sotto (un pasto registrato altrove, una pesata) smette di
  // descrivere ciò che si sta guardando: legarlo alla sua istantanea lo fa
  // sparire da solo invece di restare a schermo come se valesse ancora.
  const statsKey = data === null ? null : JSON.stringify(data);
  const comment =
    commented !== null && commented.key === statsKey ? commented.comment : null;

  const generate = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    try {
      const review = await weeklyReview({ stats: data });
      if (review.comment !== null) {
        setCommented({ key: JSON.stringify(review.stats), comment: review.comment });
        return;
      }
      // Un tocco che non produce niente è indistinguibile da un guasto: ogni
      // esito senza commento dice perché.
      showToast.info({ title: t(`weekly_coach.status.${review.status}`) });
    } catch (error) {
      logger.error("[WeeklyCoachCard] commento non riuscito", error);
      showToast.error({ title: t("weekly_coach.status.unavailable") });
    } finally {
      setBusy(false);
    }
  }, [data, t]);

  const metricRow = (
    label: string,
    metric: WeeklyMetric,
    unit: string,
    /** Solo le calorie colorano lo scostamento: vedi sotto. */
    colored = false,
  ): Row => {
    if (metric.average === null) {
      return { label, value: null, hint: null };
    }
    const value = `${integer(metric.average)}${unit ? ` ${unit}` : ""}`;
    if (metric.deviation === null || metric.target === null) {
      return { label, value, hint: t("weekly_coach.no_target") };
    }
    return {
      label,
      value,
      hint: t("weekly_coach.deviation", {
        value: `${signed(metric.deviation, 0)}${unit ? ` ${unit}` : ""}`,
      }),
      // Il colore è riservato ai dati: qui dice "sopra l'obiettivo calorico",
      // che è uno stato. Su proteine e passi superare l'obiettivo non è un
      // avviso, quindi lì lo scostamento resta neutro.
      hintColor: colored
        ? targetColor(targetStatus(metric.average, metric.target), colors)
        : undefined,
    };
  };

  const rows: Row[] = data
    ? [
        {
          label: t("weekly_coach.logged_days"),
          value: t("weekly_coach.days_value", {
            done: data.loggedDays,
            total: WEEK_DAYS,
          }),
          hint: null,
        },
        metricRow(t("weekly_coach.kcal"), data.kcal, "kcal", true),
        metricRow(t("weekly_coach.protein"), data.protein, "g"),
        metricRow(t("weekly_coach.steps"), data.steps, ""),
        {
          label: t("weekly_coach.workouts"),
          value: t("weekly_coach.days_value", {
            done: data.workoutDays,
            total: WEEK_DAYS,
          }),
          hint: null,
        },
        {
          label: t("weekly_coach.weight"),
          value:
            data.weight.last === null
              ? null
              : `${oneDecimal(data.weight.last)} kg`,
          hint:
            data.weight.changeKg === null
              ? null
              : t("weekly_coach.weight_change", {
                  value: signed(data.weight.changeKg, 1),
                }),
        },
      ]
    : [];

  const enoughData = data !== null && data.loggedDays >= MIN_LOGGED_DAYS;
  const configured = hasGroqKey();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Sparkles size={18} color={colors.textMuted} />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {t("weekly_coach.title")}
        </Text>
        <Text style={[styles.period, { color: colors.textMuted }]} numberOfLines={1}>
          {t("weekly_coach.period")}
        </Text>
      </View>

      {data === null ? (
        loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          // useFocusData ha già loggato l'errore: qui resta da dire che i
          // numeri non ci sono, non perché manchi il commento.
          <Text style={[styles.note, { color: colors.textFaint }]}>
            {t("general_error")}
          </Text>
        )
      ) : (
        <>
          <View style={styles.rows}>
            {rows.map((row) => (
              <StatRow
                key={row.label}
                row={row}
                emptyLabel={t("weekly_coach.not_recorded")}
              />
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {!enoughData ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              {t("weekly_coach.status.not_enough_data")}
            </Text>
          ) : !configured ? (
            <Text style={[styles.note, { color: colors.textMuted }]}>
              {t("weekly_coach.status.no_key")}
            </Text>
          ) : (
            <>
              {comment !== null ? (
                <View style={styles.comment}>
                  <Text style={[styles.summary, { color: colors.text }]}>
                    {comment.summary}
                  </Text>

                  {comment.observations.map((observation, index) => (
                    <View key={index} style={styles.bulletRow}>
                      <View
                        style={[styles.bullet, { backgroundColor: colors.textFaint }]}
                      />
                      <Text
                        style={[styles.observation, { color: colors.textSecondary }]}
                      >
                        {observation}
                      </Text>
                    </View>
                  ))}

                  {comment.suggestion !== null ? (
                    <View
                      style={[styles.suggestion, { borderColor: colors.border }]}
                    >
                      <Text
                        style={[styles.suggestionLabel, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {t("weekly_coach.suggestion")}
                      </Text>
                      <Text style={[styles.suggestionText, { color: colors.text }]}>
                        {comment.suggestion}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={[styles.disclaimer, { color: colors.textFaint }]}>
                    {t("weekly_coach.disclaimer")}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={generate}
                activeOpacity={0.6}
                disabled={busy}
              >
                <MetalSurface radius={theme.radius.lg} style={styles.button}>
                  {busy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text
                      style={[styles.buttonLabel, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {comment === null
                        ? t("weekly_coach.ask")
                        : t("weekly_coach.regenerate")}
                    </Text>
                  )}
                </MetalSurface>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: { flex: 1, fontSize: 15, fontWeight: "700" },
  period: { fontSize: 12, fontWeight: "500" },
  loader: { marginVertical: theme.spacing.md },
  rows: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  rowLabel: { flexShrink: 1 },
  label: { flexShrink: 1, fontSize: 13 },
  hint: { flexShrink: 1, fontSize: 11, marginTop: 1 },
  value: { fontSize: 15, fontWeight: "700" },
  empty: { fontSize: 13, fontWeight: "500" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  note: { fontSize: 12, lineHeight: 17 },
  comment: { gap: theme.spacing.sm },
  summary: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  bullet: { width: 4, height: 4, borderRadius: 2, marginTop: 8 },
  observation: { flexShrink: 1, fontSize: 13, lineHeight: 19 },
  suggestion: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 2,
  },
  suggestionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  suggestionText: { fontSize: 13, lineHeight: 19 },
  disclaimer: { fontSize: 11, lineHeight: 15 },
  button: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  buttonLabel: { flexShrink: 1, fontSize: 14, fontWeight: "600" },
});
