import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import {
  OnboardingLabel,
  OnboardingTextField,
} from "@/src/containers/onboarding/OnboardingFields";
import { latestWeight, setWeight } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import React, { useEffect, useState } from "react";

/**
 * Terzo passo: il peso di oggi. Serve al calcolo dei target del passo 5, non
 * solo a popolare `Misure`.
 */
export function OnboardingWeightScreen() {
  const { t } = useTranslation();
  const { navigate, goBack } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);

  const [loading, setLoading] = useState(true);
  const [weightKg, setWeightKg] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const weight = await latestWeight();
      if (!active) return;
      if (weight) setWeightKg(String(weight.weight_kg));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const value = Number(weightKg.replace(",", "."));
  const canProceed = Number.isFinite(value) && value > 0;

  const goNext = async () => {
    await setWeight(todayIso(), value);
    await advanceTo("OnboardingActivityGoal");
    navigate("OnboardingActivityGoal");
  };

  return (
    <OnboardingShell
      step="OnboardingWeight"
      onBack={goBack}
      primaryLabel={t("onboarding.next")}
      onPrimary={() => void goNext()}
      primaryDisabled={loading || !canProceed}
    >
      <OnboardingTitle>{t("onboarding.weight_title")}</OnboardingTitle>
      <OnboardingLabel>{t("tracking.weight")}</OnboardingLabel>
      <OnboardingTextField
        value={weightKg}
        onChangeText={setWeightKg}
        placeholder={t("onboarding.weight_placeholder")}
      />
    </OnboardingShell>
  );
}
