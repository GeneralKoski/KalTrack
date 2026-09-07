import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import { LanguagePicker } from "@/src/containers/settings/LanguagePicker";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { theme } from "@/src/styles";
import React from "react";
import { StyleSheet } from "react-native";

/**
 * Primo passo: chi siamo e in che lingua.
 *
 * Erano due schermate, e la prima non diceva niente: un elenco di due lingue e
 * un "Avanti". La lingua sta ancora prima di tutto - il resto del wizard deve
 * uscire in quella giusta - ma sta insieme al benvenuto, e sceglierla riscrive
 * il testo sopra all'istante, che e' anche il modo piu' chiaro di far vedere
 * che la scelta ha avuto effetto.
 *
 * L'account NON e' piu' qui. Era il secondo passo: un modulo di registrazione
 * prima ancora di aver visto l'app, con "Salta per ora" come bottone piu'
 * lontano dello schermo. Ora e' l'ultimo (`OnboardingAccountScreen`).
 */
export function OnboardingWelcomeScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);

  const goNext = () => {
    void advanceTo("OnboardingProfile");
    navigate("OnboardingProfile");
  };

  return (
    <OnboardingShell
      step="OnboardingWelcome"
      primaryLabel={t("onboarding.next")}
      onPrimary={goNext}
    >
      <OnboardingTitle>{t("onboarding.welcome_title")}</OnboardingTitle>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {t("onboarding.welcome_body")}
      </Text>
      <LanguagePicker />
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20, marginBottom: theme.spacing.lg },
});
