import { SessionScreen } from "@/src/navigation/screens/SessionScreen";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: { routineId: "r1", dayIndex: 0 } }),
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
 * -> reanimated/worklets, che sotto Jest lancia (nessun test in questo repo
 * monta quella catena). `RestTimer` importa reanimated direttamente. Nessuno
 * dei due c'entra con quel che si verifica qui (se il riordino AI parte),
 * quindi si mockano come passthrough/no-op.
 */
jest.mock("@/src/components/kal", () => {
  const passthrough = ({ children }: { children: React.ReactNode }) => children;
  return {
    Card: passthrough,
    EmptyState: () => null,
    HeroPanel: passthrough,
    ScreenBackground: () => null,
    SectionLabel: passthrough,
  };
});

jest.mock("@/src/containers/gym/RestTimer", () => ({
  RestTimer: () => null,
}));

/*
 * `DfAlert` porta `components/ui/alert-dialog`, un modulo gluestack ESM che
 * il transform di jest non copre (non e' nella allowlist di
 * `transformIgnorePatterns`): fuori tema qui, si mocka via.
 */
jest.mock("@/src/components/DfAlert", () => ({
  DfAlert: () => null,
}));

/*
 * Il vero AlternativesSheet ha gia' il suo test (AlternativesSheet.test.tsx):
 * qui interessa SOLO cosa SessionScreen gli passa come `rank`, non come lo
 * sheet degrada senza. Il mock registra le props a ogni render.
 */
const mockAlternativesSheetProps = jest.fn();
jest.mock("@/src/containers/gym/AlternativesSheet", () => {
  // jest issa jest.mock in cima al file: la fabbrica non puo' leggere il
  // modulo React importato sotto, e deve richiederselo da se'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  return {
    AlternativesSheet: ReactLib.forwardRef(
      (props: Record<string, unknown>, _ref: unknown) => {
        mockAlternativesSheetProps(props);
        return null;
      },
    ),
  };
});

const mockRankAlternatives = jest.fn(async () => []);
jest.mock("@/src/ai/rankAlternatives", () => ({
  rankAlternatives: (...args: unknown[]) =>
    mockRankAlternatives(...(args as [])),
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

const exercise = {
  id: "ex-1",
  name: "Panca piana bilanciere",
  name_norm: "panca piana bilanciere",
  muscle_group: "petto",
  secondary_muscles: null,
  equipment: null,
  is_custom: 0,
  is_banned: 0,
  dislike_level: 0,
  notes: null,
  instructions: null,
  photo_uri: null,
  catalog_uid: null,
  usage_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
};

const resolvedDay = {
  day: {
    id: "day-1",
    routine_id: "r1",
    name: "Giorno A",
    sort: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
  },
  name: "Giorno A",
  blocks: [
    {
      block: {
        id: "block-1",
        routine_day_id: "day-1",
        kind: "single",
        sort: 0,
        rest_seconds: 90,
        notes: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
      kind: "single",
      exercises: [
        {
          row: {
            id: "be-1",
            routine_block_id: "block-1",
            exercise_id: "ex-1",
            sort: 0,
            target_sets: 3,
            target_reps: "10",
            target_weight: null,
            tempo: null,
            rpe: null,
            notes: null,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
            deleted_at: null,
          },
          exercise,
        },
      ],
    },
  ],
};

const mockGetRoutineDay = jest.fn(async () => resolvedDay);
const mockStartSession = jest.fn(async () => "session-1");
jest.mock("@/src/db/queries/workouts", () => ({
  getRoutineDay: (...args: unknown[]) => mockGetRoutineDay(...(args as [])),
  startSession: (...args: unknown[]) => mockStartSession(...(args as [])),
  sessionStartedAt: async () => "2026-01-01T10:00:00.000Z",
  loggedSetsOf: async () => [],
  lastSetsFor: async () => [],
  personalBest: async () => null,
  logSet: async () => "set-1",
  deleteSet: async () => undefined,
  endSession: async () => undefined,
}));

beforeEach(() => {
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockAlternativesSheetProps.mockClear();
  mockRankAlternatives.mockClear();
  mockGetRoutineDay.mockClear();
  mockStartSession.mockClear();
  mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("SessionScreen, il riordino AI di 'proponi alternativa'", () => {
  /**
   * Important 4 del review round 2: il fix round precedente ha tolto il gate
   * dall'INTERO pulsante (che apre lo sheet con l'elenco locale per
   * chiunque) e lo ha messo SOLO sul riordino AI passato come `rank`. Niente
   * lo teneva: ne' M9 (rank sempre passato) ne' M10 (gate rimesso
   * sull'intero pulsante) facevano fallire un test.
   */
  it("senza diritto AI il tocco apre lo sheet locale: nessun rank, nessuna navigazione", async () => {
    mockAccountState = { token: null, aiEnabled: null, isHydrated: true };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<SessionScreen />);
      await flush();
    });

    // `accessibilityRole="button"` e' unico in questo file: e' proprio il
    // pulsante "proponi alternativa", non un chevron o un'altra azione.
    const button = renderer.root.findByProps({ accessibilityRole: "button" });
    await act(async () => {
      button.props.onPress();
      await flush();
    });

    const lastCall = mockAlternativesSheetProps.mock.calls.at(-1)?.[0];
    // Il pulsante deve aver aperto DAVVERO lo sheet (M10: senza questo, un
    // gate rimesso sul tocco lo terrebbe chiuso senza che nessuna asserzione
    // se ne accorga).
    expect(lastCall?.exercise).toEqual(
      expect.objectContaining({ id: "ex-1" }),
    );
    // E l'AI non deve essere entrata (M9): senza diritto, `rank` non arriva.
    expect(lastCall?.rank).toBeUndefined();
    expect(mockRankAlternatives).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalledWith("Plans");

    act(() => {
      renderer.unmount();
    });
  });

  it("con diritto AI il tocco apre lo sheet e passa il riordino", async () => {
    mockAccountState = { token: "t", aiEnabled: true, isHydrated: true };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<SessionScreen />);
      await flush();
    });

    const button = renderer.root.findByProps({ accessibilityRole: "button" });
    await act(async () => {
      button.props.onPress();
      await flush();
    });

    const lastCall = mockAlternativesSheetProps.mock.calls.at(-1)?.[0];
    expect(lastCall?.exercise).toEqual(
      expect.objectContaining({ id: "ex-1" }),
    );
    expect(typeof lastCall?.rank).toBe("function");
    expect(mockNavigate).not.toHaveBeenCalledWith("Plans");

    act(() => {
      renderer.unmount();
    });
  });
});
