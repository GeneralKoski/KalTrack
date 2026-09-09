import { OnboardingTextField } from "@/src/containers/onboarding/OnboardingFields";
import React from "react";
import { TextInput as RNTextInput } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/*
 * Il modulo porta `DfBottomSheet` per il picker, e gorhom/reanimated non si
 * inizializzano sotto jest: qui si prova il campo di testo, non il foglio.
 */
jest.mock("@/src/components/DfBottomSheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    DfBottomSheet: ReactLib.forwardRef(
      ({ children }: { children: React.ReactNode }, _ref: unknown) =>
        ReactLib.createElement(View, null, children),
    ),
  };
});

/**
 * Altezza e peso stanno in cima a `OnboardingProfileScreen`, e ogni tasto
 * ricalcola il fabbisogno e ridisegna l'hero prima di restituire il carattere:
 * e' il campo con il render piu' pesante dell'app, misurato a 7-8 ms di
 * mediana in jest.
 */
const campo = (renderer: ReactTestRenderer) =>
  renderer.root.findByType(RNTextInput);

describe("OnboardingTextField", () => {
  it("tiene quel che si digita anche se la schermata ridisegna in ritardo", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <OnboardingTextField value="" onChangeText={() => {}} />,
      );
    });

    act(() => {
      campo(renderer).props.onChangeText("17");
    });
    act(() => {
      campo(renderer).props.onChangeText("175");
    });

    // Il ricalcolo del fabbisogno ha chiuso il suo giro ora, fermo a un tasto fa.
    act(() => {
      renderer.update(
        <OnboardingTextField value="17" onChangeText={() => {}} />,
      );
    });

    expect(campo(renderer).props.value).toBe("175");
  });

  /**
   * Il peso salvato si rilegge dal database a schermata gia' montata
   * (`latestWeight`, col separatore della lingua): quel valore non viene dal
   * campo e deve entrarci.
   */
  it("accoglie il valore che arriva dal database dopo il montaggio", () => {
    let renderer!: ReactTestRenderer;
    const render = (value: string) => (
      <OnboardingTextField value={value} onChangeText={() => {}} />
    );
    act(() => {
      renderer = create(render(""));
    });

    act(() => {
      renderer.update(render("76,1"));
    });

    expect(campo(renderer).props.value).toBe("76,1");
  });
});
