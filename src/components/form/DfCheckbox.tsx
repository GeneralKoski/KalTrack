import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { CheckSquare, Square } from "lucide-react-native";
import { Controller, useFormContext } from "react-hook-form";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";

interface CheckboxProps {
  name?: string;
  label?: string;
  initialValue?: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
}

export const DfCheckbox = ({ name, ...props }: CheckboxProps) => {
  if (name) {
    return <DfCheckboxWithForm name={name} {...props} />;
  }

  return <BasicDfCheckbox {...props} />;
};

const BasicDfCheckbox = ({
  initialValue,
  onValueChange,
  disabled,
}: CheckboxProps) => {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={() => {
        Keyboard.dismiss();
        if (!disabled && onValueChange) {
          onValueChange(!initialValue);
        }
      }}
      disabled={disabled}
      hitSlop={4}
    >
      {initialValue ? (
        <CheckSquare size={22} color={colors.accent} />
      ) : (
        <Square size={22} color={colors.textFaint} />
      )}
    </Pressable>
  );
};

interface DfCheckboxWithFormProps extends Omit<CheckboxProps, "name"> {
  name: string;
}

const DfCheckboxWithForm = ({
  name,
  label,
  initialValue = false,
  onValueChange,
  ...props
}: DfCheckboxWithFormProps) => {
  const { colors } = useAppTheme();
  const { control } = useFormContext();

  return (
    <View style={styles.wrapper}>
      {label && (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      )}
      <Controller
        control={control}
        name={name}
        defaultValue={initialValue}
        render={({ field: { onChange, value } }) => (
          <BasicDfCheckbox
            initialValue={value}
            onValueChange={(newValue) => {
              onChange(newValue);
              onValueChange?.(newValue);
            }}
            {...props}
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
});
