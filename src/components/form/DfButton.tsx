import { MetalSurface } from "@/src/components/kal/MetalSurface";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import React from "react";
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  TextStyle,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

interface DfButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "filled" | "outlined" | "ghost";
  /**
   * Colore esplicito, da usare solo quando porta un significato: un'azione
   * distruttiva in rosso, per esempio. Omesso, il pulsante pieno è metallizzato
   * e quello a contorno usa il colore interattivo del tema.
   */
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: TextStyle;
  fullWidth?: boolean;
}

export const DfButton = ({
  label,
  onPress,
  variant = "filled",
  color: colorProp,
  loading = false,
  disabled = false,
  icon,
  style,
  labelStyle,
  fullWidth = true,
}: DfButtonProps) => {
  const { colors } = useAppTheme();
  const isFilled = variant === "filled";
  const isOutlined = variant === "outlined";

  // Senza colore esplicito l'interattivo lo detta il tema.
  const color = colorProp ?? colors.accent;
  // Un pieno metallizzato ha sopra il testo normale; un pieno colorato (rosso
  // di un'eliminazione) ha bisogno del contrasto opposto.
  const isMetal = isFilled && !colorProp;
  const filledLabelColor = isMetal ? colors.text : colors.accentOn;

  const handlePress = () => {
    Keyboard.dismiss();
    onPress?.();
  };

  const content = loading ? (
    <ActivityIndicator
      size="small"
      color={isFilled ? filledLabelColor : color}
    />
  ) : (
    <>
      {icon}
      {/* L'etichetta di un bottone non va mai a capo: "Annulla" spezzato in
          "Annull" e "a" e' sempre un difetto, mai una scelta. Se il testo non
          ci sta, il bottone va allargato, non il testo mandato a capo. */}
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          {
            color: disabled
              ? colors.textFaint
              : isFilled
                ? filledLabelColor
                : color,
          },
          labelStyle,
        ]}
      >
        {label}
      </Text>
    </>
  );

  // TouchableOpacity e non Pressable con style-funzione: con NativeWind v4 lo
  // style-funzione non viene applicato e il tap resta senza feedback.
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.6}
      style={[fullWidth && styles.fullWidth, style]}
    >
      {isMetal && !disabled ? (
        <MetalSurface style={styles.base} radius={theme.radius.xl}>
          {content}
        </MetalSurface>
      ) : (
        <View
          style={[
            styles.base,
            { borderRadius: theme.radius.xl },
            isFilled && {
              backgroundColor: disabled ? colors.surfaceMuted : color,
            },
            isOutlined && {
              borderWidth: 1.5,
              borderColor: disabled ? colors.border : color,
            },
          ]}
        >
          {content}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  fullWidth: {
    alignSelf: "stretch",
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
});
