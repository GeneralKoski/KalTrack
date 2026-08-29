import { FormScreen } from "@/src/components/FormScreen";
import { DfButton } from "@/src/components/form/DfButton";
import { MetalPanel, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { getProfile, getTargetsFor, saveProfile, saveTargets } from "@/src/db/queries/settings";
import { latestWeight } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import {
  ACTIVITY_FACTORS,
  ageAt,
  bmr,
  suggestTargets,
  tdee,
  type ActivityLevel,
  type Goal,
  type Sex,
} from "@/src/domain/targets";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, Sparkles } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SEXES: Sex[] = ["male", "female"];
const ACTIVITIES = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];
const GOALS: Goal[] = ["cut", "maintain", "bulk"];

const num = (text: string): number => {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export function TargetsScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();
  const today = todayIso();

  const [loading, setLoading] = useState(true);
  const [sex, setSex] = useState<Sex>("male");
  const [birthdate, setBirthdate] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("maintain");

  const [kcal, setKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [steps, setSteps] = useState("");
  const [weightKg, setWeightKg] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [profile, targets, weight] = await Promise.all([
        getProfile(),
        getTargetsFor(today),
        latestWeight(),
      ]);
      if (!active) return;

      if (profile) {
        if (profile.sex) setSex(profile.sex as Sex);
        setBirthdate(profile.birthdate ?? "");
        setHeightCm(profile.height_cm ? String(profile.height_cm) : "");
        if (profile.activity_level) setActivity(profile.activity_level as ActivityLevel);
        if (profile.goal) setGoal(profile.goal as Goal);
      }
      if (targets) {
        setKcal(String(Math.round(targets.kcal)));
        setProteinG(String(Math.round(targets.protein_g)));
        setCarbsG(String(Math.round(targets.carbs_g)));
        setFatG(String(Math.round(targets.fat_g)));
        setSteps(String(targets.steps));
      }
      setWeightKg(weight?.weight_kg ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [today]);

  const canCompute =
    birthdate.length === 10 && num(heightCm) > 0 && weightKg !== null;

  const age = canCompute ? ageAt(birthdate, new Date()) : null;
  const basal =
    canCompute && age !== null
      ? bmr({ sex, weightKg: weightKg!, heightCm: num(heightCm), age })
      : null;
  const daily = basal !== null ? tdee(basal, activity) : null;

  const compute = () => {
    if (!canCompute || age === null) {
      showToast.error({ title: t("targets.cannot_compute") });
      return;
    }
    const suggestion = suggestTargets({
      sex,
      weightKg: weightKg!,
      heightCm: num(heightCm),
      age,
      activity,
      goal,
    });
    setKcal(String(suggestion.kcal));
    setProteinG(String(suggestion.proteinG));
    setCarbsG(String(suggestion.carbsG));
    setFatG(String(suggestion.fatG));
  };

  const save = async () => {
    if (num(kcal) <= 0) {
      showToast.error({ title: t("targets.kcal_required") });
      return;
    }
    await saveProfile({
      sex,
      birthdate,
      heightCm: num(heightCm),
      activityLevel: activity,
      goal,
    });
    // Nuova decorrenza da oggi: gli obiettivi passati restano dov'erano.
    await saveTargets({
      validFrom: today,
      kcal: num(kcal),
      proteinG: num(proteinG),
      carbsG: num(carbsG),
      fatG: num(fatG),
      steps: num(steps),
    });
    showToast.success({ title: t("targets.saved") });
    goBack();
  };

  const input = (
    value: string,
    onChangeText: (v: string) => void,
    numeric = true,
    placeholder?: string,
  ) => (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={numeric ? "decimal-pad" : "default"}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      style={[
        styles.input,
        { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
      ]}
    />
  );

  const options = <T extends string>(
    values: readonly T[],
    selected: T,
    onSelect: (v: T) => void,
    labelKey: string,
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Non si eredita dalla ScrollView esterna: senza, col tastierino aperto
      // il primo tocco su un chip viene consumato per chiudere la tastiera.
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.options}
    >
      {values.map((value) => {
        const active = value === selected;
        return (
          <TouchableOpacity
            key={value}
            onPress={() => onSelect(value)}
            activeOpacity={0.6}
            style={[
              styles.option,
              { backgroundColor: active ? colors.accent : colors.surfaceMuted },
            ]}
          >
            <Text
              style={[
                styles.optionLabel,
                { color: active ? colors.accentOn : colors.textMuted },
              ]}
            >
              {t(`${labelKey}.${value}`)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {t("targets.title")}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FormScreen contentContainerStyle={styles.content} bottomSpacing={40}>
            <SectionLabel>{t("targets.profile")}</SectionLabel>

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.sex")}
            </Text>
            {options(SEXES, sex, setSex, "targets.sex_value")}

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.birthdate")}
            </Text>
            {input(birthdate, setBirthdate, false, "1995-06-15")}

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.height")}
            </Text>
            {input(heightCm, setHeightCm)}

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.activity")}
            </Text>
            {options(ACTIVITIES, activity, setActivity, "targets.activity_value")}

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.goal")}
            </Text>
            {options(GOALS, goal, setGoal, "targets.goal_value")}

            <SectionLabel style={styles.section}>
              {t("targets.daily")}
            </SectionLabel>

            {/* Il numero suggerito va spiegato, non calato dall'alto. */}
            <MetalPanel radius={theme.radius.xl} style={styles.explain}>
              <View style={styles.explainInner}>
                {basal !== null && daily !== null ? (
                  <Text style={[styles.explainText, { color: colors.textSecondary }]}>
                    {t("targets.explain", {
                      bmr: Math.round(basal),
                      tdee: Math.round(daily),
                      weight: weightKg,
                    })}
                  </Text>
                ) : (
                  <Text style={[styles.explainText, { color: colors.textMuted }]}>
                    {t("targets.explain_missing")}
                  </Text>
                )}
              </View>
            </MetalPanel>

            <DfButton
              label={t("targets.compute")}
              variant="outlined"
              icon={<Sparkles size={18} color={colors.accent} />}
              onPress={compute}
              style={styles.compute}
            />

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.kcal")}
            </Text>
            {input(kcal, setKcal)}

            <View style={styles.macros}>
              <View style={styles.macro}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t("diary.protein_short")}
                </Text>
                {input(proteinG, setProteinG)}
              </View>
              <View style={styles.macro}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t("diary.carbs_short")}
                </Text>
                {input(carbsG, setCarbsG)}
              </View>
              <View style={styles.macro}>
                <Text style={[styles.label, { color: colors.textMuted }]}>
                  {t("diary.fat_short")}
                </Text>
                {input(fatG, setFatG)}
              </View>
            </View>

            <Text style={[styles.label, { color: colors.textMuted }]}>
              {t("targets.steps")}
            </Text>
            {input(steps, setSteps)}

            <DfButton label={t("save")} onPress={save} style={styles.save} />
          </FormScreen>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: { flexGrow: 1, padding: theme.spacing.md },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
  },
  options: { flexDirection: "row", gap: theme.spacing.xs },
  option: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
  },
  optionLabel: { fontSize: 13, fontWeight: "600" },
  section: { marginTop: theme.spacing.lg },
  explain: { marginTop: theme.spacing.sm },
  explainInner: { padding: theme.spacing.md },
  explainText: { fontSize: 13, lineHeight: 19 },
  compute: { marginTop: theme.spacing.sm },
  macros: { flexDirection: "row", gap: theme.spacing.sm },
  macro: { flex: 1 },
  save: { marginTop: theme.spacing.lg },
  loader: { marginTop: theme.spacing.xl },
});
