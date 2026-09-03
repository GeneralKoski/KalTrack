import {
  useFieldRegistration,
  useFormScrollContext,
} from "@/src/components/form/FormScrollContext";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text, TextInput } from "@/src/components/ui";
import { theme } from "@/src/styles";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Controller,
  useFormContext,
  type RegisterOptions,
} from "react-hook-form";
import { StyleSheet, View } from "react-native";

interface DfDateMaskInputProps {
  name: string;
  label?: string;
  rules?: RegisterOptions;
}

/**
 * Inserisce "/" dopo il 2° e 4° digit.
 * "27"     → "27"
 * "270"    → "27/0"
 * "2709"   → "27/09"
 * "27092"  → "27/09/2"
 * "27092002" → "27/09/2002"
 */
const formatWithSlashes = (digits: string): string => {
  if (digits.length <= 2) {
    if (digits.length === 2) return digits + "/";
    return digits;
  }
  if (digits.length <= 4) {
    return (
      digits.substring(0, 2) +
      "/" +
      digits.substring(2) +
      (digits.length === 4 ? "/" : "")
    );
  }
  return (
    digits.substring(0, 2) +
    "/" +
    digits.substring(2, 4) +
    "/" +
    digits.substring(4)
  );
};

const extractDigits = (text: string): string =>
  text.replace(/[^0-9]/g, "").slice(0, 8);

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1900;

const isLeapYear = (y: number): boolean =>
  (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const getMaxDay = (month: number, year?: number): number => {
  switch (month) {
    case 2:
      return year != null && !isLeapYear(year) ? 28 : 29;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
};

/** Clamp su giorno (01-31), mese (01-12), anno (1900-corrente) e giorno/mese */
const clampDigits = (raw: string): string => {
  if (raw.length < 2) return raw;

  // --- Giorno ---
  let day = Math.min(Math.max(parseInt(raw.substring(0, 2)), 1), 31);
  let result = day.toString().padStart(2, "0");

  if (raw.length < 4) return result + raw.substring(2);

  // --- Mese ---
  let month = Math.min(Math.max(parseInt(raw.substring(2, 4)), 1), 12);
  result += month.toString().padStart(2, "0");

  // Ri-clamp giorno in base al mese (senza anno → feb max 29)
  const maxDay = getMaxDay(month);
  if (day > maxDay) {
    day = maxDay;
    result = day.toString().padStart(2, "0") + result.substring(2);
  }

  if (raw.length < 8) return result + raw.substring(4);

  // --- Anno ---
  let year = Math.min(
    Math.max(parseInt(raw.substring(4, 8)), MIN_YEAR),
    CURRENT_YEAR,
  );
  result += year.toString().padStart(4, "0");

  // Ri-clamp 29 feb se anno non bisestile
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    result = "28" + result.substring(2);
  }

  return result;
};

/** DDMMYYYY → YYYY-MM-DD */
const digitsToApiDate = (digits: string): string | null => {
  if (digits.length !== 8) return null;
  return `${digits.substring(4, 8)}-${digits.substring(
    2,
    4,
  )}-${digits.substring(0, 2)}`;
};

/** Accetta YYYY-MM-DD, DD/MM/YYYY o Date → restituisce "DDMMYYYY" */
const parseValueToDigits = (
  value: Date | string | null | undefined,
): string => {
  if (!value) return "";

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    const d = value.getDate().toString().padStart(2, "0");
    const m = (value.getMonth() + 1).toString().padStart(2, "0");
    const y = value.getFullYear().toString();
    return `${d}${m}${y}`;
  }

  const str = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [yyyy, mm, dd] = str.substring(0, 10).split("-");
    return `${dd}${mm}${yyyy}`;
  }

  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    return str.replace(/\//g, "");
  }

  return "";
};

export const DfDateMaskInput = ({
  name,
  label,
  rules,
}: DfDateMaskInputProps) => {
  const { colors } = useAppTheme();
  const { control, clearErrors, watch } = useFormContext();
  const fieldRef = useFieldRegistration(name);
  const formScroll = useFormScrollContext();

  const [displayValue, setDisplayValue] = useState("");
  const isUserInputRef = useRef(false);

  // Sincronizza da valore esterno (initialValues / reset)
  const formValue = watch(name);
  useEffect(() => {
    if (isUserInputRef.current) {
      isUserInputRef.current = false;
      return;
    }
    const digits = parseValueToDigits(formValue);
    setDisplayValue(formatWithSlashes(digits));
  }, [formValue]);

  // Durante la digitazione: auto-slash e clamp per validare numeri massimi
  const handleChange = useCallback(
    (text: string, formOnChange: (value: any) => void) => {
      let digits = extractDigits(text);

      // Se l'utente ha cancellato uno slash, cancelliamo anche il digit precedente
      if (displayValue.length > text.length) {
        const deletedIdx = text.length;
        if (displayValue[deletedIdx] === "/") {
          digits = digits.slice(0, -1);
        }
      }

      // Validazione e clamping durante la digitazione (es. 35 -> 31, 15 -> 12)
      const validated = clampDigits(digits);
      const formatted = formatWithSlashes(validated);

      isUserInputRef.current = true;
      setDisplayValue(formatted);
      formOnChange(digitsToApiDate(validated));
    },
    [displayValue],
  );

  // All'uscita dal campo: valida e correggi i valori
  const handleBlur = useCallback(
    (formOnChange: (value: any) => void) => {
      const digits = extractDigits(displayValue);
      if (digits.length === 0) return;

      const validated = clampDigits(digits);
      const formatted = formatWithSlashes(validated);

      isUserInputRef.current = true;
      setDisplayValue(formatted);
      formOnChange(digitsToApiDate(validated));
    },
    [displayValue],
  );

  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { onChange }, fieldState: { error } }) => (
        <View ref={fieldRef} style={styles.wrapper}>
          {label && (
            <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
          )}
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              error && styles.inputError,
            ]}
            placeholder="DD/MM/YYYY"
            keyboardType="number-pad"
            value={displayValue}
            onChangeText={(text) => handleChange(text, onChange)}
            onFocus={() => {
              clearErrors(name);
              formScroll?.setFocusedField(name);
            }}
            onBlur={() => handleBlur(onChange)}
            maxLength={10}
            selection={{
              start: displayValue.length,
              end: displayValue.length,
            }}
          />
        </View>
      )}
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
});
