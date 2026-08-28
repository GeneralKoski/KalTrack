import { useAppTheme } from "@/src/components/ThemeContext";
import { targetColor } from "@/src/components/kal";
import { Text } from "@/src/components/ui";
import { targetStatus } from "@/src/domain/targets";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 168;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface CalorieRingProps {
  consumed: number;
  /** Obiettivo del giorno. Null quando non è ancora stato impostato. */
  target: number | null;
}

/**
 * Anello del consumo calorico. Il colore distingue sotto / in linea / oltre
 * l'obiettivo, ma il numero al centro è sempre stampato: il colore da solo non
 * porta mai l'informazione.
 */
export const CalorieRing: React.FC<CalorieRingProps> = ({
  consumed,
  target,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const progress = useSharedValue(0);

  const ratio = target && target > 0 ? Math.min(consumed / target, 1) : 0;

  useEffect(() => {
    progress.value = withSpring(ratio, { damping: 18, stiffness: 120 });
  }, [ratio, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const status = targetStatus(consumed, target ?? 0);
  const stroke = target ? targetColor(status, colors) : colors.textFaint;
  const remaining = target ? Math.round(target - consumed) : null;

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.surfaceMuted}
          strokeWidth={STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={stroke}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={animatedProps}
          // Parte da ore 12 invece che da ore 3.
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>

      <View style={styles.center} pointerEvents="none">
        {remaining === null ? (
          <>
            <Text style={[styles.value, { color: colors.text }]}>
              {Math.round(consumed)}
            </Text>
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              {t("diary.kcal_eaten")}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.value, { color: colors.text }]}>
              {Math.abs(remaining)}
            </Text>
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              {remaining >= 0 ? t("diary.kcal_left") : t("diary.kcal_over")}
            </Text>
            <Text style={[styles.of, { color: colors.textFaint }]}>
              {t("diary.of_target", { target })}
            </Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 38,
    fontWeight: "700",
  },
  caption: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: -2,
  },
  of: {
    fontSize: 11,
    marginTop: 3,
  },
});
