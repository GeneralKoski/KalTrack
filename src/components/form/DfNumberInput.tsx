import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import {
  formatNumber,
  numberToDisplay,
  parseToNumber,
} from "@/src/components/form/numberFormat";
import { theme } from "@/src/styles";
import { decimalSeparator } from "@/src/utils/number";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import {
  Controller,
  useFormContext,
  type RegisterOptions,
} from "react-hook-form";
import { StyleSheet, TextInputProps, View, ViewStyle } from "react-native";

interface DfNumberInputProps extends Omit<
  TextInputProps,
  "value" | "onChangeText"
> {
  name: string;
  label?: string;
  placeholder?: string;
  hidden?: boolean;
  readOnly?: boolean;
  fieldContainerStyle?: ViewStyle;
  isInBottomSheet?: boolean;
  rules?: RegisterOptions;
  /** Numero di decimali consentiti (default: 2) */
  decimals?: number;
  /** Mostra simbolo euro */
  showCurrency?: boolean;
  /** Posizione simbolo euro: 'left' o 'right' (default: 'left') */
  currencyPosition?: "left" | "right";
  /** Simbolo valuta (default: '€') */
  currencySymbol?: string;
}


export const DfNumberInput = ({
  name,
  label,
  placeholder,
  hidden,
  readOnly,
  style,
  fieldContainerStyle,
  isInBottomSheet = false,
  rules,
  decimals = 2,
  showCurrency = false,
  currencyPosition = "left",
  currencySymbol = "€",
  ...props
}: DfNumberInputProps) => {
  const { colors } = useAppTheme();
  const { control, clearErrors } = useFormContext();
  /*
    Il separatore che si VEDE segue la lingua: la virgola stava scritta dentro
    `numberFormat`, e chi usa l'app in inglese si vedeva riscrivere "3.2" in
    "3,2" mentre digitava. Quel che finisce nel form resta il punto in tutti e
    due i casi - e' il contratto di `parseToNumber`.
  */
  const separator = decimalSeparator();

  const InputComponent = isInBottomSheet ? BottomSheetTextInput : TextInput;

  return (
    <View style={[styles.wrapper, fieldContainerStyle]}>
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
        }) => {
          // Converti il valore del form in display
          const displayValue = numberToDisplay(value, decimals, separator);

          const handleChangeText = (text: string) => {
            // Formatta per il display
            const formatted = formatNumber(text, decimals, separator);
            // Converti in numero per il form
            const numericValue = parseToNumber(formatted);
            onChange(numericValue);
          };

          if (hidden) {
            return <></>;
          }

          return (
            <View style={styles.inputWrapper}>
              {showCurrency && currencyPosition === "left" && (
                <Text
                  style={[
                    styles.currencySymbol,
                    styles.currencyLeft,
                    { color: colors.textMuted },
                  ]}
                >
                  {currencySymbol}
                </Text>
              )}
              <InputComponent
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  readOnly && {
                    backgroundColor: colors.surfaceMuted,
                    color: colors.textMuted,
                  },
                  error && styles.inputError,
                  showCurrency &&
                    currencyPosition === "left" &&
                    styles.inputWithCurrencyLeft,
                  showCurrency &&
                    currencyPosition === "right" &&
                    styles.inputWithCurrencyRight,
                  style,
                ]}
                placeholder={placeholder}
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                onChangeText={handleChangeText}
                onBlur={onBlur}
                value={displayValue}
                onFocus={() => clearErrors(name)}
                editable={!readOnly}
                keyboardType="decimal-pad"
                {...props}
              />
              {showCurrency && currencyPosition === "right" && (
                <Text
                  style={[
                    styles.currencySymbol,
                    styles.currencyRight,
                    { color: colors.textMuted },
                  ]}
                >
                  {currencySymbol}
                </Text>
              )}
            </View>
          );
        }}
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
  inputWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  input: {
    fontSize: 16,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  currencySymbol: {
    position: "absolute",
    fontSize: 16,
    fontWeight: "500",
    zIndex: 1,
  },
  currencyLeft: {
    left: 14,
  },
  currencyRight: {
    right: 14,
  },
  inputWithCurrencyLeft: {
    paddingLeft: 30,
  },
  inputWithCurrencyRight: {
    paddingRight: 30,
  },
});
