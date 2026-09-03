import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Check, ChevronDown } from "lucide-react-native";
import React, { useRef } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import type { KeyboardTypeOptions } from "react-native";

/**
 * I campi del wizard, condivisi fra i passi che raccolgono dati del profilo:
 * stessa etichetta, stesso campo, stesso picker a foglio di `TargetsScreen`,
 * ma isolati qui perché tre passi (dati base, peso, attività/obiettivo) li
 * riusano com'erano prima di essere spezzati in un unico form.
 */

export const OnboardingLabel: React.FC<{ children: string }> = ({ children }) => {
  const { colors } = useAppTheme();
  return <Text style={[styles.label, { color: colors.textMuted }]}>{children}</Text>;
};

export const OnboardingTextField: React.FC<{
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
}> = ({ value, onChangeText, placeholder, keyboardType = "decimal-pad" }) => {
  const { colors } = useAppTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      style={[
        styles.input,
        { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
      ]}
    />
  );
};

export function OnboardingPicker<T extends string>({
  label,
  title,
  values,
  selected,
  labelKey,
  onSelect,
}: {
  label: string;
  title: string;
  values: readonly T[];
  selected: T;
  /** `t(`${labelKey}.${value}`)` dà l'etichetta di ogni valore. */
  labelKey: string;
  onSelect: (value: T) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const sheetRef = useRef<BottomSheetModal>(null);

  return (
    <View>
      <OnboardingLabel>{label}</OnboardingLabel>
      <TouchableOpacity
        onPress={() => sheetRef.current?.present()}
        activeOpacity={0.6}
        style={[styles.selectBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.selectBtnText, { color: colors.text }]}>
          {t(`${labelKey}.${selected}`)}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <DfBottomSheet ref={sheetRef} title={title}>
        {values.map((value, index) => {
          const isSelected = value === selected;
          return (
            <TouchableOpacity
              key={value}
              activeOpacity={0.6}
              style={[
                styles.pickerRow,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: index === values.length - 1 ? 0 : 1,
                },
              ]}
              onPress={() => {
                onSelect(value);
                sheetRef.current?.dismiss();
              }}
            >
              <Text style={[styles.pickerRowText, { color: colors.text }]}>
                {t(`${labelKey}.${value}`)}
              </Text>
              {isSelected && <Check size={18} color={colors.accent} />}
            </TouchableOpacity>
          );
        })}
      </DfBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
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
    // md come i bottoni-select/data qui sotto: stessa altezza per ogni campo
    // del wizard.
    paddingVertical: theme.spacing.md,
    fontSize: 15,
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    // md come le righe che elenca: un select pesa quanto una riga di lista,
    // in tutto il progetto.
    paddingVertical: theme.spacing.md,
  },
  selectBtnText: { fontSize: 15 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.md,
  },
  pickerRowText: { fontSize: 15, fontWeight: "500" },
});
