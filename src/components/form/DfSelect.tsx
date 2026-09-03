import { ChevronDownIcon } from "@/components/ui/icon";
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectIcon,
  SelectInput,
  SelectItem,
  SelectPortal,
  SelectScrollView,
  SelectTrigger,
} from "@/components/ui/select";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import {
  Controller,
  useFormContext,
  type RegisterOptions,
} from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { useFieldRegistration } from "./FormScrollContext";

export type SelectOption = {
  label: string;
  value: string;
};

export interface DfSelectProps {
  name: string;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  onValueChange?: (value: string) => void;
  rules?: RegisterOptions;
  disabled?: boolean;
}

export const DfSelect = ({
  name,
  options,
  label,
  placeholder,
  onValueChange,
  rules,
  disabled = false,
}: DfSelectProps) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { control, clearErrors } = useFormContext();
  const fieldRef = useFieldRegistration(name);

  const resolvedPlaceholder = placeholder ?? t("select_placeholder");

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        const currentLabel = options.find((o) => o.value === value)?.label;

        return (
          <View ref={fieldRef} style={styles.wrapper}>
            {label && (
              <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
            )}

            <Select
              defaultValue={value}
              initialLabel={currentLabel}
              onValueChange={(newValue) => {
                onChange(newValue);
                onValueChange?.(newValue);
                clearErrors(name);
              }}
              isDisabled={disabled}
            >
              <SelectTrigger
                style={[
                  styles.trigger,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  error && styles.triggerError,
                  disabled && { backgroundColor: colors.surfaceMuted },
                ]}
                className=""
              >
                <SelectInput
                  placeholder={resolvedPlaceholder}
                  style={[styles.triggerInput, { color: colors.text }]}
                  placeholderTextColor={colors.textFaint}
                  className="placeholder:text-gray-400 leading-normal"
                />
                <SelectIcon className="absolute right-3" as={ChevronDownIcon} />
              </SelectTrigger>

              <SelectPortal>
                <SelectBackdrop />
                <SelectContent>
                  <SelectDragIndicatorWrapper>
                    <SelectDragIndicator />
                  </SelectDragIndicatorWrapper>
                  <SelectScrollView>
                    {options.map((option) => (
                      <SelectItem
                        key={option.value}
                        label={option.label}
                        value={option.value}
                      />
                    ))}
                  </SelectScrollView>
                </SelectContent>
              </SelectPortal>
            </Select>
          </View>
        );
      }}
    />
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
  trigger: {
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  triggerInput: {
    fontSize: 16,
    fontFamily: theme.fonts.regular,
    flex: 1,
    height: "100%",
    padding: 0,
    paddingRight: 28,
    textAlignVertical: "center",
  },
  triggerError: {
    borderColor: theme.colors.error,
  },
});
