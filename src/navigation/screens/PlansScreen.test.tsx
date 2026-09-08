import { PlansScreen } from "@/src/navigation/screens/PlansScreen";
import { i18n } from "@/src/i18n";
import React from "react";
import { Text as RNText, TouchableOpacity } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

let mockToken: string | null = null;
jest.mock("@/src/stores/accountStore", () => ({
  useAccountStore: (selector: (state: { token: string | null }) => unknown) =>
    selector({ token: mockToken }),
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

/*
 * Il barrel `kal` porta PhotoField -> DfBottomSheet -> gorhom -> reanimated,
 * radioattivo sotto Jest (vedi SessionScreen.test.tsx). PlansScreen non usa
 * PhotoField, ma importare QUALUNQUE cosa dal barrel esegue comunque tutto il
 * suo index: si mockano con implementazioni vere e minime, non passthrough,
 * perche' qui interessa DAVVERO cosa si legge e dove porta il tocco.
 */
jest.mock("@/src/components/kal", () => {
  // jest issa jest.mock in cima al file: la fabbrica non puo' leggere i
  // moduli importati sotto, e deve richiederseli da se'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require("react-native");
  return {
    ScreenBackground: () => null,
    SectionLabel: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(RN.Text, null, children),
    HeroPanel: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(RN.View, null, children),
    HeroDivider: () => null,
    ListGroup: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(RN.View, null, children),
    ListRow: ({
      label,
      detail,
      onPress,
    }: {
      label: string;
      detail?: string;
      onPress?: () => void;
    }) =>
      ReactLib.createElement(
        RN.TouchableOpacity,
        { onPress },
        ReactLib.createElement(RN.Text, null, label),
        detail ? ReactLib.createElement(RN.Text, null, detail) : null,
      ),
  };
});

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockToken = null;
});

const allText = (renderer: ReactTestRenderer): string =>
  renderer.root
    .findAllByType(RNText)
    .flatMap((node) =>
      Array.isArray(node.props.children) ? node.props.children : [node.props.children],
    )
    .filter((v) => typeof v === "string")
    .join(" | ");

describe("PlansScreen, il motivo giusto per chi arriva", () => {
  /**
   * Important 6: `ai_enabled` nasce ACCESO, quindi senza account e' la
   * popolazione piu' grande che tocca questo cancello - e per lei il rimedio
   * vero e oggi disponibile e' accedere, non abbonarsi.
   */
  it("senza account dice di accedere, non parla di abbonamento", () => {
    mockToken = null;
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<PlansScreen />);
    });

    const text = allText(renderer);
    expect(text).toContain(i18n.t("plans.no_account_title"));
    expect(text).toContain(i18n.t("plans.no_account_action"));
    expect(text).not.toContain(i18n.t("plans.not_available"));

    // Il primo `TouchableOpacity` e' il chevron indietro dell'intestazione;
    // la riga "accedi" e' la seconda.
    const [, signInRow] = renderer.root.findAllByType(TouchableOpacity);
    act(() => {
      signInRow.props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith("Friends");
  });

  it("con account senza diritto parla di abbonamento, non di accedere", () => {
    mockToken = "un-token";
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<PlansScreen />);
    });

    const text = allText(renderer);
    expect(text).toContain(i18n.t("plans.hero_title"));
    expect(text).toContain(i18n.t("plans.not_available"));
    expect(text).not.toContain(i18n.t("plans.no_account_action"));
  });
});
