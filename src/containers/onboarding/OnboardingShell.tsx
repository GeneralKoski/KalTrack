import { ScreenBackground } from "@/src/components/kal";
import { FormScreen } from "@/src/components/FormScreen";
import { DfButton } from "@/src/components/form/DfButton";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { ONBOARDING_STEPS } from "@/src/domain/onboarding";
import { theme } from "@/src/styles";
import { ChevronLeft } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * L'involucro comune a ogni schermo del wizard: sfondo, indietro, puntini di
 * avanzamento, corpo scrollabile, pulsante primario in fondo.
 *
 * Tenerlo qui invece che dentro ogni schermo evita che i sei passi divergano
 * di qualche pixel l'uno dall'altro, come fa già `SettingsPage` per le
 * impostazioni.
 */
export const OnboardingShell: React.FC<{
  step: (typeof ONBOARDING_STEPS)[number];
  onBack?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  primaryVariant?: "filled" | "outlined";
  children: React.ReactNode;
}> = ({
  step,
  onBack,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  primaryVariant,
  children,
}) => {
  const { colors } = useAppTheme();
  const stepIndex = ONBOARDING_STEPS.indexOf(step);

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.safe}>
        <View style={styles.header}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} activeOpacity={0.6} hitSlop={10}>
              <ChevronLeft size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <View style={styles.dots}>
            {ONBOARDING_STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index <= stepIndex ? colors.accent : colors.border,
                  },
                ]}
              />
            ))}
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <FormScreen contentContainerStyle={styles.content}>{children}</FormScreen>

        <View style={styles.footer}>
          <DfButton
            label={primaryLabel}
            onPress={onPrimary}
            disabled={primaryDisabled}
            loading={primaryLoading}
            variant={primaryVariant}
            fullWidth
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

/** Titolo del passo: stessa dimensione ovunque, ma non fa parte dello shell
 *  perché ogni schermo ha il proprio testo di apertura, non solo un titolo. */
export const OnboardingTitle: React.FC<{ children: string }> = ({ children }) => {
  const { colors } = useAppTheme();
  return <Text style={[styles.title, { color: colors.text }]}>{children}</Text>;
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  headerSpacer: { width: 26 },
  dots: { flexDirection: "row", gap: theme.spacing.xs },
  dot: { width: 8, height: 8, borderRadius: theme.radius.full },
  content: { flexGrow: 1, padding: theme.spacing.md },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: theme.spacing.lg,
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
});
