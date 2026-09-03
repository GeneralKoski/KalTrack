import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput, type TextInputProps } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import React from "react";
import {
  Controller,
  useFormContext,
  type RegisterOptions,
} from "react-hook-form";
import { StyleSheet, View } from "react-native";

interface DfInputProps extends Omit<TextInputProps, "value" | "onChangeText"> {
  name: string;
  label?: string;
  placeholder?: string;
  rules?: RegisterOptions;
  readOnly?: boolean;
}

export const DfInput = ({
  name,
  label,
  placeholder,
  rules,
  readOnly = false,
  style,
  ...textInputProps
}: DfInputProps) => {
  const { control } = useFormContext();
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      )}

      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error },
        }) => (
          <TextInput
            value={value ?? ""}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder={placeholder ?? t("default_input_placeholder")}
            placeholderTextColor={colors.textFaint}
            editable={!readOnly}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              error && styles.inputError,
              readOnly && {
                backgroundColor: colors.surfaceMuted,
                color: colors.textMuted,
              },
              style,
            ]}
            {...textInputProps}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontWeight: "500",
    fontSize: 14,
    marginBottom: 6,
  },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
});
