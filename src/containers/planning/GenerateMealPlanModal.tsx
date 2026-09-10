import {
  generateMealPlan,
  type DietStyle,
  type MealPlanPreferences,
} from "@/src/ai/generateMealPlan";
import { DfAlert } from "@/src/components/DfAlert";
import { DfOptionSheet } from "@/src/components/DfOptionSheet";
import { DfSwitch } from "@/src/components/form/DfSwitch";
import { FieldLabel, Segmented } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { DraftTextInput, Text } from "@/src/components/ui";
import { addDays } from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { TargetRow } from "@/src/types/nutrition";
import { formatInteger } from "@/src/utils/number";
import { showToast } from "@/src/utils/toast";
import { ChevronDown, Sparkles } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";

interface GenerateMealPlanModalProps {
  isOpen: boolean;
  selectedDate: string;
  weekStart: string;
  currentTargets?: TargetRow | null;
  onGenerated: (count: number) => void;
  onClose: () => void;
}

const DIET_STYLES: DietStyle[] = [
  "balanced",
  "high_protein",
  "low_carb",
  "vegetarian",
  "quick_prep",
  "keto",
];

export const GenerateMealPlanModal: React.FC<GenerateMealPlanModalProps> = ({
  isOpen,
  selectedDate,
  weekStart,
  currentTargets,
  onGenerated,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [rangeMode, setRangeMode] = useState<
    "day" | "rest_of_week" | "all_week"
  >("day");
  const [dietStyle, setDietStyle] = useState<DietStyle>("balanced");
  const [stylePicker, setStylePicker] = useState(false);
  const [useSavedItems, setUseSavedItems] = useState(true);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * Chiusa la finestra si torna ai valori di partenza. Le note in particolare
   * restavano scritte: chi aveva chiesto "senza latticini" per lunedi' se le
   * ritrovava addosso alla generazione di mercoledi' senza accorgersene.
   *
   * Sul `!isOpen` e non su `onClose`, perche' dalla finestra si esce anche
   * toccando fuori e confermando, non solo dal bottone.
   */
  React.useEffect(() => {
    if (isOpen) return;
    setRangeMode("day");
    setDietStyle("balanced");
    setStylePicker(false);
    setUseSavedItems(true);
    setNotes("");
  }, [isOpen]);

  const getTargetDates = (): string[] => {
    if (rangeMode === "day") {
      return [selectedDate];
    }
    if (rangeMode === "all_week") {
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }
    // Rest of week: from selectedDate or today until Sunday
    const weekEnd = addDays(weekStart, 6);
    const startDate = selectedDate;
    const dates: string[] = [];
    let cur = startDate;
    while (cur <= weekEnd) {
      dates.push(cur);
      cur = addDays(cur, 1);
    }
    return dates.length > 0 ? dates : [selectedDate];
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const dates = getTargetDates();
      const prefs: MealPlanPreferences = {
        dates,
        dietStyle,
        useSavedItems,
        notes: notes.trim() || undefined,
        targetKcal: currentTargets?.kcal,
        targetProteinG: currentTargets?.protein_g,
        targetCarbsG: currentTargets?.carbs_g,
        targetFatG: currentTargets?.fat_g,
      };

      const result = await generateMealPlan(prefs);
      showToast.success({
        title: t("plan.ai_generate_done", { count: result.createdCount }),
      });
      onGenerated(result.createdCount);
      onClose();
    } catch (error) {
      showToast.error({
        title:
          error instanceof Error ? error.message : t("plan.ai_generate_failed"),
      });
    } finally {
      setLoading(false);
    }
  };

  const targetDatesCount = getTargetDates().length;

  const styleOptions = DIET_STYLES.map((key) => ({
    value: key,
    label: t(`plan.ai_diet.${key}.label`),
    detail: t(`plan.ai_diet.${key}.detail`),
  }));

  return (
    <>
      <DfAlert
        isOpen={isOpen}
        title={t("plan.ai_generate_title")}
        confirmLabel={t("plan.ai_generate_action")}
        confirmIcon={<Sparkles size={16} color={colors.accentOn} />}
        loading={loading}
        onConfirm={handleGenerate}
        onClose={onClose}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <FieldLabel>{t("plan.ai_period")}</FieldLabel>
            <Segmented
              options={[
                { value: "day", label: t("plan.ai_period_day") },
                { value: "rest_of_week", label: t("plan.ai_period_rest") },
                { value: "all_week", label: t("plan.ai_period_all") },
              ]}
              value={rangeMode}
              onChange={setRangeMode}
            />
          </View>

          <View style={styles.section}>
            <FieldLabel>{t("plan.ai_diet_style")}</FieldLabel>
            <TouchableOpacity
              activeOpacity={0.6}
              accessibilityRole="button"
              onPress={() => setStylePicker(true)}
              style={[
                styles.trigger,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <Text style={[styles.triggerValue, { color: colors.text }]}>
                {t(`plan.ai_diet.${dietStyle}.label`)}
              </Text>
              <ChevronDown size={18} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: colors.textSecondary }]}>
              {t("plan.ai_use_saved_items")}
            </Text>
            <DfSwitch
              initialValue={useSavedItems}
              onValueChange={setUseSavedItems}
            />
          </View>

          <View style={styles.section}>
            <FieldLabel>{t("plan.ai_notes_title")}</FieldLabel>
            <DraftTextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t("plan.ai_notes_placeholder")}
              placeholderTextColor={colors.textFaint}
              autoCorrect
              multiline
              numberOfLines={2}
              style={[
                styles.notesInput,
                {
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: colors.surface,
                },
              ]}
            />
          </View>

          {/*
           * Il riepilogo sta in fondo, sopra i bottoni: e' la conseguenza delle
           * scelte di sopra, e si legge nel momento in cui si sta per premere.
           * Prima le due meta' stavano separate - l'obiettivo a meta' finestra
           * in un riquadro, le giornate in corsivo sotto le note - e nessuna
           * delle due era dove si guarda.
           */}
          <View style={[styles.recap, { borderColor: colors.border }]}>
            <Text style={[styles.recapDays, { color: colors.text }]}>
              {t("plan.ai_days_counter", { count: targetDatesCount })}
            </Text>
            {currentTargets ? (
              <>
                <Text style={[styles.recapKcal, { color: colors.textMuted }]}>
                  {t("plan.ai_targets_summary", {
                    kcal: formatInteger(currentTargets.kcal),
                  })}
                </Text>
                <Text style={[styles.recapMacros, { color: colors.textMuted }]}>
                  {`P ${currentTargets.protein_g} g · C ${currentTargets.carbs_g} g · G ${currentTargets.fat_g} g`}
                </Text>
              </>
            ) : null}
          </View>
        </ScrollView>
      </DfAlert>

      <DfOptionSheet
        isOpen={stylePicker}
        title={t("plan.ai_diet_style")}
        options={styleOptions}
        value={dietStyle}
        onSelect={(value) => {
          setDietStyle(value);
          setStylePicker(false);
        }}
        onClose={() => setStylePicker(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  section: {
    gap: 6,
  },
  trigger: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm + 4,
  },
  triggerValue: {
    flex: 1,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: 14,
    minHeight: 56,
    textAlignVertical: "top",
  },
  recap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: theme.spacing.sm,
    gap: 2,
  },
  recapDays: {
    fontSize: 15,
    fontWeight: "600",
  },
  recapKcal: {
    fontSize: 12,
  },
  recapMacros: {
    fontSize: 12,
  },
});
