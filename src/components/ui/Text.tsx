import { resolveFontFamily, resolveFontWeight } from "@/src/styles";
import {
  Text as RNText,
  type TextProps as RNTextProps,
  StyleSheet,
} from "react-native";

export type TextProps = RNTextProps;

/**
 * Drop-in replacement di RN Text che risolve automaticamente la fontFamily.
 *
 * **`includeFontPadding: false` e' il default, e vale per ogni testo dell'app.**
 * Su Android il testo si porta dietro un padding sopra e sotto la riga, dentro
 * la sua cassa: la cassa e' piu' alta del glifo, e un `alignItems: "center"`
 * centra la cassa, non la parola. Cosi' ogni testo affiancato a qualcos'altro -
 * l'etichetta di un bottone accanto alla sua icona, il titolo accanto alla
 * freccia dell'indietro, il valore accanto al pallino di una riga - risulta
 * qualche pixel piu' in basso di quel che gli sta a fianco.
 *
 * Era rimediato a mano in sei file diversi, cioe' solo dove qualcuno se ne era
 * accorto. Sta qui perche' l'allineamento verticale non e' una scelta di una
 * schermata: si applica prima di `style`, quindi chi ha un motivo per rivolere
 * il padding lo riaccende passando `includeFontPadding: true`.
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
}
