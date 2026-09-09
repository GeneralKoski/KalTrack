import { WeeklyCoachCard } from "@/src/containers/progress/WeeklyCoachCard";
import type { WeeklyStats } from "@/src/ai/weeklyCoach";
import React from "react";
import { TouchableOpacity } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ navigate: mockNavigate }),
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
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactLib.useEffect(() => effect(), []);
    },
  };
});

jest.mock("@/src/ai/config", () => ({ hasAiKey: () => true }));

const mockZeroMetric = { average: null, target: null, deviation: null, days: 0 };
const mockStats: WeeklyStats = {
  from: "2026-01-01",
  to: "2026-01-07",
  loggedDays: 5,
  kcal: mockZeroMetric,
  protein: mockZeroMetric,
  carbs: mockZeroMetric,
  fat: mockZeroMetric,
  steps: mockZeroMetric,
  workoutDays: 2,
  weight: { first: null, last: null, changeKg: null, days: 0 },
};

const mockWeeklyReview = jest.fn(async () => ({
  status: "ok" as const,
  stats: mockStats,
  comment: { summary: "s", observations: [], suggestion: null },
}));
jest.mock("@/src/ai/weeklyCoach", () => ({
  MIN_LOGGED_DAYS: 3,
  WEEK_DAYS: 7,
  weeklyStats: jest.fn(async () => mockStats),
  weeklyReview: (...args: unknown[]) => mockWeeklyReview(...(args as [])),
}));

/*
 * Il barrel `kal` porta la catena reanimated/@gorhom (vedi
 * SessionScreen.test.tsx): non c'entra con quel che si verifica qui.
 */
jest.mock("@/src/components/kal", () => ({
  Card: ({ children }: { children: React.ReactNode }) => children,
  MetalSurface: ({ children }: { children: React.ReactNode }) => children,
  targetColor: () => "#000000",
}));

beforeEach(() => {
  mockNavigate.mockClear();
  mockWeeklyReview.mockClear();
  mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("WeeklyCoachCard, il pulsante del commento", () => {
  /**
   * Le statistiche sono locali e restano SEMPRE visibili (non pinnato qui:
   * gia' cosi' prima di questo task). Solo il commento e' AI, ed e' l'unico
   * elemento gated - il nono punto d'ingresso trovato dall'audit.
   */
  it("senza diritto AI naviga ai piani e non chiama weeklyReview", async () => {
    mockAccountState = { token: null, aiEnabled: null, isHydrated: true };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<WeeklyCoachCard />);
      await flush();
    });

    const button = renderer.root.findByType(TouchableOpacity);
    act(() => {
      button.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Plans");
    expect(mockWeeklyReview).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });
  });

  it("con diritto AI chiama weeklyReview, senza navigare", async () => {
    mockAccountState = { token: "t", aiEnabled: true, isHydrated: true };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<WeeklyCoachCard />);
      await flush();
    });

    const button = renderer.root.findByType(TouchableOpacity);
    await act(async () => {
      button.props.onPress();
      await flush();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockWeeklyReview).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.unmount();
    });
  });
});
