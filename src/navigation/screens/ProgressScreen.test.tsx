import { i18n } from "@/src/i18n";
import { ProgressScreen } from "@/src/navigation/screens/ProgressScreen";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ navigate: mockNavigate }),
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

/*
 * Il barrel `kal` porta `PhotoField` -> `DfBottomSheet` -> @gorhom/bottom-sheet
 * (vedi lo stesso commento in StepsHistoryScreen.test.tsx): fuori tema qui.
 * `ListGroup` resta VERO - e' lui a rendere le tre righe sotto test, e non ha
 * import pesanti (solo ThemeContext/ui/styles).
 */
jest.mock("@/src/components/kal", () => {
  // jest issa jest.mock in cima al file: la fabbrica non puo' leggere i
  // moduli importati sotto, e deve richiederseli da se'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require("react-native");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ListGroup } = require("@/src/components/kal/ListGroup");
  return {
    ScreenBackground: () => null,
    SectionLabel: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(RN.Text, null, children),
    ListGroup,
  };
});

/*
 * Il coach settimanale chiama l'AI e legge l'account: fuori tema qui, si
 * verifica solo il tocco sulla riga delle calorie.
 */
jest.mock("@/src/containers/progress/WeeklyCoachCard", () => ({
  WeeklyCoachCard: () => null,
}));

/*
 * Il foglio di aggiunta ha il suo test (MetricEntrySheet.test.tsx); qui non si
 * preme mai "+", quindi si mocka via come nelle due schermate storico.
 */
jest.mock("@/src/containers/progress/MetricEntrySheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  return {
    MetricEntrySheet: ReactLib.forwardRef(
      (_props: unknown, ref: unknown) => {
        ReactLib.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return null;
      },
    ),
  };
});

jest.mock("@/src/hooks/useFocusData", () => ({
  useFocusData: () => ({
    data: {
      weights: [],
      latestWeight: null,
      stepsByDay: [],
      stepsAverage: null,
      kcalByDay: [],
      kcalAverage: null,
    },
    loading: false,
    reload: jest.fn(),
    refresh: async () => {},
    refreshing: false,
  }),
}));

beforeEach(() => {
  mockNavigate.mockClear();
});

/**
 * F1 della review di fase: l'unica via per raggiungere lo storico calorie e'
 * la callback `onOpen` passata alla riga. Senza questo test si poteva
 * azzerarla (`() => navigate("KcalHistory")` -> `undefined`) e la schermata
 * restava nel codice ma diventava irraggiungibile, con la suite verde.
 */
describe("ProgressScreen, il tocco sulla riga delle calorie", () => {
  it("apre lo storico calorie", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ProgressScreen />);
    });

    const kcalRow = renderer.root.findByProps({
      accessibilityLabel: i18n.t("progress.kcal"),
    });

    act(() => {
      (kcalRow.props as { onPress: () => void }).onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("KcalHistory");

    act(() => {
      renderer.unmount();
    });
  });
});
