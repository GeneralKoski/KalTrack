import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import { ThemePicker } from "@/src/containers/settings/ThemePicker";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import React from "react";

/** Terzo passo: l'aspetto. Chiude il wizard il passo dopo, l'account. */
export function OnboardingThemeScreen() {
  const { t } = useTranslation();
  const { navigate, goBack } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);

  const goNext = async () => {
    await advanceTo("OnboardingAccount");
    navigate("OnboardingAccount");
  };

  return (
    <OnboardingShell
      step="OnboardingTheme"
      onBack={goBack}
      primaryLabel={t("onboarding.next")}
      onPrimary={() => void goNext()}
    >
      <OnboardingTitle>{t("onboarding.theme_title")}</OnboardingTitle>
      <ThemePicker />
    </OnboardingShell>
  );
}
