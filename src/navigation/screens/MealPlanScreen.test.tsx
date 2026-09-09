import { MealPlanScreen } from "@/src/navigation/screens/MealPlanScreen";
import React from "react";
import { TouchableOpacity } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

let mockAccountState = {
  token: null as string | null,
  aiEnabled: null as boolean | null,
  isHydrated: true,
};
jest.mock("@/src/stores/accountStore", () => ({
  useAccountStore: (
    selector: (state: {
      token: string | null;
      aiEnabled: boolean | null;
      isHydrated: boolean;
    }) => unknown,
  ) => selector(mockAccountState),
}));

jest.mock("@react-navigation/native", () => {
  // jest issa jest.mock in cima al file: la fabbrica non puo' leggere il
  // modulo React importato sotto, e deve richiederselo da se'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  return {
    useNavigation: () => ({ navigate: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactLib.useEffect(() => effect(), []);
    },
  };
});

/*
 * `DfAlert` porta il modulo gluestack ESM `alert-dialog`, che il transform
 * di Jest non copre (vedi SessionScreen.test.tsx). Il barrel `kal` porta la
 * catena reanimated/@gorhom. Nessuno dei due c'entra con quel che si
 * verifica qui - se il bottone apre il modale o naviga ai piani.
 */
jest.mock("@/src/components/DfAlert", () => ({ DfAlert: () => null }));
jest.mock("@/src/components/kal", () => ({ ScreenBackground: () => null }));
jest.mock("@/src/containers/diary/AddEntrySheet", () => ({
  AddEntrySheet: () => null,
}));
jest.mock("@/src/containers/planning/PlanDayColumn", () => ({
  PlanDayColumn: () => null,
}));
jest.mock("@/src/containers/recipes/QuantityPrompt", () => ({
  QuantityPrompt: () => null,
}));
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));

// Il modale e' l'oggetto dell'osservazione: si registra la prop `isOpen`
// che riceve a ogni render invece di montarlo per davvero.
const mockGenerateMealPlanModalProps = jest.fn();
jest.mock("@/src/containers/planning/GenerateMealPlanModal", () => ({
  GenerateMealPlanModal: (props: Record<string, unknown>) => {
    mockGenerateMealPlanModalProps(props);
    return null;
  },
}));

jest.mock("@/src/db/queries/diary", () => ({
  listAllMealTypes: jest.fn(async () => []),
}));
jest.mock("@/src/db/queries/mealPlan", () => ({
  listPlanEntries: jest.fn(async () => []),
  isPlanApplied: jest.fn(async () => false),
  addPlanEntry: jest.fn(),
  applyPlanToDiary: jest.fn(),
  copyPlanDays: jest.fn(),
  deletePlanEntry: jest.fn(),
}));
jest.mock("@/src/db/queries/settings", () => ({
  getTargetsFor: jest.fn(async () => null),
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockGenerateMealPlanModalProps.mockClear();
  mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("MealPlanScreen, il pulsante 'genera piano con IA'", () => {
  /**
   * Ottavo punto d'ingresso trovato dall'audit (non da un grep sul nome):
   * senza il pin, l'intero modale - "genera piano con IA", una chiamata
   * Gemini vera che scrive righe nel piano - potrebbe tornare ungated senza
   * che nessun test se ne accorga, come e' gia' successo due volte al grep.
   */
  it("senza diritto AI naviga ai piani e non apre il modale", async () => {
    mockAccountState = { token: null, aiEnabled: null, isHydrated: true };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<MealPlanScreen />);
      await flush();
    });

    const [, sparkles] = renderer.root.findAllByType(TouchableOpacity);
    act(() => {
      sparkles.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Plans");
    const lastCall = mockGenerateMealPlanModalProps.mock.calls.at(-1)?.[0];
    expect(lastCall?.isOpen).toBe(false);

    act(() => {
      renderer.unmount();
    });
  });

  it("con diritto AI apre il modale, senza navigare", async () => {
    mockAccountState = { token: "t", aiEnabled: true, isHydrated: true };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<MealPlanScreen />);
      await flush();
    });

    const [, sparkles] = renderer.root.findAllByType(TouchableOpacity);
    act(() => {
      sparkles.props.onPress();
    });

    expect(mockNavigate).not.toHaveBeenCalledWith("Plans");
    const lastCall = mockGenerateMealPlanModalProps.mock.calls.at(-1)?.[0];
    expect(lastCall?.isOpen).toBe(true);

    act(() => {
      renderer.unmount();
    });
  });
});
