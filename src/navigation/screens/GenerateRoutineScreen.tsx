import {
  generateRoutine,
  type RoutineGoal,
  type RoutineLevel,
  type RoutinePreferences,
} from "@/src/ai/generateRoutine";
import { DfForm, type DfFormRef } from "@/src/components/form/DfForm";
import { DfButton } from "@/src/components/form/DfButton";
import { DfInput } from "@/src/components/form/DfInput";
import { DfSelect, type SelectOption } from "@/src/components/form/DfSelect";
import { FormScreen } from "@/src/components/FormScreen";
import { ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { EQUIPMENT, type Equipment } from "@/src/types/gym";
import { showToast } from "@/src/utils/toast";
import { ChevronLeft, Sparkles } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const GOALS: RoutineGoal[] = [
  "ipertrofia",
  "forza",
  "dimagrimento",
  "resistenza",
];

const DAYS = [2, 3, 4, 5, 6];

const LEVELS: RoutineLevel[] = ["principiante", "intermedio", "avanzato"];

const DURATIONS = [45, 60, 75, 90];

const EQUIPMENT_PRESETS: { labelKey: string; items: Equipment[] }[] = [
  { labelKey: "gym.generate_equipment_full", items: [...EQUIPMENT] },
  {
    labelKey: "gym.generate_equipment_dumbbells",
    items: ["corpo_libero", "manubri", "panca", "sbarra", "elastici"],
  },
  {
    labelKey: "gym.generate_equipment_bodyweight",
    items: ["corpo_libero", "sbarra", "elastici"],
  },
];

interface GenerateRoutineFormValues {
  goal: string;
  daysPerWeek: string;
  level: string;
  sessionMinutes: string;
  equipmentPreset: string;
  prompt: string;
}

const DEFAULT_VALUES: GenerateRoutineFormValues = {
  goal: "ipertrofia",
  daysPerWeek: "3",
  level: "intermedio",
  sessionMinutes: "60",
  equipmentPreset: "0",
  prompt: "",
};

export function GenerateRoutineScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { navigate, goBack } = useAppNav();
  const formRef = useRef<DfFormRef>(null);
  const [loading, setLoading] = useState(false);

  const goalOptions: SelectOption[] = GOALS.map((key) => ({
    value: key,
    label: t(`gym.generate_goal.${key}`),
  }));
  const daysOptions: SelectOption[] = DAYS.map((d) => ({
    value: String(d),
    label: t("gym.days_count", { count: d }),
  }));
  const levelOptions: SelectOption[] = LEVELS.map((key) => ({
    value: key,
    label: t(`gym.generate_level.${key}`),
  }));
  const durationOptions: SelectOption[] = DURATIONS.map((m) => ({
    value: String(m),
    label: t("gym.generate_duration_option", { minutes: m }),
  }));
  const equipmentOptions: SelectOption[] = EQUIPMENT_PRESETS.map(
    (preset, index) => ({
      value: String(index),
      label: t(preset.labelKey),
    }),
  );

  const handleSubmit = async (values: GenerateRoutineFormValues) => {
    setLoading(true);
    try {
      const preferences: RoutinePreferences = {
        goal: values.goal as RoutineGoal,
        daysPerWeek: Number(values.daysPerWeek),
        level: values.level as RoutineLevel,
        sessionMinutes: Number(values.sessionMinutes),
        availableEquipment:
          EQUIPMENT_PRESETS[Number(values.equipmentPreset)]?.items ?? [
            ...EQUIPMENT,
          ],
        prompt: values.prompt.trim() || undefined,
      };
      const routine = await generateRoutine(preferences);
      showToast.success({ title: t("gym.generate_success") });
      navigate("RoutineForm", { generatedRoutine: routine });
    } finally {
      setLoading(false);
    }
  };

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
            {t("gym.generate_title")}
          </Text>
        </View>

        <FormScreen
          contentContainerStyle={styles.content}
          bottomSpacing={theme.spacing.lg}
        >
          <DfForm<GenerateRoutineFormValues>
            ref={formRef}
            initialValues={DEFAULT_VALUES}
            hideSubmitButton
            onSubmit={handleSubmit}
            onError={(error) => {
              showToast.error({
                title:
                  error instanceof Error
                    ? error.message
                    : t("gym.generate_failed"),
              });
              return true;
            }}
          >
            <DfSelect
              name="goal"
              label={t("gym.generate_goal_label")}
              options={goalOptions}
            />
            <DfSelect
              name="daysPerWeek"
              label={t("gym.generate_days_label")}
              options={daysOptions}
            />
            <DfSelect
              name="level"
              label={t("gym.generate_level_label")}
              options={levelOptions}
            />
            <DfSelect
              name="sessionMinutes"
              label={t("gym.generate_duration_label")}
              options={durationOptions}
            />
            <DfSelect
              name="equipmentPreset"
              label={t("gym.generate_equipment_label")}
              options={equipmentOptions}
            />
            <DfInput
              name="prompt"
              label={t("gym.generate_prompt_label")}
              placeholder={t("gym.generate_prompt_placeholder")}
              multiline
              numberOfLines={3}
              style={styles.promptInput}
            />

            <View style={styles.actions}>
              <View style={styles.actionButton}>
                <DfButton
                  label={t("cancel")}
                  variant="outlined"
                  onPress={goBack}
                  disabled={loading}
                />
              </View>
              <View style={styles.actionButton}>
                <DfButton
                  label={t("gym.generate_action")}
                  icon={<Sparkles size={16} color={colors.accentOn} />}
                  loading={loading}
                  onPress={() => formRef.current?.submit()}
                />
              </View>
            </View>
          </DfForm>
        </FormScreen>
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
  promptInput: { minHeight: 70, textAlignVertical: "top" },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  actionButton: { flex: 1 },
});
