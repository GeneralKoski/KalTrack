import { DfAlert } from "@/src/components/DfAlert";
import { Chip } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  generateRoutine,
  type RoutineGoal,
  type RoutineLevel,
  type RoutinePreferences,
} from "@/src/ai/generateRoutine";
import { EQUIPMENT, type Equipment } from "@/src/types/gym";
import type { RoutineInput } from "@/src/db/queries/workouts";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { showToast } from "@/src/utils/toast";
import { Sparkles } from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

interface GenerateRoutineModalProps {
  isOpen: boolean;
  onGenerated: (routine: RoutineInput) => void;
  onClose: () => void;
}

const GOALS: { key: RoutineGoal; label: string }[] = [
  { key: "ipertrofia", label: "Ipertrofia" },
  { key: "forza", label: "Forza" },
  { key: "dimagrimento", label: "Definizione" },
  { key: "resistenza", label: "Resistenza" },
];

const DAYS = [2, 3, 4, 5, 6];

const LEVELS: { key: RoutineLevel; label: string }[] = [
  { key: "principiante", label: "Principiante" },
  { key: "intermedio", label: "Intermedio" },
  { key: "avanzato", label: "Avanzato" },
];

const DURATIONS = [45, 60, 75, 90];

const EQUIPMENT_PRESETS: { label: string; items: Equipment[] }[] = [
  { label: "Palestra completa", items: [...EQUIPMENT] },
  {
    label: "Manubri e panca",
    items: ["corpo_libero", "manubri", "panca", "sbarra", "elastici"],
  },
  { label: "Corpo libero", items: ["corpo_libero", "sbarra", "elastici"] },
];

export const GenerateRoutineModal: React.FC<GenerateRoutineModalProps> = ({
  isOpen,
  onGenerated,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [goal, setGoal] = useState<RoutineGoal>("ipertrofia");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [level, setLevel] = useState<RoutineLevel>("intermedio");
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [equipmentPreset, setEquipmentPreset] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const preferences: RoutinePreferences = {
        goal,
        daysPerWeek,
        level,
        sessionMinutes,
        availableEquipment: EQUIPMENT_PRESETS[equipmentPreset]?.items ?? [
          ...EQUIPMENT,
        ],
      };
      const routine = await generateRoutine(preferences);
      showToast.success({ title: "Scheda generata con successo!" });
      onGenerated(routine);
      onClose();
    } catch (error) {
      showToast.error({
        title:
          error instanceof Error ? error.message : "Generazione fallita",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DfAlert
      isOpen={isOpen}
      title="Genera scheda con IA"
      confirmLabel="Genera scheda"
      confirmIcon={<Sparkles size={16} color={colors.accentOn} />}
      loading={loading}
      verticalFooter
      onConfirm={handleGenerate}
      onClose={onClose}
      size="lg"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Obiettivo
          </Text>
          <View style={styles.chips}>
            {GOALS.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                active={goal === item.key}
                onPress={() => setGoal(item.key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Giorni a settimana
          </Text>
          <View style={styles.chips}>
            {DAYS.map((d) => (
              <Chip
                key={d}
                label={`${d} giorni`}
                active={daysPerWeek === d}
                onPress={() => setDaysPerWeek(d)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Livello di esperienza
          </Text>
          <View style={styles.chips}>
            {LEVELS.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                active={level === item.key}
                onPress={() => setLevel(item.key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Durata della sessione
          </Text>
          <View style={styles.chips}>
            {DURATIONS.map((m) => (
              <Chip
                key={m}
                label={`${m} min`}
                active={sessionMinutes === m}
                onPress={() => setSessionMinutes(m)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
            Attrezzatura disponibile
          </Text>
          <View style={styles.chips}>
            {EQUIPMENT_PRESETS.map((preset, index) => (
              <Chip
                key={preset.label}
                label={preset.label}
                active={equipmentPreset === index}
                onPress={() => setEquipmentPreset(index)}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </DfAlert>
  );
};

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  section: {
    gap: theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
});
