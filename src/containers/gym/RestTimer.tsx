import { MetalPanel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { Plus, SkipForward } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const EXTRA_SECONDS = 30;
const TICK_MS = 250;

interface RestTimerProps {
  seconds: number;
  onFinish: () => void;
  onSkip: () => void;
}

const formatClock = (totalSeconds: number): string => {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
};

/**
 * Conto alla rovescia del recupero.
 *
 * Il tempo residuo si ricalcola da una scadenza assoluta invece di decrementare
 * un contatore: se il thread JS viene rallentato (scroll, query, tastiera) un
 * contatore accumulerebbe ritardo, mentre la differenza con `Date.now()` resta
 * corretta comunque. Il montaggio è fuori dalla ScrollView, quindi scorrere la
 * pagina non lo interrompe.
 */
export const RestTimer: React.FC<RestTimerProps> = ({
  seconds,
  onFinish,
  onSkip,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [totalMs, setTotalMs] = useState(seconds * 1000);
  const [endsAt, setEndsAt] = useState(() => Date.now() + seconds * 1000);
  const [remaining, setRemaining] = useState(seconds);

  // In un ref perché il chiamante ridefinisce la callback a ogni render: nelle
  // dipendenze farebbe ripartire l'intervallo di continuo.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const progress = useSharedValue(1);

  useEffect(() => {
    let finished = false;
    const tick = () => {
      const left = endsAt - Date.now();
      setRemaining(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0 && !finished) {
        finished = true;
        onFinishRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, [endsAt]);

  useEffect(() => {
    const left = Math.max(0, endsAt - Date.now());
    progress.value = Math.min(1, left / totalMs);
    progress.value = withTiming(0, {
      duration: left,
      easing: Easing.linear,
    });
  }, [endsAt, totalMs, progress]);

  // scaleX invece della width: la larghezza in percentuale rianimata rifà il
  // layout a ogni frame, la trasformazione resta sul thread UI.
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  const addTime = () => {
    setTotalMs((value) => value + EXTRA_SECONDS * 1000);
    setEndsAt((value) => value + EXTRA_SECONDS * 1000);
  };

  return (
    <MetalPanel radius={theme.radius.xl} style={styles.panel}>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[styles.progressBar, { backgroundColor: colors.accent }, barStyle]}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.labels}>
          <Text
            style={[styles.label, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {t("gym.rest")}
          </Text>
          <Text style={[styles.clock, { color: colors.text }]}>
            {formatClock(remaining)}
          </Text>
        </View>

        <TouchableOpacity
          onPress={addTime}
          activeOpacity={0.6}
          hitSlop={8}
          style={[styles.action, { borderColor: colors.border }]}
        >
          <Plus size={16} color={colors.text} />
          <Text style={[styles.actionLabel, { color: colors.text }]}>
            {t("gym.add_rest", { seconds: EXTRA_SECONDS })}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSkip}
          activeOpacity={0.6}
          hitSlop={8}
          style={[styles.action, { borderColor: colors.border }]}
        >
          <SkipForward size={16} color={colors.text} />
          <Text style={[styles.actionLabel, { color: colors.text }]}>
            {t("gym.skip_rest")}
          </Text>
        </TouchableOpacity>
      </View>
    </MetalPanel>
  );
};

const styles = StyleSheet.create({
  panel: { overflow: "hidden" },
  progressTrack: { height: 4, overflow: "hidden" },
  progressBar: {
    height: 4,
    width: "100%",
    transformOrigin: "left",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  labels: { flex: 1 },
  label: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  clock: { fontSize: 28, fontWeight: "700" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionLabel: { fontSize: 13, fontWeight: "600" },
});
