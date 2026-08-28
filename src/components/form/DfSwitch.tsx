import { Switch } from "@/components/ui/switch";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import {
  Controller,
  useFormContext,
  type RegisterOptions,
} from "react-hook-form";
import { Keyboard, StyleSheet, View } from "react-native";
import { useFieldRegistration } from "./FormScrollContext";

interface SwitchProps {
  name?: string;
  label?: string;
  initialValue?: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  rules?: RegisterOptions;
}

export const DfSwitch = ({ name, ...props }: SwitchProps) => {
  if (name) {
    return <DfSwitchWithForm name={name} {...props} />;
  }

  return <BasicDfSwitch {...props} />;
};

const BasicDfSwitch = ({
  initialValue,
  onValueChange,
  disabled,
}: SwitchProps) => {
  const { colors } = useAppTheme();

  return (
    <Switch
      value={initialValue}
      onValueChange={(val) => {
        Keyboard.dismiss();
        onValueChange?.(val);
      }}
      disabled={disabled}
      // Sul track acceso il pollice prende il contrasto opposto: sullo scuro
      // `accent` e' quasi bianco e un pollice bianco sparirebbe.
      thumbColor={initialValue ? colors.accentOn : theme.colors.white}
      trackColor={{
        // Track spento semantico: il grigio fisso del template spariva sul
        // fondo scuro. Acceso interattivo: lo switch dice "attivo", non "neutro".
        false: colors.border,
        true: colors.accent,
      }}
    />
  );
};

interface DfSwitchWithFormProps extends Omit<SwitchProps, "name"> {
  name: string;
}

const DfSwitchWithForm = ({
  name,
  label,
  initialValue = false,
  onValueChange,
  rules,
  ...props
}: DfSwitchWithFormProps) => {
  const { colors } = useAppTheme();
  const { control } = useFormContext();
  const fieldRef = useFieldRegistration(name);

  return (
    <View ref={fieldRef} style={styles.wrapper}>
      {label && (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      )}
      <Controller
        control={control}
        name={name}
        defaultValue={initialValue}
        rules={rules}
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <>
            <BasicDfSwitch
              initialValue={value}
              onValueChange={(newValue) => {
                onChange(newValue);
                onValueChange?.(newValue);
              }}
              {...props}
            />
            {error && (
              <Text style={styles.errorText}>{error.message?.toString()}</Text>
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
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
});
