import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft } from "lucide-react-native";
import React, { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface GradientHeaderProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  // Elemento a sinistra del titolo (es. avatar utente nella Home).
  left?: ReactNode;
  right?: ReactNode;
  // Righe massime del titolo (default 1). >1 per nomi lunghi che non devono
  // troncarsi (es. dettaglio nave "MEGA EXPRESS 2").
  titleLines?: number;
  // Dimensione font del titolo (default 26). Ridotta per titoli lunghi.
  titleSize?: number;
  // Contenuto extra sotto il titolo (es. barra di ricerca).
  children?: ReactNode;
}

// Header metallizzato comune a tutte le schermate: una lastra illuminata
// dall'alto, non piu' un gradiente di brand.
export const GradientHeader: React.FC<GradientHeaderProps> = ({
  kicker,
  title,
  subtitle,
  onBack,
  left,
  right,
  titleLines = 1,
  titleSize,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();

  return (
    <LinearGradient
      // Metallo: sul chiaro e' argento, sullo scuro grafite. Il contenuto sopra
      // non puo' quindi essere bianco fisso, usa i colori di testo del tema.
      colors={[colors.metalTop, colors.metalBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.container,
        { paddingTop: insets.top + 8, borderBottomColor: colors.metalEdge },
      ]}
    >
      <View style={styles.row}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
        )}
        {left && <View style={styles.left}>{left}</View>}
        <View style={styles.titleBlock}>
          {kicker && (
            <Text style={[styles.kicker, { color: colors.textMuted }]}>
              {kicker}
            </Text>
          )}
          <Text
            style={[
              styles.title,
              { color: colors.text },
              titleSize
                ? { fontSize: titleSize, lineHeight: titleSize + 4 }
                : null,
            ]}
            numberOfLines={titleLines}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={[styles.subtitle, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
        {right && <View style={styles.right}>{right}</View>}
      </View>
      {children}
    </LinearGradient>
  );
};

// Bottone circolare per le azioni nell'header (es. filtri).
export const HeaderCircleButton: React.FC<{
  onPress: () => void;
  children: ReactNode;
}> = ({ onPress, children }) => {
  const [active, setActive] = useState(false);
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setActive(true)}
      onPressOut={() => setActive(false)}
      style={[
        styles.circleBtn,
        active && { backgroundColor: colors.surfaceMuted },
      ]}
      hitSlop={8}
    >
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  backBtn: {
    marginRight: theme.spacing.sm,
    alignSelf: "center",
  },
  left: {
    marginRight: theme.spacing.md,
    // Centrato in altezza rispetto al blocco titolo (la row è flex-start).
    alignSelf: "center",
  },
  titleBlock: {
    flex: 1,
  },
  kicker: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 17,
    marginTop: 0,
  },
  right: {
    marginLeft: theme.spacing.sm,
    // Centrato in altezza rispetto al blocco titolo (la row è flex-start).
    alignSelf: "center",
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
