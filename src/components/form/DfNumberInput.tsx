import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { theme } from "@/src/styles";
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

/**
 * Formatta un numero con separatore migliaia (punto) e decimali (virgola) - formato italiano
 */
const formatNumber = (value: string, decimals: number): string => {
  if (!value) return "";

  // Rimuovi tutti i caratteri non numerici tranne la virgola
  let cleaned = value.replace(/[^\d,]/g, "");

  // Gestisci il caso di più virgole (tieni solo la prima)
  const parts = cleaned.split(",");
  if (parts.length > 2) {
    cleaned = parts[0] + "," + parts.slice(1).join("");
  }

  // Separa parte intera e decimale
  const [integerPart, decimalPart] = cleaned.split(",");

  // Rimuovi zeri iniziali dalla parte intera (ma mantieni almeno uno zero)
  const cleanedInteger = integerPart.replace(/^0+/, "") || "0";

  // Formatta la parte intera con separatore migliaia (punto)
  const formattedInteger = cleanedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  // Tronca i decimali al numero massimo consentito
  if (decimalPart !== undefined) {
    const truncatedDecimal = decimalPart.slice(0, decimals);
    return `${formattedInteger},${truncatedDecimal}`;
  }

  return formattedInteger;
};

/**
 * Converte il valore formattato in numero (per il form)
 * Ritorna una stringa per compatibilità con il backend
 */
const parseToNumber = (formattedValue: string): string => {
  if (!formattedValue) return "";

  // Rimuovi i punti (separatori migliaia) e sostituisci virgola con punto
  const normalized = formattedValue.replace(/\./g, "").replace(",", ".");

  return normalized;
};

/**
 * Converte un numero/stringa in formato display (italiano)
 */
const numberToDisplay = (
  value: string | number | undefined | null,
  decimals: number,
): string => {
  if (value === undefined || value === null || value === "") return "";

  const numStr = typeof value === "number" ? value.toString() : value;

  // Se il valore è già nel formato italiano (con virgola), formattalo direttamente
  if (numStr.includes(",")) {
    return formatNumber(numStr, decimals);
  }

  // Altrimenti converti dal formato con punto decimale
  const formatted = numStr.replace(".", ",");
  return formatNumber(formatted, decimals);
};

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

  const InputComponent = isInBottomSheet ? BottomSheetTextInput : TextInput;

  return (
    <View style={[styles.wrapper, fieldContainerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Controller
        control={control}
        name={name}
        rules={rules}
        render={({
          field: { onChange, onBlur, value },
          fieldState: { error },
        }) => {
          // Converti il valore del form in display
          const displayValue = numberToDisplay(value, decimals);

          const handleChangeText = (text: string) => {
            // Formatta per il display
            const formatted = formatNumber(text, decimals);
            // Converti in numero per il form
            const numericValue = parseToNumber(formatted);
            onChange(numericValue);
          };

          if (hidden) {
            return <></>;
          }

          return (
            <>
              <View style={styles.inputWrapper}>
                {showCurrency && currencyPosition === "left" && (
                  <Text style={[styles.currencySymbol, styles.currencyLeft]}>
                    {currencySymbol}
                  </Text>
                )}
                <InputComponent
                  style={[
                    styles.input,
                    { borderColor: colors.border },
                    readOnly && styles.inputReadOnly,
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
                  placeholderTextColor={theme.colors.gray400}
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
                  <Text style={[styles.currencySymbol, styles.currencyRight]}>
                    {currencySymbol}
                  </Text>
                )}
              </View>
              {error && (
                <Text style={styles.errorText}>
                  {error.message?.toString()}
                </Text>
              )}
            </>
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
    color: theme.colors.gray900,
    marginBottom: 6,
  },
  inputWrapper: {
    position: "relative",
    justifyContent: "center",
  },
  input: {
    fontSize: 16,
    color: theme.colors.gray900,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  inputReadOnly: {
    backgroundColor: theme.colors.gray100,
    color: theme.colors.gray500,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.error,
    marginTop: 4,
  },
  currencySymbol: {
    position: "absolute",
    fontSize: 16,
    color: theme.colors.gray500,
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
