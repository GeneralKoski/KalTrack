import { Switch } from "@/components/ui/switch";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { hexToRgba } from "@/src/utils/utils";
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
  return (
    <Switch
      value={initialValue}
      onValueChange={(val) => {
        Keyboard.dismiss();
        onValueChange?.(val);
      }}
      disabled={disabled}
      thumbColor={theme.colors.white}
      // @ts-expect-error web-only prop
      activeThumbColor={theme.colors.white}
      trackColor={{
        false: hexToRgba(theme.colors.gray600, 0.3),
        true: theme.colors.gray600,
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
  const { control } = useFormContext();
  const fieldRef = useFieldRegistration(name);

  return (
    <View ref={fieldRef} style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
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
    color: theme.colors.gray900,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
});
