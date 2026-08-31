import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { hexToRgba } from "@/src/utils/utils";
import { Square } from "lucide-react-native";
import React, { useEffect } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

interface VoiceOrbProps {
  /** Livello del microfono 0..1, o null dove la piattaforma non lo misura. */
  level: number | null;
  onPress: () => void;
}

/** Il diametro del nucleo: il bersaglio da toccare per fermarsi. */
const CORE = 108;
/**
 * Quanto stanno larghi gli aloni a silenzio, e quanto crescono a volume pieno.
 *
 * La base non è 1: con gli aloni della misura esatta del nucleo, a microfono
 * fermo si vedeva un cerchio pieno e basta - i tre cerchi erano sovrapposti e
 * la palla sembrava un disegno, non qualcosa che sta ascoltando. Larghi di
 * partenza, la forma si legge anche in silenzio e la voce la allarga.
 */
const HALO_BASE = { outer: 1.42, middle: 1.2 };
const HALO_GROWTH = 0.55;
/**
 * Poco più del polling del metering (100 ms): l'animazione arriva a
 * destinazione appena prima della misura successiva, quindi la palla segue la
 * voce invece di inseguirla a scatti o di fermarsi fra una misura e l'altra.
 */
const FOLLOW_MS = 120;

/**
 * La palla che si muove mentre si parla.
 *
 * Serve a dire una cosa sola: il microfono ti sta sentendo. Un cerchio fermo e
 * la scritta "sto ascoltando" lo dicono soltanto, e chi non è sicuro che il
 * microfono funzioni continua a non esserlo.
 *
 * Il livello è il volume vero (`metering` di expo-audio), non un'animazione a
 * caso. Dove il metering non c'è, `level` è null e la palla respira da sola: è
 * meno informativo ma resta onesto - non finge un volume che nessuno ha
 * misurato.
 *
 * La palla è ANCHE il bottone per fermarsi: è l'unica cosa in movimento a
 * schermo, e mettere lo stop altrove vorrebbe dire guardare da un'altra parte.
 */
export const VoiceOrb: React.FC<VoiceOrbProps> = ({ level, onPress }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const amplitude = useSharedValue(0);
  const breathing = useSharedValue(0);

  useEffect(() => {
    if (level === null) return;
    amplitude.value = withTiming(level, {
      duration: FOLLOW_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [level, amplitude]);

  useEffect(() => {
    if (level !== null) {
      breathing.value = 0;
      return;
    }
    breathing.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [level, breathing]);

  /*
   * Tre animazioni con la stessa sorgente e ampiezze diverse: l'alone esterno
   * si muove tanto, quello di mezzo meno, il nucleo appena - è quello che dà
   * l'impressione della profondità invece di un cerchio che si gonfia.
   *
   * `useAnimatedStyle` va chiamato tre volte per esteso e non da un aiutante:
   * un aiutante che chiama un hook è un hook, e le regole valgono lo stesso.
   */
  const energy = () => {
    "worklet";
    return level === null ? breathing.value : amplitude.value;
  };

  const outer = useAnimatedStyle(() => ({
    transform: [{ scale: HALO_BASE.outer + energy() * HALO_GROWTH }],
    opacity: 0.5 * (0.45 + energy() * 0.55),
  }));

  const middle = useAnimatedStyle(() => ({
    transform: [{ scale: HALO_BASE.middle + energy() * HALO_GROWTH * 0.6 }],
    opacity: 0.8 * (0.45 + energy() * 0.55),
  }));

  const core = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + energy() * 0.12 }],
  }));

  return (
    <View style={styles.root}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.6}
        accessibilityLabel={t("assistant.stop")}
      >
        <View style={styles.stage}>
          <Animated.View
            style={[
              styles.circle,
              outer,
              { backgroundColor: hexToRgba(colors.accent, 0.16) },
            ]}
          />
          <Animated.View
            style={[
              styles.circle,
              middle,
              { backgroundColor: hexToRgba(colors.accent, 0.24) },
            ]}
          />
          <Animated.View
            style={[
              styles.circle,
              core,
              { backgroundColor: colors.accent },
            ]}
          >
            <Square
              size={30}
              color={colors.accentOn}
              fill={colors.accentOn}
            />
          </Animated.View>
        </View>
      </TouchableOpacity>

      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("assistant.tap_to_stop")}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { alignItems: "center", gap: theme.spacing.md },
  stage: {
    width: CORE * 2,
    height: CORE * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    position: "absolute",
    width: CORE,
    height: CORE,
    borderRadius: CORE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { fontSize: 13 },
});
