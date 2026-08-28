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
        <CheckSquare size={22} color={theme.colors.primaryDark} />
      ) : (
        <Square size={22} color={theme.colors.gray400} />
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
  const { control } = useFormContext();

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Controller
        control={control}
        name={name}
        defaultValue={initialValue}
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <>
            <BasicDfCheckbox
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
