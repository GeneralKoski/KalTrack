import { DfAlert } from "@/src/components/DfAlert";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

interface FreeEntrySheetProps {
  isOpen: boolean;
  onConfirm: (label: string, nutrients: Nutrients) => void;
  onClose: () => void;
}

const toNumber = (text: string): number => {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Voce libera: un piatto di cui si sanno solo i valori approssimativi, tipico
 * del mangiare fuori. Viene salvata come stimata, così nei totali si distingue
 * da un dato misurato.
 */
export const FreeEntrySheet: React.FC<FreeEntrySheetProps> = ({
  isOpen,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setLabel("");
    setKcal("");
    setProtein("");
    setCarbs("");
    setFat("");
  }, [isOpen]);

  const valid = label.trim().length > 0 && toNumber(kcal) > 0;

  const confirm = () => {
    if (!valid) return;
    onConfirm(label.trim(), {
      ...EMPTY_NUTRIENTS,
      kcal: toNumber(kcal),
      protein: toNumber(protein),
      carbs: toNumber(carbs),
      fat: toNumber(fat),
    });
  };

  const field = (
    value: string,
    onChangeText: (v: string) => void,
    placeholder: string,
  ) => (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      keyboardType="decimal-pad"
      style={[
        styles.input,
        styles.macroInput,
        { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
      ]}
    />
  );

  return (
    <DfAlert
      isOpen={isOpen}
      title={t("diary.free_entry")}
      confirmLabel={t("confirm")}
      onConfirm={confirm}
      onClose={onClose}
    >
      <View style={styles.body}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder={t("diary.free_label_placeholder")}
          placeholderTextColor={colors.textFaint}
          autoFocus
          style={[
            styles.input,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        <TextInput
          value={kcal}
          onChangeText={setKcal}
          placeholder={t("diary.free_kcal_placeholder")}
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          style={[
            styles.input,
            { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
          ]}
        />

        <Text style={[styles.optional, { color: colors.textMuted }]}>
          {t("diary.free_macros_optional")}
        </Text>

        <View style={styles.macros}>
          {field(protein, setProtein, t("diary.protein_short"))}
          {field(carbs, setCarbs, t("diary.carbs_short"))}
          {field(fat, setFat, t("diary.fat_short"))}
        </View>
      </View>
    </DfAlert>
  );
};

const styles = StyleSheet.create({
  body: {
    gap: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 15,
  },
  optional: {
    fontSize: 12,
    marginTop: theme.spacing.xs,
  },
  macros: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  macroInput: {
    flex: 1,
    textAlign: "center",
  },
});
