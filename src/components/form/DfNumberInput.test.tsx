import { DfNumberInput } from "@/src/components/form/DfNumberInput";
import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import {
  StyleSheet,
  TextInput as RNTextInput,
  type TextStyle,
} from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/**
 * Il proprietario ha segnalato un difetto di font che non c'era (era la
 * riscrittura del campo, vedi `DraftTextInput`), e intanto **questo** c'era
 * davvero: dentro un foglio il campo deve essere il `BottomSheetTextInput` di
 * gorhom, o la tastiera se lo mangia, e quello e' un `TextInput` di RN nudo -
 * nessuno gli risolve Poppins, e i numeri uscivano nel font di sistema.
 *
 * Non e' il difetto segnalato: e' costante per istanza, non tremola a ogni
 * tasto. Ed e' un ramo che oggi nessun chiamante accende (`isInBottomSheet`
 * non e' passato da nessuna parte in `src/`), quindi si correggeva prima che
 * qualcuno lo raggiungesse.
 */
jest.mock("@gorhom/bottom-sheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextInput } = require("react-native");
  return { BottomSheetTextInput: TextInput };
});

const Modulo: React.FC<{ isInBottomSheet?: boolean }> = ({
  isInBottomSheet,
}) => {
  const form = useForm({ defaultValues: { grammi: 100 } });
  return (
    <FormProvider {...form}>
      <DfNumberInput name="grammi" isInBottomSheet={isInBottomSheet} />
    </FormProvider>
  );
};

const font = (renderer: ReactTestRenderer): TextStyle | undefined =>
  StyleSheet.flatten(
    renderer.root.findByType(RNTextInput).props.style as TextStyle,
  );

describe("DfNumberInput, il font", () => {
  it("risolve Poppins anche dentro un foglio", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Modulo isInBottomSheet />);
    });

    expect(font(renderer)?.fontFamily).toBe("Poppins-Regular");
    // Il padding del font arriva con lo stesso stile: dentro un campo alto
    // fisso il testo finirebbe piu' in basso del segnaposto accanto.
    expect(font(renderer)?.includeFontPadding).toBe(false);
  });

  it("e lo risolve fuori da un foglio, dove ci pensa `ui/TextInput`", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Modulo />);
    });

    expect(font(renderer)?.fontFamily).toBe("Poppins-Regular");
  });
});
