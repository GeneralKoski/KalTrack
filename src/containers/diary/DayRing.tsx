import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { macroSlices, type Nutrients } from "@/src/domain/nutrition";
import { MacroArc } from "@/src/containers/diary/MacroArc";
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

const SIZE = 34;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;

interface DayRingProps {
  /** Il numero del giorno, stampato al centro. */
  day: number;
  /** Null quando quel giorno non e' stato registrato niente. */
  consumed: Nutrients | null;
  target: number | null;
  selected?: boolean;
  today?: boolean;
  /** Fuori dai limiti di navigazione, o fuori dal mese mostrato. */
  disabled?: boolean;
}

/**
 * Il giorno del calendario come un anello che si riempie.
 *
 * E' lo stesso linguaggio dell'anello grande della home, in piccolo: diviso per
 * macronutriente, con gli stessi colori e la stessa funzione che decide dove
 * finisce un pezzo e comincia l'altro (`macroSlices`, `MacroArc`), cosi' i due
 * non possono divergere.
 *
 * Qui pero' gli anelli non si animano: in una schermata ce ne sono trentuno, e
 * trentun animazioni insieme sarebbero rumore invece che feedback.
 *
 * IL NUMERO DEL GIORNO E' SEMPRE STAMPATO. Il colore aggiunge, non sostituisce:
 * un calendario in cui l'unica informazione e' la tinta e' illeggibile a chi
 * non distingue il rosso dal verde.
 *
 * Un giorno senza niente registrato ha l'anello vuoto e non un anello a zero:
 * "non ho scritto" e "non ho mangiato" sono fatti diversi, e un giorno futuro
 * e' sempre il primo dei due.
 */
export const DayRing: React.FC<DayRingProps> = ({
  day,
  consumed,
  target,
  selected = false,
  today = false,
  disabled = false,
}) => {
  const { colors } = useAppTheme();

  const slices = consumed ? macroSlices(consumed, target) : [];

  const testo = disabled
    ? colors.textFaint
    : selected
      ? colors.accent
      : colors.text;

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        {/*
          Il giorno scelto si riconosce dal riempimento tenue e dal numero in
          evidenza, non da un anello colorato: l'anello e' gia' occupato a dire
          come e' andata la giornata, e sovrascriverlo con la selezione toglie
          l'unica informazione che quel cerchio porta.
        */}
        {selected ? (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill={colors.surfaceMuted}
          />
        ) : null}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.surfaceMuted}
          strokeWidth={STROKE}
          fill="none"
        />
        <MacroArc slices={slices} size={SIZE} stroke={STROKE} />
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text
          style={[
            styles.day,
            { color: testo, fontWeight: today || selected ? "700" : "500" },
          ]}
        >
          {day}
        </Text>
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
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  day: { fontSize: 13 },
});
