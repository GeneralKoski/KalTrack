import { useAppTheme } from "@/src/components/ThemeContext";
import type { MacroSlice } from "@/src/domain/nutrition";
import { theme } from "@/src/styles";
import React from "react";
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from "react-native-reanimated";
import { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface MacroArcProps {
  slices: MacroSlice[];
  size: number;
  stroke: number;
  /**
   * Da 0 a 1, quanto dell'anello e' gia' comparso. Assente, i pezzi si
   * disegnano fermi: nel calendario ci sono trentun anelli in una schermata e
   * trentun animazioni insieme sarebbero rumore, non feedback.
   */
  progress?: SharedValue<number>;
}

/**
 * I pezzi colorati dell'anello delle calorie, uno per macronutriente.
 *
 * Sta qui e non dentro `CalorieRing` perche' lo usano in due - l'anello grande
 * della home e i cerchietti del calendario - e due copie divergerebbero al
 * primo ritocco: il giorno in cui i colori non corrispondessero piu', il
 * calendario direbbe una cosa e la schermata del giorno un'altra.
 *
 * Il colore identifica il macro ed e' lo stesso token delle barre e dei
 * grafici (`theme.colors.macro`). Il grigio non e' un quarto macro: e' la
 * parte di calorie che i macro non spiegano.
 *
 * Ogni pezzo e' un cerchio intero con un solo tratto visibile
 * (`strokeDasharray`), ruotato di quanto lo precede. Un `<Path>` per pezzo
 * sarebbe piu' diretto da leggere ma andrebbe ricalcolato in seno e coseno a
 * ogni render.
 */
export const MacroArc: React.FC<MacroArcProps> = ({
  slices,
  size,
  stroke,
  progress,
}) => {
  const { colors } = useAppTheme();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const colore: Record<MacroSlice["kind"], string> = {
    protein: theme.colors.macro.protein,
    carbs: theme.colors.macro.carbs,
    fat: theme.colors.macro.fat,
    other: colors.textFaint,
  };

  let start = 0;

  return (
    <>
      {slices.map((slice) => {
        const from = start;
        start += slice.fraction;

        return (
          <Slice
            key={slice.kind}
            color={colore[slice.kind]}
            from={from}
            length={slice.fraction}
            size={size}
            stroke={stroke}
            radius={radius}
            circumference={circumference}
            progress={progress}
          />
        );
      })}
    </>
  );
};

/**
 * Un pezzo solo.
 *
 * E' un componente a se' perche' l'hook dell'animazione non si puo' chiamare
 * dentro un `map`. Quando l'anello si riempie, i pezzi compaiono in ordine:
 * ognuno mostra la parte di se' che il riempimento ha gia' raggiunto, quindi
 * il secondo non parte finche' il primo non e' finito.
 */
const Slice: React.FC<{
  color: string;
  from: number;
  length: number;
  size: number;
  stroke: number;
  radius: number;
  circumference: number;
  progress?: SharedValue<number>;
}> = ({
  color,
  from,
  length,
  size,
  stroke,
  radius,
  circumference,
  progress,
}) => {
  const animatedProps = useAnimatedProps(() => {
    const visibile = progress
      ? Math.min(Math.max(progress.value - from, 0), length)
      : length;
    const tratto = circumference * visibile;
    return { strokeDasharray: [tratto, circumference - tratto] };
  });

  const comune = {
    cx: size / 2,
    cy: size / 2,
    r: radius,
    stroke: color,
    strokeWidth: stroke,
    fill: "none",
    // Parte da ore 12 invece che da ore 3, come l'anello intero.
    transform: `rotate(${-90 + from * 360} ${size / 2} ${size / 2})`,
  };

  if (!progress) {
    const tratto = circumference * length;
    return (
      <Circle
        {...comune}
        strokeDasharray={`${tratto} ${circumference - tratto}`}
      />
    );
  }

  return <AnimatedCircle {...comune} animatedProps={animatedProps} />;
};
