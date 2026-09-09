import { Text } from "@/src/components/ui";
import { MetricEntrySheet } from "@/src/containers/progress/MetricEntrySheet";
import { formatDate } from "@/src/utils/dateUtils";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Calendar } from "lucide-react-native";
import React from "react";
import { TextInput as RNTextInput, TouchableOpacity } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/*
 * Il foglio vero passa da @gorhom/bottom-sheet: quel che si vuole verificare
 * qui e' la logica di riempimento di MetricEntrySheet (dalle prop, e il
 * ritorno alla chiusura), non la meccanica del foglio gorhom.
 *
 * Il mock espone `dismiss()` sul ref e la fa richiamare `onDismiss`, cosi'
 * come fa il foglio vero quando si chiude davvero: e' il modo di simulare
 * "il foglio si chiude" senza montare gorhom.
 */
jest.mock("@/src/components/DfBottomSheet", () => {
  // jest issa jest.mock in cima al file, prima di ogni import: la fabbrica
  // non puo' leggere il modulo React importato sotto, e deve richiederselo
  // da se'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    DfBottomSheet: ReactLib.forwardRef(
      (
        { children, onDismiss }: { children: React.ReactNode; onDismiss?: () => void },
        ref: unknown,
      ) => {
        ReactLib.useImperativeHandle(ref, () => ({
          dismiss: () => onDismiss?.(),
        }));
        return ReactLib.createElement(View, null, children);
      },
    ),
  };
});

function dateButtonOf(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.findAllByType(Calendar).length > 0)!;
}

describe("MetricEntrySheet in modalita' modifica", () => {
  it("si riempie da initialDate e initialValue", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MetricEntrySheet
          title="Modifica passi"
          unit="passi"
          initialDate="2026-01-05"
          initialValue={8000}
          onSave={jest.fn()}
        />,
      );
    });

    const input = renderer.root.findByType(RNTextInput);
    expect(input.props.value).toBe("8000");

    const dateButton = dateButtonOf(renderer);
    const dateText = dateButton
      .findAllByType(Text)
      .map((node) => node.props.children)
      .join("");
    expect(dateText).toBe(formatDate("2026-01-05"));
  });

  it("alla chiusura torna a initialDate/initialValue, non al vuoto", async () => {
    let renderer!: ReactTestRenderer;
    const ref = React.createRef<BottomSheetModal>();
    await act(async () => {
      renderer = create(
        <MetricEntrySheet
          ref={ref}
          title="Modifica passi"
          unit="passi"
          initialDate="2026-01-05"
          initialValue={8000}
          onSave={jest.fn()}
        />,
      );
    });

    act(() => {
      renderer.root.findByType(RNTextInput).props.onChangeText("12345");
    });
    expect(renderer.root.findByType(RNTextInput).props.value).toBe("12345");

    // Il foglio si chiude (X, tap fuori, conferma salvataggio...): sempre lo
    // stesso `dismiss()` sul ref, che qui richiama `onDismiss`.
    act(() => {
      ref.current?.dismiss();
    });

    expect(renderer.root.findByType(RNTextInput).props.value).toBe("8000");
  });

  /**
   * Il foglio non si smonta mai fra una modifica e l'altra: e' un `ref`
   * unico, presentato di nuovo per la riga successiva. Il backdrop di gorhom
   * chiude col primo tocco (`pressBehavior` di default e' "close"), quindi non
   * si puo' toccare una riga diversa mentre il foglio e' ancora aperto - ma
   * si chiude su una riga e si riapre su un'altra senza che React smonti mai
   * il componente, e in quel momento le prop cambiano da sole (senza passare
   * da `onDismiss`). Senza l'effetto che le segue, il campo mostrerebbe
   * ancora la riga di prima.
   */
  it("passando a un'altra riga (senza chiudere prima) si riempie con i suoi valori", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MetricEntrySheet
          title="Modifica passi"
          unit="passi"
          initialDate="2026-01-05"
          initialValue={8000}
          onSave={jest.fn()}
        />,
      );
    });
    expect(renderer.root.findByType(RNTextInput).props.value).toBe("8000");

    await act(async () => {
      renderer.update(
        <MetricEntrySheet
          title="Modifica passi"
          unit="passi"
          initialDate="2026-01-06"
          initialValue={9500}
          onSave={jest.fn()}
        />,
      );
    });

    expect(renderer.root.findByType(RNTextInput).props.value).toBe("9500");
    const dateButton = dateButtonOf(renderer);
    const dateText = dateButton
      .findAllByType(Text)
      .map((node) => node.props.children)
      .join("");
    expect(dateText).toBe(formatDate("2026-01-06"));
  });

  it("la data non si puo' toccare", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MetricEntrySheet
          title="Modifica passi"
          unit="passi"
          initialDate="2026-01-05"
          initialValue={8000}
          onSave={jest.fn()}
        />,
      );
    });

    const dateButton = dateButtonOf(renderer);
    expect(dateButton.props.disabled).toBe(true);
    expect(dateButton.props.onPress).toBeUndefined();
  });
});

describe("MetricEntrySheet in modalita' aggiunta (senza prop)", () => {
  it("parte vuota, come prima", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <MetricEntrySheet title="Nuovi passi" unit="passi" onSave={jest.fn()} />,
      );
    });

    const input = renderer.root.findByType(RNTextInput);
    expect(input.props.value).toBe("");

    const dateButton = dateButtonOf(renderer);
    expect(dateButton.props.disabled).toBeFalsy();
    expect(dateButton.props.onPress).toBeInstanceOf(Function);
  });
});
