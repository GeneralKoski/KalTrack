import { CaloriesHistoryScreen } from "@/src/navigation/screens/CaloriesHistoryScreen";
import type { DayKcal } from "@/src/db/queries/diary";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ goBack: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Stesso principio di StepsHistoryScreen.test.tsx: il barrel `kal` porta
// PhotoField -> DfBottomSheet -> gorhom, fuori tema qui.
jest.mock("@/src/components/kal", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require("react-native");
  return {
    ScreenBackground: () => null,
    SectionLabel: ({ children }: { children: React.ReactNode }) =>
      ReactLib.createElement(RN.Text, null, children),
    EmptyState: ({ message }: { message: string }) =>
      ReactLib.createElement(RN.Text, null, message),
    NO_DELTA: "—",
  };
});

/*
 * L'hero non c'entra con quel che si verifica qui (il tocco non esiste, la
 * selezione nemmeno): interessano le prop con cui la schermata lo apre, non
 * il grafico. Stesso principio del mock in StepsHistoryScreen.test.tsx.
 */
const mockHeroProps = jest.fn();
jest.mock("@/src/containers/progress/MetricHistoryHero", () => ({
  MetricHistoryHero: (props: Record<string, unknown>) => {
    mockHeroProps(props);
    return null;
  },
}));

/*
 * `HistoryList` e' presentazionale e ha il suo test (HistoryList.test.tsx).
 * Qui interessa solo CON QUALI prop la schermata lo chiama: nessuna
 * selezione, nessun tocco - la definizione di questa schermata.
 */
const mockHistoryListProps = jest.fn();
jest.mock("@/src/containers/progress/HistoryList", () => ({
  HistoryList: (props: Record<string, unknown>) => {
    mockHistoryListProps(props);
    return null;
  },
}));

let mockRows: DayKcal[] = [];
jest.mock("@/src/hooks/useFocusData", () => ({
  useFocusData: () => ({
    data: mockRows,
    loading: false,
    reload: jest.fn(),
    refresh: async () => {},
    refreshing: false,
  }),
}));

function day(date: string, kcal: number): DayKcal {
  return { date, kcal, protein: 0, carbs: 0, fat: 0, entries: 1 };
}

function latestHeroProps() {
  return mockHeroProps.mock.calls.at(-1)![0] as {
    value: string;
    detail: string;
    variant?: string;
  };
}

function latestHistoryListProps() {
  return mockHistoryListProps.mock.calls.at(-1)![0] as {
    items: unknown[];
    selected?: Set<string>;
    onPress?: (date: string) => void;
    onLongPress?: (date: string) => void;
  };
}

beforeEach(() => {
  mockHeroProps.mockClear();
  mockHistoryListProps.mockClear();
  mockRows = [];
});

describe("CaloriesHistoryScreen, la definizione: nessuna modifica ne' selezione", () => {
  it("apre HistoryList senza selected/onPress/onLongPress", () => {
    mockRows = [day("2026-09-07", 1800), day("2026-09-08", 2200)];

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CaloriesHistoryScreen />);
    });

    const props = latestHistoryListProps();
    expect(props.selected).toBeUndefined();
    expect(props.onPress).toBeUndefined();
    expect(props.onLongPress).toBeUndefined();
    expect(props.items).toHaveLength(2);

    act(() => {
      renderer.unmount();
    });
  });

  /**
   * `dailyKcalRange` non restituisce i giorni senza pasti: la media che
   * l'hero mostra deve dividere per i giorni PRESENTI nel risultato, non per
   * i giorni della finestra - un giorno mancante non e' un giorno a zero
   * calorie.
   */
  it("la media dell'hero e' sui giorni registrati, non su quelli della finestra", () => {
    mockRows = [day("2026-09-01", 1000), day("2026-09-08", 3000)];

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CaloriesHistoryScreen />);
    });

    const props = latestHeroProps();
    expect(props.value).toBe("2000");
    expect(props.detail).toBe("4000");
    expect(props.variant).toBe("bars");

    act(() => {
      renderer.unmount();
    });
  });
});
