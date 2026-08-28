import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { buildSparkline } from "@/src/domain/stats";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

interface SparklineProps {
  values: number[];
  emptyLabel: string;
  height?: number;
  width?: number;
}

/**
 * Grafico a linea minimale. Regge sia due punti sia trenta: con un solo punto
 * disegna un pallino invece di una linea che non esiste.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  values,
  emptyLabel,
  height = 90,
  width = 300,
}) => {
  const { colors } = useAppTheme();
  const points = buildSparkline(values, width, height);

  if (points.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={[styles.emptyLabel, { color: colors.textFaint }]}>
          {emptyLabel}
        </Text>
      </View>
    );
  }

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {points.length > 1 ? (
        <Path
          d={path}
          stroke={colors.accent}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.accent} />
      ))}
    </Svg>
  );
};

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyLabel: {
    fontSize: 13,
    padding: theme.spacing.md,
  },
});
