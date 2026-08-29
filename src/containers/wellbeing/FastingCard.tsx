import { DfButton } from "@/src/components/form/DfButton";
import { Card } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { openFasting } from "@/src/db/queries/wellbeing";
import { fastingProgress, formatDuration } from "@/src/domain/fasting";
import { useFocusData } from "@/src/hooks/useFocusData";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { Timer } from "lucide-react-native";
import React, { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

/** Un digiuno dura ore: al minuto il numero è già più preciso di quanto serva. */
const TICK_MS = 60_000;

interface FastingRingProps {
  /** Frazione dell'obiettivo (0..1), null quando l'obiettivo non c'è. */
  ratio: number | null;
  completed: boolean;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}

/**
 * Anello del digiuno. Si ferma a pieno quando l'obiettivo è raggiunto: le ore
 * oltre l'obiettivo continuano a crescere, ma le mostra il testo, non l'anello.
 */
export const FastingRing: React.FC<FastingRingProps> = ({
  ratio,
  completed,
  size = 84,
  stroke = 8,
  children,
}) => {
  const { colors } = useAppTheme();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Il verde qui è stato rispetto all'obiettivo, non decorazione.
  const color = completed ? theme.colors.success : colors.accent;

  return (
    <View style={[styles.ring, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceMuted}
          strokeWidth={stroke}
          fill="none"
        />
        {ratio !== null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
            // Parte da ore 12 invece che da ore 3.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        {children}
      </View>
    </View>
  );
};

interface FastingCardProps {
  /** Apre la schermata del digiuno: lì si sceglie il protocollo e si chiude. */
  onOpen: () => void;
}

/** Stato del digiuno in corso, con le ore che avanzano da sole. */
export const FastingCard: React.FC<FastingCardProps> = ({ onOpen }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const { data: fasting, loading } = useFocusData(openFasting);
  const [now, setNow] = useState(() => new Date());
  const startedAt = fasting?.started_at ?? null;

  useEffect(() => {
    if (!startedAt) return;
    // Riallinea subito: tornando sulla schermata dopo ore, l'ultimo `now`
    // salvato è vecchio quanto la pausa.
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  if (loading) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <Timer size={18} color={colors.textMuted} />
          <Text
            style={[styles.label, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {t("fasting.title")}
          </Text>
        </View>
      </Card>
    );
  }

  if (!fasting) {
    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <Timer size={18} color={colors.textMuted} />
          <Text
            style={[styles.label, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {t("fasting.title")}
          </Text>
        </View>
        <Text style={[styles.empty, { color: colors.textFaint }]}>
          {t("fasting.none_open")}
        </Text>
        <DfButton
          label={t("fasting.start")}
          variant="outlined"
          onPress={onOpen}
          style={styles.start}
        />
      </Card>
    );
  }

  const progress = fastingProgress({
    startedAt: fasting.started_at,
    targetHours: fasting.target_hours,
    now,
  });

  return (
    <Card style={styles.card} onPress={onOpen}>
      <View style={styles.header}>
        <Timer size={18} color={colors.textMuted} />
        <Text
          style={[styles.label, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {t("fasting.title")}
        </Text>
      </View>

      <View style={styles.body}>
        <FastingRing ratio={progress.ratio} completed={progress.completed}>
          {progress.ratio !== null ? (
            <Text style={[styles.percent, { color: colors.textMuted }]}>
              {t("fasting.percent", { value: Math.round(progress.ratio * 100) })}
            </Text>
          ) : null}
        </FastingRing>

        <View style={styles.info}>
          <Text style={[styles.elapsed, { color: colors.text }]} numberOfLines={1}>
            {formatDuration(progress.elapsedHours)}
          </Text>
          <Text
            style={[styles.caption, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {fasting.target_hours
              ? t("fasting.of_target", {
                  target: formatDuration(fasting.target_hours),
                })
              : t("fasting.no_target")}
          </Text>
          {progress.completed ? (
            <Text
              style={[styles.done, { color: theme.colors.success }]}
              numberOfLines={1}
            >
              {t("fasting.reached")}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { gap: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  empty: { fontSize: 15, fontWeight: "500" },
  start: { marginTop: theme.spacing.xs },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  info: { flex: 1, gap: 2 },
  elapsed: { fontSize: 26, fontWeight: "700" },
  caption: { flexShrink: 1, fontSize: 13, fontWeight: "500" },
  done: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ring: { alignItems: "center", justifyContent: "center" },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  percent: { fontSize: 13, fontWeight: "700" },
});
