import { DfAlert } from "@/src/components/DfAlert";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

interface QuantityPromptProps {
  isOpen: boolean;
  title: string;
  /** "g" per un alimento, "porzioni" per una ricetta annidata. */
  unit: string;
  initialValue: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

export const QuantityPrompt: React.FC<QuantityPromptProps> = ({
  isOpen,
  title,
  unit,
  initialValue,
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
});
