import { addDays, todayIso } from "@/src/domain/date";
import { StepsHistoryScreen } from "@/src/navigation/screens/StepsHistoryScreen";
import type { StepLogRow } from "@/src/types/nutrition";
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

/*
 * Il barrel `kal` porta `PhotoField` -> `DfBottomSheet` -> @gorhom/bottom-sheet
 * -> reanimated/worklets, che sotto Jest lancia (vedi il commento identico in
 * SessionScreen.test.tsx). Qui non c'entra niente con quel che si verifica -
 * il tocco su una riga - quindi si mocka con implementazioni vere e minime.
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
    EmptyState: ({ message }: { message: string }) =>
      ReactLib.createElement(RN.Text, null, message),
    NO_DELTA: "—",
  };
});

/*
 * `DfAlert` porta `components/ui/alert-dialog`, un modulo gluestack ESM che il
 * transform di jest non copre: fuori tema qui (si verifica la conferma di
 * cancellazione altrove, se mai), si mocka via.
 */
jest.mock("@/src/components/DfAlert", () => ({
  DfAlert: () => null,
}));

/*
 * Il grafico esteso non c'entra con la guardia sotto test: si mocka via
 * invece di trascinarsi dietro `Segmented`/`TrendChart` e il resto dei loro
 * import.
 */
jest.mock("@/src/containers/progress/MetricHistoryHero", () => ({
  MetricHistoryHero: () => null,
}));

/*
 * L'elenco vero (`HistoryList`) non ha logica da verificare qui - decide gia'
 * lui quando chiamare `onPress`/`onLongPress`, ed e' presentazionale. Quel che
 * conta e' cosa STEPSHISTORYSCREEN fa con quelle due chiamate, quindi il mock
 * si limita a registrare le prop a ogni render: il test invoca `onPress` e
 * `onLongPress` direttamente, come se fosse l'elenco a farlo.
 */
const mockHistoryListProps = jest.fn();
jest.mock("@/src/containers/progress/HistoryList", () => ({
  HistoryList: (props: Record<string, unknown>) => {
    mockHistoryListProps(props);
    return null;
  },
}));

/*
 * Stesso principio per il foglio di modifica: ha gia' il suo test
 * (MetricEntrySheet.test.tsx). Qui interessa solo CON QUALI prop
 * StepsHistoryScreen lo apre - e che non lo apra affatto durante la
 * selezione multipla.
 */
const mockMetricEntrySheetProps = jest.fn();
jest.mock("@/src/containers/progress/MetricEntrySheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  return {
    MetricEntrySheet: ReactLib.forwardRef(
      (props: Record<string, unknown>, ref: unknown) => {
        mockMetricEntrySheetProps(props);
        ReactLib.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return null;
      },
    ),
  };
});

const mockReload = jest.fn();
let mockRows: StepLogRow[] = [];
jest.mock("@/src/hooks/useFocusData", () => ({
  useFocusData: () => ({
    data: mockRows,
    loading: false,
    reload: mockReload,
    refresh: async () => {},
    refreshing: false,
  }),
}));

function row(date: string, steps: number): StepLogRow {
  return {
    id: date,
    date,
    steps,
    source: "manual",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
  };
}

// Oggi e ieri, non date fisse: la finestra di default e' "30 giorni", e una
// data fissa scritta a settembre 2026 sarebbe fuori da quella finestra un
// mese dopo - non e' quello che questo test vuole verificare.
const dateA = addDays(todayIso(), -1);
const dateB = todayIso();

beforeEach(() => {
  mockReload.mockClear();
  mockHistoryListProps.mockClear();
  mockMetricEntrySheetProps.mockClear();
  mockRows = [row(dateA, 8000), row(dateB, 9000)];
});

function latestHistoryListProps() {
  return mockHistoryListProps.mock.calls.at(-1)![0] as {
    onPress: (date: string) => void;
    onLongPress: (date: string) => void;
    selected: Set<string>;
  };
}

function latestSheetProps() {
  return mockMetricEntrySheetProps.mock.calls.at(-1)![0] as {
    initialDate?: string;
    initialValue?: number;
  };
}

describe("StepsHistoryScreen, il tocco su una riga", () => {
  it("fuori selezione apre il foglio di modifica sulla riga giusta", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<StepsHistoryScreen />);
    });

    act(() => {
      latestHistoryListProps().onPress(dateB);
    });

    expect(latestSheetProps().initialDate).toBe(dateB);
    expect(latestSheetProps().initialValue).toBe(9000);

    act(() => {
      renderer.unmount();
    });
  });

  /**
   * La guardia che questo task ha aggiunto: durante la selezione multipla il
   * tocco deve aggiungere la riga al gruppo da cancellare, non aprire il
   * foglio sopra - i due gesti si scavalcherebbero, e il foglio si
   * aprirebbe mentre si sta ancora scegliendo cosa cancellare.
   */
  it("durante la selezione multipla NON apre il foglio: tocca la selezione", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<StepsHistoryScreen />);
    });

    // La pressione lunga entra in selezione con dateA gia' scelta.
    act(() => {
      latestHistoryListProps().onLongPress(dateA);
    });
    expect(latestHistoryListProps().selected.has(dateA)).toBe(true);

    const sheetCallsBefore = mockMetricEntrySheetProps.mock.calls.length;

    // Un tocco su un'altra riga, ancora in selezione: deve aggiungerla al
    // gruppo, non aprire il foglio di modifica su di lei.
    act(() => {
      latestHistoryListProps().onPress(dateB);
    });

    expect(latestHistoryListProps().selected.has(dateA)).toBe(true);
    expect(latestHistoryListProps().selected.has(dateB)).toBe(true);
    expect(latestHistoryListProps().selected.size).toBe(2);

    // Il foglio puo' essere stato ri-renderizzato (lo schermo intero lo e'),
    // ma le sue prop non devono essersi mai riempite per questa riga.
    expect(mockMetricEntrySheetProps.mock.calls.length).toBeGreaterThanOrEqual(
      sheetCallsBefore,
    );
    expect(latestSheetProps().initialDate).toBeUndefined();
    expect(latestSheetProps().initialValue).toBeUndefined();

    act(() => {
      renderer.unmount();
    });
  });
});
