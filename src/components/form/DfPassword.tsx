import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { Eye, EyeOff } from "lucide-react-native";
import React, { useState } from "react";
import {
  Controller,
  useFormContext,
  type RegisterOptions,
} from "react-hook-form";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

interface DfPasswordProps {
  name: string;
  label?: string;
  placeholder?: string;
  rules?: RegisterOptions;
  wrapperStyle?: StyleProp<ViewStyle>;
}

export const DfPassword = ({
  name,
  label,
  placeholder,
  rules,
  wrapperStyle,
}: DfPasswordProps) => {
  const [visible, setVisible] = useState(false);
  const { control } = useFormContext();
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const resolvedLabel = label ?? t("password");

  return (
    <View style={[styles.wrapper, wrapperStyle]}>
      {resolvedLabel && <Text style={styles.label}>{resolvedLabel}</Text>}

      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error },
        }) => (
          <>
            <View style={styles.inputContainer}>
              <TextInput
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={placeholder ?? t("default_input_placeholder")}
                placeholderTextColor={theme.colors.gray400}
                secureTextEntry={!visible}
                autoComplete="password"
                textContentType="password"
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  { borderColor: colors.border },
                  error && styles.inputError,
                ]}
              />
              <Pressable
                onPress={() => setVisible((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeButton}
              >
                {visible ? (
                  <EyeOff size={20} color={theme.colors.gray400} />
                ) : (
                  <Eye size={20} color={theme.colors.gray400} />
                )}
              </Pressable>
            </View>
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
  inputContainer: {
    position: "relative",
    justifyContent: "center",
  },
  input: {
    fontSize: 16,
    color: theme.colors.gray900,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 44,
    minHeight: 48,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
});
