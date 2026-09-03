import { useAppTheme } from "@/src/components/ThemeContext";
import { resolveFontFamily, resolveFontWeight } from "@/src/styles";
import { hexToRgba } from "@/src/utils/utils";
import React from "react";
import {
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  StyleSheet,
} from "react-native";

export type TextInputProps = RNTextInputProps;

/**
 * Drop-in replacement di RN TextInput che risolve automaticamente la fontFamily.
 *
 * `includeFontPadding: false` come nel `Text`, e per lo stesso motivo: dentro un
 * campo di altezza fissa il testo scritto finiva piu' in basso del segnaposto
 * di un'icona accanto. Vedi il commento in `Text.tsx`.
 */
export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(
  ({ style, ...props }, ref) => {
    const { colors } = useAppTheme();
    const flat = StyleSheet.flatten(style);

    const weight = resolveFontWeight(flat?.fontWeight) ?? "regular";
    const isItalic = flat?.fontStyle === "italic";
    const fontFamily = resolveFontFamily(weight, isItalic);

    return (
      <RNTextInput
        ref={ref}
        selectionColor={hexToRgba(colors.accent, 0.5)}
        {...props}
        style={[
          { includeFontPadding: false },
          flat,
          {
            fontFamily,
            fontWeight: undefined,
            fontStyle: undefined,
          },
        ]}
      />
    );
  },
);

TextInput.displayName = "TextInput";
