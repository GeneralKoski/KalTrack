import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import { ThemePicker } from "@/src/containers/settings/ThemePicker";
import { resetToTabs, useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import React from "react";

/** Sesto e ultimo passo: aspetto, poi via su Oggi. */
export function OnboardingThemeScreen() {
  const { t } = useTranslation();
  const { goBack } = useAppNav();
  const complete = useOnboardingStore((s) => s.complete);

  const finish = async () => {
    await complete();
    resetToTabs();
  };

  return (
    <OnboardingShell
      step="OnboardingTheme"
      onBack={goBack}
      primaryLabel={t("onboarding.finish")}
      onPrimary={() => void finish()}
    >
      <OnboardingTitle>{t("onboarding.theme_title")}</OnboardingTitle>
      <ThemePicker />
    </OnboardingShell>
  );
}
