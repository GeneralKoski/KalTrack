import { resolveFontFamily, resolveFontWeight } from "@/src/styles";
import {
  Text as RNText,
  type TextProps as RNTextProps,
  StyleSheet,
} from "react-native";

export type TextProps = RNTextProps;

/**
 * Drop-in replacement di RN Text che risolve automaticamente la fontFamily.
 */
export function Text({ style, ...props }: TextProps) {
  const flat = StyleSheet.flatten(style);

  const weight = resolveFontWeight(flat?.fontWeight) ?? "regular";
  const isItalic = flat?.fontStyle === "italic";
  const fontFamily = resolveFontFamily(weight, isItalic);

  return (
    <RNText
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
}
