import { resolveFontFamily, resolveFontWeight, theme } from "@/src/styles";
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
 */
export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(
  ({ style, ...props }, ref) => {
    const flat = StyleSheet.flatten(style);

    const weight = resolveFontWeight(flat?.fontWeight) ?? "regular";
    const isItalic = flat?.fontStyle === "italic";
    const fontFamily = resolveFontFamily(weight, isItalic);

    return (
      <RNTextInput
        ref={ref}
        selectionColor={hexToRgba(theme.colors.primary, 0.5)}
        {...props}
        style={[
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
