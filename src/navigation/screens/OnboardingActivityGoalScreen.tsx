import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import { OnboardingPicker } from "@/src/containers/onboarding/OnboardingFields";
import { getProfile, saveProfile } from "@/src/db/queries/settings";
import { ACTIVITY_FACTORS, type ActivityLevel, type Goal, type Sex } from "@/src/domain/targets";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import React, { useEffect, useState } from "react";

const ACTIVITIES = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];
const GOALS: Goal[] = ["cut", "maintain", "bulk"];

/**
 * Quarto passo: livello di attività e obiettivo. Riscrive il profilo intero
 * (sesso/data/altezza inclusi, letti dal passo 2) per lo stesso motivo di
 * `OnboardingProfileBasicsScreen`: `saveProfile` è un upsert su riga unica.
 */
export function OnboardingActivityGoalScreen() {
  const { t } = useTranslation();
  const { navigate, goBack } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);

  const [loading, setLoading] = useState(true);
  const [sex, setSex] = useState<Sex>("male");
  const [birthdate, setBirthdate] = useState("");
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("maintain");

  useEffect(() => {
    let active = true;
    (async () => {
      const profile = await getProfile();
      if (!active) return;
      if (profile) {
        if (profile.sex) setSex(profile.sex as Sex);
        setBirthdate(profile.birthdate ?? "");
        setHeightCm(profile.height_cm ?? null);
        if (profile.activity_level) setActivity(profile.activity_level as ActivityLevel);
        if (profile.goal) setGoal(profile.goal as Goal);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const goNext = async () => {
    await saveProfile({ sex, birthdate, heightCm, activityLevel: activity, goal });
    await advanceTo("OnboardingTargets");
    navigate("OnboardingTargets");
  };

  return (
    <OnboardingShell
      step="OnboardingActivityGoal"
      onBack={goBack}
      primaryLabel={t("onboarding.next")}
      onPrimary={() => void goNext()}
      primaryDisabled={loading}
    >
      <OnboardingTitle>{t("onboarding.activity_goal_title")}</OnboardingTitle>

      <OnboardingPicker
        label={t("targets.activity")}
        title={t("targets.activity")}
        values={ACTIVITIES}
        selected={activity}
        labelKey="targets.activity_value"
        onSelect={setActivity}
      />

      <OnboardingPicker
        label={t("targets.goal")}
        title={t("targets.goal")}
        values={GOALS}
        selected={goal}
        labelKey="targets.goal_value"
        onSelect={setGoal}
      />
    </OnboardingShell>
  );
}
