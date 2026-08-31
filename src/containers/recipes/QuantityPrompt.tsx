import { DfAlert } from "@/src/components/DfAlert";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  activeMultiplier,
  formatGrams,
  SERVING_MULTIPLIERS,
  servingGrams,
} from "@/src/domain/serving";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React, { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

interface QuantityPromptProps {
  isOpen: boolean;
  title: string;
  /** "g" per un alimento, "porzioni" per una ricetta annidata. */
  unit: string;
  initialValue: number;
  /**
   * La porzione dell'alimento, quando ne ha una: apre le scorciatoie.
   *
   * Solo per gli alimenti. Per una ricetta il valore e' GIA' in porzioni, e
   * delle scorciatoie "porzione" sarebbero un moltiplicatore di un
   * moltiplicatore.
   */
  serving?: { grams: number; label: string | null } | null;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

/** Come si scrive mezza porzione: "1/2" e non "0,5". */
const MULTIPLIER_LABEL: Record<string, string> = {
  "0.5": "\u00bd",
};

const multiplierLabel = (multiplier: number): string =>
  MULTIPLIER_LABEL[String(multiplier)] ?? String(multiplier);

export const QuantityPrompt: React.FC<QuantityPromptProps> = ({
  isOpen,
  title,
  unit,
  initialValue,
  serving = null,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [text, setText] = useState(String(initialValue));

  useEffect(() => {
    if (isOpen) setText(String(initialValue));
  }, [isOpen, initialValue]);

  const parsed = Number(text.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const servingG = serving?.grams ?? 0;
  const attivo = valid ? activeMultiplier(parsed, servingG) : null;

  return (
    <DfAlert
      isOpen={isOpen}
      title={title}
      confirmLabel={t("confirm")}
      onConfirm={() => valid && onConfirm(parsed)}
      onClose={onClose}
    >
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          selectTextOnFocus
          autoFocus
          placeholderTextColor={colors.textFaint}
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text },
          ]}
        />
        <Text style={[styles.unit, { color: colors.textMuted }]}>{unit}</Text>
      </View>

      {servingG > 0 ? (
        <View style={styles.serving}>
          <Text style={[styles.servingHint, { color: colors.textMuted }]}>
            {serving?.label?.trim()
              ? serving.label
              : t("quantity.serving_is", { grams: formatGrams(servingG) })}
          </Text>

          <View style={styles.chips}>
            {SERVING_MULTIPLIERS.map((multiplier) => {
              const selected = attivo === multiplier;
              return (
                <TouchableOpacity
                  key={multiplier}
                  onPress={() =>
                    setText(formatGrams(servingGrams(servingG, multiplier)))
                  }
                  activeOpacity={0.6}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.accent
                        : colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: selected ? colors.accentOn : colors.textMuted },
                    ]}
                  >
                    {multiplierLabel(multiplier)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
    </DfAlert>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm,
  },
  unit: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 64,
  },
  serving: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  servingHint: { fontSize: 12 },
  chips: { flexDirection: "row", gap: theme.spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    minWidth: 52,
    alignItems: "center",
  },
  chipLabel: { fontSize: 15, fontWeight: "700" },
});
