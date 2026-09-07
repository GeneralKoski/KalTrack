import { MetalPanel } from "@/src/components/kal/MetalSurface";
import { useAppTheme } from "@/src/components/ThemeContext";
import { theme } from "@/src/styles";
import React, { type ReactNode } from "react";
import {
  StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";

/**
 * Il primo dei tre livelli di superficie: UNO per schermata.
 *
 * E' la risposta alla domanda della schermata - le calorie di oggi, il coach
 * della settimana, la scheda che si sta seguendo, chi sei. Tutto il resto sta
 * in un blocco (`ListGroup`) o nudo sullo sfondo.
 *
 * E' l'unico posto dove il metallo di `MetalSurface` si vede davvero: prima
 * viveva solo nel FAB da 56 px, quindi il carattere dichiarato in `styles.ts`
 * era implementato e poi non applicato a niente di visibile.
 *
 * Uno per schermata non e' un'indicazione di stile: due superfici chiare sulla
 * stessa pagina si contendono l'occhio e nessuna delle due indica piu' niente.
 */
export const HeroPanel: React.FC<{
  children: ReactNode;
  /** Toglie il padding: per un hero che contiene righe fino al bordo. */
  flush?: boolean;
  /** Stile del riquadro (margini, larghezza). */
  style?: StyleProp<ViewStyle>;
  /** Stile del contenuto dentro il padding: qui vanno `gap` e allineamenti. */
  contentStyle?: StyleProp<ViewStyle>;
}> = ({ children, flush = false, style, contentStyle }) => {
  const { colors } = useAppTheme();

  return (
    <MetalPanel radius={theme.radius.xl} style={style}>
      {/* La linea di luce sul bordo alto: e' quel che fa leggere la superficie
          come una lastra illuminata dall'alto invece che come un rettangolo
          grigio. `MetalPanel` da solo porta il gradiente e il bordo scuro. */}
      <View
        style={[styles.highlight, { backgroundColor: colors.metalHighlight }]}
        pointerEvents="none"
      />
      <View style={[flush ? undefined : styles.body, contentStyle]}>
        {children}
      </View>
    </MetalPanel>
  );
};

/**
 * Separatore interno all'hero.
 *
 * Non usa `colors.border`: quello e' tarato sullo sfondo delle schermate e
 * sulla superficie scura, mentre qui sta sopra il metallo - dove sparisce in
 * chiaro e stacca troppo in scuro. Una velatura bianca funziona su entrambi.
 */
export const HeroDivider: React.FC<{ style?: StyleProp<ViewStyle> }> = ({
  style,
}) => {
  const { isDark } = useAppTheme();
  return (
    <View
      style={[
        styles.divider,
        {
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(0, 0, 0, 0.08)",
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  highlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  body: {
    padding: theme.spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
