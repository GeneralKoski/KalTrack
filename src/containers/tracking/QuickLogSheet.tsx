import { DfAlert } from "@/src/components/DfAlert";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

interface QuickLogSheetProps {
  isOpen: boolean;
  title: string;
  unit: string;
  /** Valore già registrato per quel giorno, o null se il giorno è vuoto. */
  initialValue: number | null;
  /** Mostrato solo quando c'è già un valore: permette di toglierlo. */
  onDelete?: () => void;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

/** Inserimento rapido di un valore giornaliero, riusato da peso e passi. */
export const QuickLogSheet: React.FC<QuickLogSheetProps> = ({
  isOpen,
  title,
  unit,
  initialValue,
  onDelete,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [text, setText] = useState("");

  useEffect(() => {
    if (isOpen) setText(initialValue !== null ? String(initialValue) : "");
  }, [isOpen, initialValue]);

  const parsed = Number(text.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <DfAlert
      isOpen={isOpen}
      title={title}
      confirmLabel={t("confirm")}
      cancelLabel={initialValue !== null && onDelete ? t("delete") : t("cancel")}
      cancelColor={initialValue !== null && onDelete ? theme.colors.error : undefined}
      onConfirm={() => valid && onConfirm(parsed)}
      onClose={initialValue !== null && onDelete ? onDelete : onClose}
      onDismiss={onClose}
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
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              color: colors.text,
            },
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
    minWidth: 56,
  },
});
