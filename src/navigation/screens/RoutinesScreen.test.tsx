import { RoutinesScreen } from "@/src/navigation/screens/RoutinesScreen";
import React from "react";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Medium: "medium", Light: "light" },
}));

/*
 * DfAlert porta `components/ui/alert-dialog`, un modulo gluestack ESM che il
 * transform di jest non copre (stesso principio di StepsHistoryScreen.test.tsx):
 * la conferma di cancellazione non c'entra con quel che si verifica qui.
 */
jest.mock("@/src/components/DfAlert", () => ({
  DfAlert: () => null,
}));

jest.mock("@/src/components/kal", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require("react-native");
  return {
    ScreenBackground: () => null,
    EmptyState: ({ message }: { message: string }) =>
      ReactLib.createElement(RN.Text, null, message),
  };
});

/*
 * `react-native-reanimated` lancia all'import sotto Jest (nessuna parte
 * nativa dei worklet inizializzata): senza un mock nessuna schermata che lo
 * importa - RoutinesScreen incluso - puo' anche solo montarsi in un test. Il
 * mock e' minimo apposta: `useSharedValue` torna un oggetto stabile (un
 * useRef), `withTiming`/`runOnJS` non simulano l'animazione o il thread nativo
 * - eseguono subito, com'e' gia' il comportamento "reale" quando non c'e' una
 * UI a 60fps da rispettare in un test. Il gesto in se' (react-native-gesture-
 * handler) resta VERO: solo la libreria di animazione sotto e' rimpiazzata.
 */
jest.mock("react-native-reanimated", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require("react-native");
  return {
    __esModule: true,
    default: {
      View: RN.View,
      createAnimatedComponent: (Component: unknown) => Component,
    },
    useSharedValue: (initial: unknown) =>
      ReactLib.useRef({ value: initial }).current,
    useAnimatedReaction: () => {},
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useEvent: () => ({}),
    withTiming: (value: unknown) => value,
    runOnJS:
      (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) =>
        fn(...args),
  };
});

const mockReorderRoutines = jest.fn(async (_ids: string[]) => {});
jest.mock("@/src/db/queries/workouts", () => ({
  listRoutines: jest.fn(async () => []),
  listRoutineDays: jest.fn(async () => []),
  activateRoutine: jest.fn(async () => {}),
  deleteRoutine: jest.fn(async () => {}),
  reorderRoutines: (ids: string[]) => mockReorderRoutines(ids),
}));

type RoutineEntry = {
  routine: {
    id: string;
    name: string;
    is_active: number;
    notes: string | null;
    generated_by_ai: number;
    position: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  };
  dayCount: number;
};

function entry(id: string, name: string, position: number): RoutineEntry {
  return {
    routine: {
      id,
      name,
      is_active: 0,
      notes: null,
      generated_by_ai: 0,
      position,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
    },
    dayCount: 1,
  };
}

let mockData: RoutineEntry[] = [];
jest.mock("@/src/hooks/useFocusData", () => ({
  useFocusData: () => ({
    data: mockData,
    loading: false,
    reload: jest.fn(),
    refresh: async () => {},
    refreshing: false,
  }),
}));

interface GestureHandlers {
  onStart?: () => void;
  onUpdate?: (e: { translationY: number }) => void;
  onFinalize?: () => void;
}

beforeEach(() => {
  mockReorderRoutines.mockClear();
  mockData = [entry("r1", "Push", 0), entry("r2", "Pull", 1)];
});

/**
 * F2 della review di fase (meta' B): `handleCommit` chiama `reorderRoutines`
 * con l'ordine ricevuto dal gesto. Sostituendo quella chiamata con
 * `Promise.resolve()` - la mutazione descritta nella review - l'ordine si
 * riordina solo a schermo e non arriva mai al database, con la suite verde.
 *
 * Un gesto non gira in jest (`TODO.md` § 6.1): qui non si simula un
 * trascinamento col dito, si guida il CABLAGGIO gia' costruito dal componente
 * - gli stessi handler che `Gesture.Pan()` registra e che `GestureDetector`
 * riceve - fino al punto in cui produce un ordine diverso, e si verifica che
 * quell'ordine arrivi alla query. Il calcolo dello scambio (`movePosition`) e
 * la scrittura (`reorderRoutines`) hanno gia' i loro test; qui si pinna solo
 * che i due siano CONNESSI.
 */
describe("RoutinesScreen, il commit del trascinamento", () => {
  it("chiama reorderRoutines con l'ordine prodotto dal gesto", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<RoutinesScreen />);
    });

    // Primo giro: le righe sono nel flusso, e la prima porta l'onLayout che
    // misura l'altezza e fa passare l'elenco alle righe trascinabili.
    const [layoutTarget] = renderer.root
      .findAllByType(View)
      .filter((v) => typeof v.props.onLayout === "function");
    act(() => {
      (
        layoutTarget.props as { onLayout: (e: unknown) => void }
      ).onLayout({ nativeEvent: { layout: { height: 60 } } });
    });

    const detectors = renderer.root.findAllByType(GestureDetector);
    expect(detectors.length).toBe(2);

    // Il primo gesto e' quello della prima riga (Push, posizione 0).
    const handlers = (
      detectors[0].props as { gesture: { handlers: GestureHandlers } }
    ).gesture.handlers;

    act(() => {
      handlers.onStart?.();
    });
    // Un'altezza di riga verso il basso: dalla posizione 0 alla 1, uno scambio
    // con l'unica altra riga (due schede in tutto).
    act(() => {
      handlers.onUpdate?.({ translationY: 60 });
    });
    act(() => {
      handlers.onFinalize?.();
    });

    expect(mockReorderRoutines).toHaveBeenCalledWith(["r2", "r1"]);

    act(() => {
      renderer.unmount();
    });
  });
});
