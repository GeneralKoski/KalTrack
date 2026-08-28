import { useAppTheme } from "@/src/components/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet } from "react-native";

// I token del gradiente sono due (bordo e centro) ma gli stop sono cinque:
// quelli intermedi si ricavano interpolando, così la curva resta quella
// disegnata in chiaro invece di diventare una rampa lineare.
function mix(from: string, to: string, ratio: number): string {
  const channel = (index: number) => {
    const start = parseInt(from.slice(1 + index * 2, 3 + index * 2), 16);
    const end = parseInt(to.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(start + (end - start) * ratio)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

// Sfondo delle schermate: più chiaro al centro, leggermente verde ai bordi
// (tinta del brand). Va inserito come PRIMO figlio del contenitore radice
// della schermata: è un absolute-fill, non un wrapper con figli.
export const ScreenBackground: React.FC = () => {
  const { colors } = useAppTheme();
  const edge = colors.gradientEdge;
  const center = colors.gradientCenter;
  const mid = mix(edge, center, 0.75);

  return (
    <LinearGradient
      colors={[edge, mid, center, mid, edge]}
      locations={[0, 0.32, 0.5, 0.68, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
};
