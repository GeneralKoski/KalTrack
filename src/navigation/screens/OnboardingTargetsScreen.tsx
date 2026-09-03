import { MetalPanel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import {
  OnboardingLabel,
  OnboardingTextField,
} from "@/src/containers/onboarding/OnboardingFields";
import { getProfile, saveTargets } from "@/src/db/queries/settings";
import { latestWeight } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import { ageAt, suggestTargets, type ActivityLevel, type Goal, type Sex } from "@/src/domain/targets";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { theme } from "@/src/styles";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

const num = (text: string): number => {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const DEFAULT_STEPS_GOAL = "8000";

/**
 * Quinto passo: target giornalieri precompilati da `suggestTargets` coi dati
 * dei passi 2-4, ma modificabili prima di salvare - non solo mostrati.
 */
export function OnboardingTargetsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate, goBack } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);

  const [loading, setLoading] = useState(true);
  const [kcal, setKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [steps, setSteps] = useState(DEFAULT_STEPS_GOAL);

  useEffect(() => {
    let active = true;
    (async () => {
      const [profile, weight] = await Promise.all([getProfile(), latestWeight()]);
      if (!active) return;
      // I passi 2-4 sono obbligatori prima di arrivare qui: questi dati ci
      // sono per forza. Se per qualche motivo mancassero, i campi restano
      // vuoti e modificabili a mano, come TargetsScreen quando non può
      // calcolare.
      if (profile?.sex && profile.birthdate && profile.height_cm && profile.activity_level &&
          profile.goal && weight) {
        const suggestion = suggestTargets({
          sex: profile.sex as Sex,
          weightKg: weight.weight_kg,
          heightCm: profile.height_cm,
          age: ageAt(profile.birthdate, new Date()),
          activity: profile.activity_level as ActivityLevel,
          goal: profile.goal as Goal,
        });
        setKcal(String(suggestion.kcal));
        setProteinG(String(suggestion.proteinG));
        setCarbsG(String(suggestion.carbsG));
        setFatG(String(suggestion.fatG));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const goNext = async () => {
    await saveTargets({
      validFrom: todayIso(),
      kcal: num(kcal),
      proteinG: num(proteinG),
      carbsG: num(carbsG),
      fatG: num(fatG),
      steps: num(steps),
    });
    await advanceTo("OnboardingTheme");
    navigate("OnboardingTheme");
  };

  return (
    <OnboardingShell
      step="OnboardingTargets"
      onBack={goBack}
      primaryLabel={t("onboarding.next")}
      onPrimary={() => void goNext()}
      primaryDisabled={loading}
    >
      <OnboardingTitle>{t("onboarding.targets_title")}</OnboardingTitle>

      <MetalPanel radius={theme.radius.xl} style={styles.explain}>
        <View style={styles.explainInner}>
          <Text style={[styles.explainText, { color: colors.textSecondary }]}>
            {t("onboarding.targets_body")}
          </Text>
        </View>
      </MetalPanel>

      <OnboardingLabel>{t("targets.kcal")}</OnboardingLabel>
      <OnboardingTextField value={kcal} onChangeText={setKcal} />

      <View style={styles.macros}>
        <View style={styles.macro}>
          <OnboardingLabel>{t("diary.protein_short")}</OnboardingLabel>
          <OnboardingTextField value={proteinG} onChangeText={setProteinG} />
        </View>
        <View style={styles.macro}>
          <OnboardingLabel>{t("diary.carbs_short")}</OnboardingLabel>
          <OnboardingTextField value={carbsG} onChangeText={setCarbsG} />
        </View>
        <View style={styles.macro}>
          <OnboardingLabel>{t("diary.fat_short")}</OnboardingLabel>
          <OnboardingTextField value={fatG} onChangeText={setFatG} />
        </View>
      </View>

      <OnboardingLabel>{t("targets.steps")}</OnboardingLabel>
      <OnboardingTextField value={steps} onChangeText={setSteps} />
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  explain: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  explainInner: { padding: theme.spacing.md },
  explainText: { fontSize: 13, lineHeight: 19 },
  macros: { flexDirection: "row", gap: theme.spacing.sm },
  macro: { flex: 1 },
});
