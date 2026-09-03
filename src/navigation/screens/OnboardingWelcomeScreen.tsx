import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import { AccountForm } from "@/src/containers/social/AccountForm";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAccountStore } from "@/src/stores/accountStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { theme } from "@/src/styles";
import React, { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";

/**
 * Primo passo: benvenuto, con accesso/registrazione o "Salta per ora" di pari
 * dignità. `CLAUDE.md` § Primo avvio: l'account serve alla sincronizzazione e
 * agli amici, non a mangiare, quindi qui non può essere un ostacolo.
 */
export function OnboardingWelcomeScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);
  const token = useAccountStore((s) => s.token);
  const hadToken = useRef(token !== null);

  const goNext = () => {
    void advanceTo("OnboardingProfileBasics");
    navigate("OnboardingProfileBasics");
  };

  useEffect(() => {
    // Solo la TRANSIZIONE a "accesso riuscito" avanza da sola: se il token
    // c'era già all'apertura (si rientra nel flusso dopo un abbandono), un
    // passo avanti non richiesto sorprenderebbe chi sta ancora leggendo.
    if (!hadToken.current && token !== null) goNext();
    hadToken.current = token !== null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <OnboardingShell
      step="OnboardingWelcome"
      primaryLabel={t("onboarding.skip")}
      primaryVariant="outlined"
      onPrimary={goNext}
    >
      <OnboardingTitle>{t("onboarding.welcome_title")}</OnboardingTitle>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {t("onboarding.welcome_body")}
      </Text>
      <AccountForm />
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20, marginBottom: theme.spacing.lg },
});
