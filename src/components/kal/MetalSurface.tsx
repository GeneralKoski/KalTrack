import { useAppTheme } from "@/src/components/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import React, { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

interface MetalSurfaceProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Raggio degli angoli: serve anche al gradiente, che va ritagliato. */
  radius?: number;
  /** Superficie premuta: gradiente invertito, come un tasto che rientra. */
  pressed?: boolean;
}

/**
 * Superficie metallizzata: gradiente verticale più una linea di luce sul bordo
 * superiore, come una lastra illuminata dall'alto. È l'unico posto che sa come
 * si "fa il metallo": pulsanti, FAB e riquadri lo riusano invece di ricostruire
 * il gradiente ognuno per conto proprio.
 */
export const MetalSurface: React.FC<MetalSurfaceProps> = ({
  children,
  style,
  radius = 0,
  pressed = false,
}) => {
  const { colors } = useAppTheme();

  return (
    <LinearGradient
      colors={
        pressed
          ? [colors.metalBottom, colors.metalTop]
          : [colors.metalTop, colors.metalBottom]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.base,
        {
          borderRadius: radius,
          borderTopColor: colors.metalHighlight,
          borderBottomColor: colors.metalEdge,
        },
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
};

/**
 * Variante non premibile per riquadri statici: stesso metallo ma senza la
 * differenza di bordo, che su una superficie non interattiva sarebbe rumore.
 */
export const MetalPanel: React.FC<{
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}> = ({ children, style, radius = 0 }) => {
  const { colors } = useAppTheme();

  return (
    <View style={[{ borderRadius: radius, overflow: "hidden" }, style]}>
      <LinearGradient
        colors={[colors.metalTop, colors.metalBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          StyleSheet.absoluteFill,
          { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.metalEdge },
        ]}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
