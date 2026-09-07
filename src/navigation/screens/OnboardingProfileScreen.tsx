import { HeroPanel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  OnboardingDateField,
  OnboardingLabel,
  OnboardingPicker,
  OnboardingTextField,
} from "@/src/containers/onboarding/OnboardingFields";
import {
  OnboardingShell,
  OnboardingTitle,
} from "@/src/containers/onboarding/OnboardingShell";
import { getProfile, saveProfile, saveTargets } from "@/src/db/queries/settings";
import { latestWeight, setWeight } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import {
  ACTIVITY_FACTORS,
  ageAt,
  suggestTargets,
  type ActivityLevel,
  type Goal,
  type Sex,
} from "@/src/domain/targets";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { theme } from "@/src/styles";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

const SEXES: Sex[] = ["male", "female"];
const ACTIVITIES = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];
const GOALS: Goal[] = ["cut", "maintain", "bulk"];

/** L'obiettivo di passi che il wizard scrive: si cambia da Obiettivi. */
const DEFAULT_STEPS_GOAL = 8000;

const num = (text: string): number => {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Secondo passo: tutti i dati fisici insieme, e il fabbisogno che si calcola
 * mentre li scrivi.
 *
 * Erano QUATTRO passi - dati base, peso, attività e obiettivo, obiettivi
 * giornalieri - da uno a tre campi ciascuno, con il 70-80% di schermo vuoto e
 * un "Avanti" per volta. Nessuno dei quattro diceva a cosa servissero quei
 * numeri: il pannello in fondo è quella risposta, e riempie lo spazio con la
 * conseguenza di quel che si sta scrivendo invece che con del vuoto.
 *
 * Il pannello non è decorativo: mostra lo STESSO numero che verrà salvato come
 * obiettivo (`suggestTargets`), quindi la schermata degli obiettivi
 * giornalieri non serve più qui - quei campi si regolano da Profilo >
 * Obiettivi, dopo aver usato l'app, che è quando si ha un'idea di cosa
 * cambiare.
 *
 * `saveProfile` è un upsert su riga unica: qui si scrive il profilo INTERO,
 * ed è la ragione per cui questo passo li raccoglie tutti insieme senza
 * rischiare che un passo successivo azzeri quel che il precedente aveva
 * scritto. Il problema che quella regola descrive, con un passo solo, non
 * esiste più.
 */
export function OnboardingProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate, goBack } = useAppNav();
  const advanceTo = useOnboardingStore((s) => s.advanceTo);

  const [loading, setLoading] = useState(true);
  const [sex, setSex] = useState<Sex>("male");
  const [birthdate, setBirthdate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("maintain");

  useEffect(() => {
    let active = true;
    (async () => {
      // Si rileggono: chi torna indietro, o chi riprende il wizard dopo averlo
      // abbandonato, ritrova quel che aveva scritto invece di riscriverlo.
      const [profile, weight] = await Promise.all([getProfile(), latestWeight()]);
      if (!active) return;
      if (profile) {
        if (profile.sex) setSex(profile.sex as Sex);
        setBirthdate(profile.birthdate ?? "");
        setHeightCm(profile.height_cm ? String(profile.height_cm) : "");
        if (profile.activity_level) {
          setActivity(profile.activity_level as ActivityLevel);
        }
        if (profile.goal) setGoal(profile.goal as Goal);
      }
      if (weight) setWeightKg(String(weight.weight_kg));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const height = num(heightCm);
  const weight = num(weightKg);
  const complete = birthdate.length === 10 && height > 0 && weight > 0;

  /**
   * Il fabbisogno si ricalcola a ogni tasto, ma solo quando i dati ci sono
   * tutti: un numero che compare a metà altezza e poi salta del quaranta per
   * cento perché mancava il peso non è un'anteprima, è rumore.
   */
  const suggestion = useMemo(
    () =>
      complete
        ? suggestTargets({
            sex,
            weightKg: weight,
            heightCm: height,
            age: ageAt(birthdate, new Date()),
            activity,
            goal,
          })
        : null,
    [complete, sex, weight, height, birthdate, activity, goal],
  );

  const goNext = async () => {
    await saveProfile({
      sex,
      birthdate,
      heightCm: height,
      activityLevel: activity,
      goal,
    });
    await setWeight(todayIso(), weight);
    if (suggestion) {
      await saveTargets({
        validFrom: todayIso(),
        kcal: suggestion.kcal,
        proteinG: suggestion.proteinG,
        carbsG: suggestion.carbsG,
        fatG: suggestion.fatG,
        steps: DEFAULT_STEPS_GOAL,
      });
    }
    await advanceTo("OnboardingTheme");
    navigate("OnboardingTheme");
  };

  return (
    <OnboardingShell
      step="OnboardingProfile"
      onBack={goBack}
      primaryLabel={t("onboarding.next")}
      onPrimary={() => void goNext()}
      primaryDisabled={loading || !complete}
    >
      <OnboardingTitle>{t("onboarding.profile_title")}</OnboardingTitle>

      <View style={styles.row}>
        <View style={styles.cell}>
          <OnboardingPicker
            label={t("targets.sex")}
            title={t("targets.sex")}
            values={SEXES}
            selected={sex}
            labelKey="targets.sex_value"
            onSelect={setSex}
          />
        </View>
        <View style={styles.cell}>
          <OnboardingLabel>{t("targets.birthdate")}</OnboardingLabel>
          <OnboardingDateField value={birthdate} onChange={setBirthdate} />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.cell}>
          <OnboardingLabel>{t("onboarding.height_short")}</OnboardingLabel>
          <OnboardingTextField
            value={heightCm}
            onChangeText={setHeightCm}
            placeholder="175"
          />
        </View>
        <View style={styles.cell}>
          <OnboardingLabel>{t("onboarding.weight_short")}</OnboardingLabel>
          <OnboardingTextField
            value={weightKg}
            onChangeText={setWeightKg}
            placeholder={t("onboarding.weight_placeholder")}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.cell}>
          <OnboardingPicker
            label={t("targets.activity")}
            title={t("targets.activity")}
            values={ACTIVITIES}
            selected={activity}
            labelKey="targets.activity_value"
            onSelect={setActivity}
          />
        </View>
        <View style={styles.cell}>
          <OnboardingPicker
            label={t("targets.goal")}
            title={t("targets.goal")}
            values={GOALS}
            selected={goal}
            labelKey="targets.goal_value"
            onSelect={setGoal}
          />
        </View>
      </View>

      <HeroPanel style={styles.hero} contentStyle={styles.heroBody}>
        {suggestion ? (
          <>
            <Text style={[styles.kcal, { color: colors.text }]}>
              {suggestion.kcal.toLocaleString("it-IT")}
              <Text style={[styles.kcalUnit, { color: colors.textMuted }]}>
                {" kcal"}
              </Text>
            </Text>
            <Text style={[styles.heroCaption, { color: colors.textMuted }]}>
              {t("onboarding.tdee_caption")}
            </Text>
            <Text style={[styles.heroHint, { color: colors.textSecondary }]}>
              {t("onboarding.tdee_hint")}
            </Text>
          </>
        ) : (
          <Text style={[styles.heroHint, { color: colors.textSecondary }]}>
            {t("onboarding.tdee_waiting")}
          </Text>
        )}
      </HeroPanel>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  // Nessun `gap` verticale: le etichette dei campi portano già il loro
  // marginTop, e sommarli allontanerebbe le righe fra loro.
  row: { flexDirection: "row", gap: theme.spacing.sm + 4 },
  cell: { flex: 1 },
  hero: { marginTop: theme.spacing.lg },
  heroBody: { padding: theme.spacing.md, gap: 2 },
  kcal: { fontSize: 30, fontWeight: "700" },
  kcalUnit: { fontSize: 15, fontWeight: "600" },
  heroCaption: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  heroHint: { fontSize: 13, lineHeight: 19, marginTop: theme.spacing.xs },
});
