import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { buildSparkline } from "@/src/domain/stats";
import { theme } from "@/src/styles";
import React, { useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

interface TrendChartProps {
  values: number[];
  /** Quando non c'è nessuna misura nel periodo. */
  emptyLabel: string;
  /** Quando ce n'è una sola: c'è un dato, ma non basta a disegnare. */
  sparseLabel: string;
  height?: number;
  /**
   * Una linea per una grandezza che scorre (il peso), barre per un conteggio
   * che riparte da zero ogni giorno (i passi): su trenta giorni di passi la
   * linea e' un dente di sega, e le barre si leggono.
   */
  variant?: "line" | "bars";
}

/**
 * Il grafico esteso dello storico, quello che su Progressi non ci sta.
 *
 * Non e' `Sparkline` con altri numeri: quella disegna un `Svg` a
 * `width="100%"` con un `viewBox` fisso, quindi il disegno viene stirato in
 * orizzontale - accettabile per una linea alta 30 in fondo a una riga, non per
 * un grafico che deve avere pallini tondi e barre della stessa larghezza. Qui
 * la larghezza si misura e il disegno e' in pixel veri.
 */
export const TrendChart: React.FC<TrendChartProps> = ({
  values,
  emptyLabel,
  sparseLabel,
  height = 120,
  variant = "line",
}) => {
  const { colors, isDark } = useAppTheme();
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  // La linea di base sta sul metallo dell'hero: `colors.border` li' sparisce
  // in chiaro, mentre il bordo scuro e la luce alta ci sono tarati sopra.
  const axis = isDark ? colors.metalHighlight : colors.metalEdge;

  /*
    Una LINEA parte da due punti in su, ed è la stessa regola delle sparkline
    in riga su Progressi: uno solo non è una tendenza, e un pallino in mezzo a
    un riquadro alto 120 sembra un difetto dell'app - è esattamente com'è uscito
    lo storico del peso al primo avvio, con una sola pesata.

    Le BARRE invece reggono da una: una barra è una quantità, non una tendenza,
    e "un giorno, tanti passi" si legge benissimo da sola.

    Lo spazio del vuoto è ridotto: uno stato vuoto che tiene l'altezza del pieno
    è la stessa cosa che `EmptyState compact` risolve altrove.
  */
  const tooFewPoints = variant === "line" ? values.length < 2 : values.length < 1;

  if (tooFewPoints) {
    return (
      <View style={[styles.empty, { height: EMPTY_HEIGHT }]}>
        <Text style={[styles.emptyLabel, { color: colors.textFaint }]}>
          {values.length === 0 ? emptyLabel : sparseLabel}
        </Text>
      </View>
    );
  }

  // Lo spazio del disegno finisce sopra la linea di base, e rientra di
  // `INSET` ai lati: senza, il pallino dell'ultimo punto sarebbe tagliato a
  // meta' dal bordo del riquadro.
  const plotHeight = Math.max(height - AXIS_GAP, 1);
  const plotWidth = Math.max(width - INSET * 2, 1);

  return (
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {variant === "bars"
            ? renderBars(values, plotWidth, plotHeight, colors.text)
            : renderLine(values, plotWidth, plotHeight, colors.text)}
          <Line
            x1={0}
            y1={height - 1}
            x2={width}
            y2={height - 1}
            stroke={axis}
            strokeWidth={1}
          />
        </Svg>
      ) : null}
    </View>
  );
};

/** Distacco fra il disegno e la linea di base. */
const AXIS_GAP = 10;
/** Rientro laterale: ci sta il raggio del pallino finale. */
const INSET = 5;
/** Larghezza minima di una barra, sotto la quale sparirebbe. */
const MIN_BAR = 2;

/** Altezza dello stato vuoto: il vuoto non tiene lo spazio del pieno. */
const EMPTY_HEIGHT = 56;

function renderLine(
  values: number[],
  plotWidth: number,
  plotHeight: number,
  color: string,
) {
  const points = buildSparkline(values, plotWidth, plotHeight).map((p) => ({
    x: p.x + INSET,
    y: p.y,
  }));
  const last = points[points.length - 1];

  return (
    <>
      {points.length > 1 ? (
        <Path
          d={points
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
            )
            .join(" ")}
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {/* Solo l'ultimo punto porta il pallino: con trenta pesate, un pallino
          per misura diventa una collana che nasconde la linea. */}
      <Circle cx={last.x} cy={last.y} r={4} fill={color} />
    </>
  );
}

function renderBars(
  values: number[],
  plotWidth: number,
  plotHeight: number,
  color: string,
) {
  // Le barre partono da zero e non dal minimo della serie: una barra e' una
  // quantita', e tagliarne la base farebbe sembrare 9.000 passi il doppio di
  // 8.000.
  const max = Math.max(...values, 1);
  const slot = plotWidth / values.length;
  const barWidth = Math.max(slot * 0.62, MIN_BAR);

  return (
    <>
      {values.map((value, index) => {
        const barHeight = Math.max((value / max) * plotHeight, 1);
        return (
          <Rect
            key={index}
            x={INSET + index * slot + (slot - barWidth) / 2}
            y={plotHeight - barHeight}
            width={barWidth}
            height={barHeight}
            rx={Math.min(barWidth / 2, 3)}
            fill={color}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyLabel: {
    fontSize: 13,
    padding: theme.spacing.md,
  },
});
