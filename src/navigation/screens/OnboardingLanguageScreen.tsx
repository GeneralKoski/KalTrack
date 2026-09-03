import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import { LanguagePicker } from "@/src/containers/settings/LanguagePicker";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import React from "react";

/**
 * Primo passo di tutti: la lingua. Va prima di "Benvenuto" perché quella
 * schermata (e tutte le altre) devono già uscire nella lingua giusta - non
 * ha senso rilevarla a metà wizard.
 */
export function OnboardingLanguageScreen() {
  const { t } = useTranslation();
  const { navigate } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);

  const goNext = async () => {
    await advanceTo("OnboardingWelcome");
    navigate("OnboardingWelcome");
  };

  return (
    <OnboardingShell
      step="OnboardingLanguage"
      primaryLabel={t("onboarding.next")}
      onPrimary={() => void goNext()}
    >
      <OnboardingTitle>{t("onboarding.language_title")}</OnboardingTitle>
      <LanguagePicker />
    </OnboardingShell>
  );
}
