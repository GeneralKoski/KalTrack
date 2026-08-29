import { ASSISTANT_FAB_CLEARANCE } from "@/src/containers/assistant/AssistantButton";
import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import {
  Card,
  Chip,
  EmptyState,
  MetalPanel,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { nowIso } from "@/src/db/ids";
import {
  endFasting,
  listFastingHistory,
  openFasting,
  startFasting,
} from "@/src/db/queries/wellbeing";
import {
  FASTING_PROTOCOLS,
  fastingProgress,
  formatDuration,
  hoursBetween,
  type FastingProtocol,
} from "@/src/domain/fasting";
import { FastingRing } from "@/src/containers/wellbeing/FastingCard";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import { logger } from "@/src/utils/logger";
import { ChevronLeft, Timer } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Un digiuno dura ore: il secondo sarebbe rumore e sveglierebbe il render 60 volte di più. */
const TICK_MS = 60_000;
const HISTORY_LIMIT = 30;

const protocolLabel = (p: FastingProtocol): string =>
  `${p.fastingHours}:${p.eatingHours}`;

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

export function FastingScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();

  const load = useCallback(async () => {
    const [open, history] = await Promise.all([
      openFasting(),
      listFastingHistory(HISTORY_LIMIT),
    ]);
    return { open, history };
  }, []);
  const { data, loading, reload } = useFocusData(load);

  const [protocol, setProtocol] = useState<FastingProtocol>(
    // 16:8 è il protocollo più diffuso: è il punto di partenza meno sorprendente.
    FASTING_PROTOCOLS.find((p) => p.code === "16_8") ?? FASTING_PROTOCOLS[0],
  );
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const open = data?.open ?? null;
  const startedAt = open?.started_at ?? null;

  useEffect(() => {
    if (!startedAt) return;
    // Riallinea subito: tornando qui dopo ore, l'ultimo `now` è vecchio quanto la pausa.
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  const start = async () => {
    try {
      await startFasting(nowIso(), protocol.fastingHours);
    } catch (error) {
      logger.error("[FastingScreen] errore avvio digiuno", error);
    }
    reload();
  };

  const end = async () => {
    setConfirmEnd(false);
    try {
      await endFasting(nowIso());
    } catch (error) {
      logger.error("[FastingScreen] errore chiusura digiuno", error);
    }
    reload();
  };

  const progress = open
    ? fastingProgress({
        startedAt: open.started_at,
        targetHours: open.target_hours,
        now,
      })
    : null;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("fasting.title")}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {open && progress ? (
              <Card style={styles.current}>
                <FastingRing
                  ratio={progress.ratio}
                  completed={progress.completed}
                  size={168}
                  stroke={12}
                >
                  <Text style={[styles.elapsed, { color: colors.text }]}>
                    {formatDuration(progress.elapsedHours)}
                  </Text>
                  <Text style={[styles.caption, { color: colors.textMuted }]}>
                    {open.target_hours
                      ? t("fasting.of_target", {
                          target: formatDuration(open.target_hours),
                        })
                      : t("fasting.no_target")}
                  </Text>
                </FastingRing>

                <Text
                  style={[styles.since, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {t("fasting.started_at", {
                    date: formatDate(open.started_at),
                    time: timeOf(open.started_at),
                  })}
                </Text>

                {progress.completed ? (
                  <Text
                    style={[styles.done, { color: theme.colors.success }]}
                    numberOfLines={1}
                  >
                    {t("fasting.reached")}
                  </Text>
                ) : null}

                <DfButton
                  label={t("fasting.end")}
                  onPress={() => setConfirmEnd(true)}
                />
              </Card>
            ) : (
              <Card style={styles.starter}>
                <Text
                  style={[styles.startTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {t("fasting.choose_protocol")}
                </Text>

                {/* Numero di protocolli variabile: riga scorrevole, mai a capo. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.protocols}
                >
                  {FASTING_PROTOCOLS.map((p) => (
                    <Chip
                      key={p.code}
                      label={protocolLabel(p)}
                      active={p.code === protocol.code}
                      onPress={() => setProtocol(p)}
                    />
                  ))}
                </ScrollView>

                <MetalPanel radius={theme.radius.xl} style={styles.explain}>
                  <View style={styles.explainInner}>
                    <Text
                      style={[styles.explainText, { color: colors.textSecondary }]}
                    >
                      {t("fasting.protocol_explain", {
                        fasting: formatDuration(protocol.fastingHours),
                        eating: formatDuration(protocol.eatingHours),
                      })}
                    </Text>
                  </View>
                </MetalPanel>

                <DfButton label={t("fasting.start_now")} onPress={start} />
              </Card>
            )}

            <SectionLabel style={styles.section}>
              {t("fasting.history")}
            </SectionLabel>

            {data && data.history.length === 0 ? (
              <EmptyState
                message={t("fasting.history_empty")}
                icon={<Timer size={40} color={colors.textFaint} />}
              />
            ) : (
              data?.history.map((row) => {
                // ended_at è garantito non nullo dalla query dello storico.
                const endedAt = row.ended_at ?? row.started_at;
                const duration = hoursBetween(row.started_at, new Date(endedAt));
                const reached =
                  row.target_hours !== null && duration >= row.target_hours;
                return (
                  <Card key={row.id} style={styles.historyRow}>
                    <View style={styles.historyInfo}>
                      <Text
                        style={[styles.historyDate, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {formatDate(row.started_at)}
                      </Text>
                      <Text
                        style={[styles.historyTime, { color: colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {t("fasting.window", {
                          from: timeOf(row.started_at),
                          to: timeOf(endedAt),
                        })}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.historyDuration,
                        { color: reached ? theme.colors.success : colors.text },
                      ]}
                    >
                      {formatDuration(duration)}
                    </Text>
                  </Card>
                );
              })
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <DfAlert
        isOpen={confirmEnd}
        title={t("fasting.end")}
        message={t("fasting.end_confirm")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        onConfirm={end}
        onClose={() => setConfirmEnd(false)}
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
    padding: theme.spacing.md,
    paddingBottom: ASSISTANT_FAB_CLEARANCE,
  },
  loader: { marginTop: theme.spacing.xl },
  current: { alignItems: "center", gap: theme.spacing.sm },
  elapsed: { fontSize: 30, fontWeight: "700" },
  caption: { fontSize: 12, fontWeight: "500", marginTop: -2 },
  since: { fontSize: 13 },
  done: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  starter: { gap: theme.spacing.sm },
  startTitle: { flexShrink: 1, fontSize: 16, fontWeight: "700" },
  protocols: { flexDirection: "row", gap: theme.spacing.xs },
  explain: { marginTop: theme.spacing.xs },
  explainInner: { padding: theme.spacing.md },
  explainText: { fontSize: 13, lineHeight: 19 },
  section: { marginTop: theme.spacing.lg },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  historyInfo: { flex: 1, gap: 2 },
  historyDate: { flexShrink: 1, fontSize: 15, fontWeight: "600" },
  historyTime: { flexShrink: 1, fontSize: 13 },
  historyDuration: { fontSize: 16, fontWeight: "700" },
});
