import { theme } from "@/src/styles";
import React, { type ReactNode } from "react";
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from "react-native";

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

// Card bianca arrotondata con ombra leggera (base di tutte le liste).
// Lo stile (incluso flexDirection) è applicato sempre a una View interna, così
// resta valido anche quando la card è premibile.
export const Card: React.FC<CardProps> = ({ children, onPress, style }) => {
  const content = <View style={[styles.card, style]}>{children}</View>;

  if (onPress) {
    // TouchableOpacity (non Pressable con style-as-function): NativeWind v4 non
    // applica lo style-funzione sui Pressable, lasciando la card senza feedback.
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.6}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
});
