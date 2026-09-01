import {
  generateMealPlan,
  type DietStyle,
  type MealPlanPreferences,
} from "@/src/ai/generateMealPlan";
import { DfAlert } from "@/src/components/DfAlert";
import { Chip } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { addDays } from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { TargetRow } from "@/src/types/nutrition";
import { showToast } from "@/src/utils/toast";
import { Sparkles, Utensils } from "lucide-react-native";
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

const DIET_STYLES: { key: DietStyle; label: string }[] = [
  { key: "balanced", label: "Equilibrata" },
  { key: "high_protein", label: "Iperproteica" },
  { key: "low_carb", label: "Low Carb" },
  { key: "vegetarian", label: "Vegetariana" },
  { key: "quick_prep", label: "Veloce" },
  { key: "keto", label: "Chetogenica" },
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
  const [useSavedItems, setUseSavedItems] = useState(true);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("plan.ai_period")}
          </Text>
          <View style={styles.chipsRow}>
            <Chip
              label={t("plan.ai_period_day")}
              active={rangeMode === "day"}
              onPress={() => setRangeMode("day")}
            />
            <Chip
              label={t("plan.ai_period_rest")}
              active={rangeMode === "rest_of_week"}
              onPress={() => setRangeMode("rest_of_week")}
            />
            <Chip
              label={t("plan.ai_period_all")}
              active={rangeMode === "all_week"}
              onPress={() => setRangeMode("all_week")}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("plan.ai_diet_style")}
          </Text>
          <View style={styles.chipsRow}>
            {DIET_STYLES.map((style) => (
              <Chip
                key={style.key}
                label={style.label}
                active={dietStyle === style.key}
                onPress={() => setDietStyle(style.key)}
              />
            ))}
          </View>
        </View>

        {currentTargets && (
          <View
            style={[
              styles.targetSummary,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.targetHeader}>
              <Utensils size={14} color={colors.accent} />
              <Text style={[styles.targetTitle, { color: colors.text }]}>
                {t("plan.ai_targets_summary", { kcal: currentTargets.kcal })}
              </Text>
            </View>
            <Text style={[styles.targetMacros, { color: colors.textMuted }]}>
              {`P: ${currentTargets.protein_g}g • C: ${currentTargets.carbs_g}g • G: ${currentTargets.fat_g}g`}
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setUseSavedItems(!useSavedItems)}
            style={styles.toggleRow}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: useSavedItems ? colors.accent : colors.border,
                  backgroundColor: useSavedItems
                    ? colors.accent
                    : "transparent",
                },
              ]}
            >
              {useSavedItems && (
                <Text style={[styles.checkmark, { color: colors.accentOn }]}>
                  ✓
                </Text>
              )}
            </View>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>
              {t("plan.ai_use_saved_items")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("plan.ai_notes_title")}
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t("plan.ai_notes_placeholder")}
            placeholderTextColor={colors.textFaint}
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

        <Text style={[styles.daysCounter, { color: colors.textMuted }]}>
          {t("plan.ai_days_counter", { count: targetDatesCount })}
        </Text>
      </ScrollView>
    </DfAlert>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  targetSummary: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    gap: 4,
  },
  targetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  targetTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  targetMacros: {
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: 13,
    minHeight: 52,
    textAlignVertical: "top",
  },
  daysCounter: {
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 2,
  },
});
