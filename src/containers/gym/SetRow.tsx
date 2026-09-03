import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/src/utils/utils";
import { Check } from "lucide-react-native";
import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface SetRowProps {
  /** Numero mostrato all'utente, quindi 1-based. */
  setNumber: number;
  /** Presente solo nei blocchi che alternano più esercizi: lì la serie da sola non basta a capire cosa fare. */
  exerciseName?: string;
  /** Ripetizioni previste dalla scheda ("8-10"): finisce nel placeholder, non nel valore. */
  targetReps?: string | null;
  weight: string;
  reps: string;
  done: boolean;
  onChangeWeight: (value: string) => void;
  onChangeReps: (value: string) => void;
  onDone: () => void;
}

/**
 * Una serie da spuntare. I campi sono precompilati dal chiamante con l'ultima
 * volta: qui dentro non c'è storico, solo testo modificabile.
 *
 * Una volta spuntata la riga si blocca: `logSet` ha già scritto la serie e non
 * esiste una query per disfarla, quindi un campo ancora editabile mentirebbe.
 */
export const SetRow: React.FC<SetRowProps> = ({
  setNumber,
  exerciseName,
  targetReps,
  weight,
  reps,
  done,
  onChangeWeight,
  onChangeReps,
  onDone,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState<"weight" | "reps" | null>(null);

  const fieldStyle = (field: "weight" | "reps") => [
    styles.input,
    {
      backgroundColor: done ? "transparent" : colors.surfaceMuted,
      borderColor: focused === field ? colors.accent : "transparent",
      color: done ? colors.textMuted : colors.text,
    },
  ];

  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: colors.surfaceMuted }]}>
        <Text style={[styles.badgeText, { color: colors.textMuted }]}>
          {setNumber}
        </Text>
      </View>

      <View style={styles.body}>
        {exerciseName ? (
          <Text
            style={[styles.exercise, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {exerciseName}
          </Text>
        ) : null}

        <View style={styles.fields}>
          <View style={styles.field}>
            <TextInput
              value={weight}
              onChangeText={(text) => onChangeWeight(sanitizeDecimalInput(text))}
              onFocus={() => setFocused("weight")}
              onBlur={() => setFocused(null)}
              editable={!done}
              keyboardType="decimal-pad"
              selectTextOnFocus
              placeholder="-"
              placeholderTextColor={colors.textFaint}
              style={fieldStyle("weight")}
            />
            <Text style={[styles.unit, { color: colors.textMuted }]}>
              {t("gym.kg")}
            </Text>
          </View>

          <Text style={[styles.times, { color: colors.textFaint }]}>×</Text>

          <View style={styles.field}>
            <TextInput
              value={reps}
              onChangeText={(text) => onChangeReps(sanitizeIntegerInput(text))}
              onFocus={() => setFocused("reps")}
              onBlur={() => setFocused(null)}
              editable={!done}
              keyboardType="number-pad"
              selectTextOnFocus
              placeholder={targetReps ?? "-"}
              placeholderTextColor={colors.textFaint}
              style={fieldStyle("reps")}
            />
            <Text style={[styles.unit, { color: colors.textMuted }]}>
              {t("gym.reps")}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={onDone}
        disabled={done}
        activeOpacity={0.6}
        hitSlop={8}
        style={[
          styles.check,
          done
            ? { backgroundColor: theme.colors.success }
            : { borderWidth: 1.5, borderColor: colors.border },
        ]}
      >
        <Check
          size={22}
          strokeWidth={3}
          color={done ? theme.colors.white : colors.textFaint}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 13, fontWeight: "700" },
  body: { flex: 1, gap: 2 },
  exercise: { flexShrink: 1, fontSize: 12, fontWeight: "600" },
  fields: { flexDirection: "row", alignItems: "center", gap: theme.spacing.xs },
  field: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    borderWidth: 1.5,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 14,
  },
  unit: { fontSize: 12, fontWeight: "600" },
  times: { fontSize: 14, fontWeight: "600" },
  // 48x48: si preme con il pollice, spesso di fretta e con le mani sudate.
  check: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
