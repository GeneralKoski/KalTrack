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
  ...textInputProps
}: DfInputProps) => {
  const { control } = useFormContext();
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}

      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error },
        }) => (
          <>
            <TextInput
              value={value ?? ""}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={placeholder ?? t("default_input_placeholder")}
              placeholderTextColor={theme.colors.gray400}
              editable={!readOnly}
              style={[
                styles.input,
                { borderColor: colors.border },
                error && styles.inputError,
                readOnly && styles.inputReadOnly,
              ]}
              {...textInputProps}
            />
            {error?.message && (
              <Text style={styles.errorText}>{error.message as string}</Text>
            )}
          </>
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
    color: theme.colors.gray900,
    marginBottom: 6,
  },
  input: {
    fontSize: 16,
    color: theme.colors.gray900,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  inputReadOnly: {
    backgroundColor: theme.colors.gray100,
    color: theme.colors.gray500,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
});
