import { useAppTheme } from "@/src/components/ThemeContext";
import { theme } from "@/src/styles";
import React, { type ReactNode } from "react";
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Card arrotondata con ombra leggera, base di tutte le liste.
 *
 * Premibile o no, lo stile finisce sempre sull'elemento PIU' ESTERNO. Con una
 * View interna che se lo prendeva, un margine o un flexGrow passati a una card
 * premibile non arrivavano mai al touchable, e la stessa card si comportava in
 * due modi diversi a seconda che avesse onPress o no.
 */
export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  onLongPress,
  style,
}) => {
  const { colors, isDark } = useAppTheme();
  const cardStyle = [
    styles.card,
    { backgroundColor: colors.surface },
    // Al buio l'ombra non si vede: senza bordo la card sparirebbe nello sfondo.
    isDark && {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    style,
  ];

  if (onPress || onLongPress) {
    // TouchableOpacity (non Pressable con style-as-function): NativeWind v4 non
    // applica lo style-funzione sui Pressable, lasciando la card senza feedback.
    return (
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.6}
        style={cardStyle}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
});
