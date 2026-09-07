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
 *
 * **Correttore e compilazione automatica sono spenti di serie**, e chi li vuole
 * li riaccende. Il rapporto e' rovesciato rispetto a quel che RN presume: in
 * quest'app quasi tutto quel che si scrive e' un nome (un alimento, un
 * esercizio, una ricetta, un promemoria) o un numero, e su un nome il
 * correttore di Android fa danni - "lat machine" diventa "la machine", "skyr"
 * diventa "sky" alla battuta dello spazio. L'autofill di Google fa di peggio:
 * propone quel che ha salvato altrove, ed e' il "mi precompila roba a caso"
 * per cui questa regola esiste.
 *
 * Le eccezioni sono i campi di prosa, dove il correttore aiuta davvero (note
 * della ricetta, bio, istruzioni di un esercizio, note per il piano, il campo
 * dell'assistente) e le credenziali, dove l'autofill serve ai gestori di
 * password (`AccountForm`): tutti passano `autoCorrect`/`autoComplete`
 * espliciti, e per questo i due default stanno PRIMA di `{...props}`.
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
        autoCorrect={false}
        autoComplete="off"
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
