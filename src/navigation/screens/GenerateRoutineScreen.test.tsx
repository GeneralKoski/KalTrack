import { GenerateRoutineScreen } from "@/src/navigation/screens/GenerateRoutineScreen";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
const mockPopTo = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({
    navigate: mockNavigate,
    popTo: mockPopTo,
    goBack: mockGoBack,
    replace: mockReplace,
  }),
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

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: () => undefined,
}));

/*
 * `DfSelect` porta `@/components/ui/select`, un modulo gluestack ESM che il
 * transform di Jest non copre (stesso genere di problema di
 * `alert-dialog` in DfAlert, vedi SessionScreen.test.tsx). Il barrel `kal`
 * porta invece la catena reanimated/gorhom. Nessuno dei due c'entra con
 * quel che si verifica qui - se lo schermo si sostituisce con Plans.
 */
jest.mock("@/src/components/form/DfSelect", () => ({
  DfSelect: () => null,
}));
jest.mock("@/src/components/kal", () => ({
  Card: ({ children }: { children: React.ReactNode }) => children,
  ScreenBackground: () => null,
  SectionLabel: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@/src/db/queries/exercises", () => ({
  listAvailableEquipment: jest.fn(async () => []),
}));

beforeEach(() => {
  mockNavigate.mockClear();
  mockPopTo.mockClear();
  mockGoBack.mockClear();
  mockReplace.mockClear();
  mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
});

describe("GenerateRoutineScreen, il cancello all'ingresso", () => {
  /**
   * `RoutineFormScreen` gia' gated il tocco che porta qui, ma questa
   * schermata ha anche `linking.path: "schede/genera"`: un deep link diretto
   * la raggiunge scavalcando quel banner - la stessa porta seconda gia'
   * chiusa per `kaltrack://assistente`. Il gate qui e' all'INGRESSO della
   * schermata, non del bottone.
   */
  it("senza diritto AI sostituisce la schermata con Plans", async () => {
    mockAccountState = { token: null, aiEnabled: null, isHydrated: true };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<GenerateRoutineScreen />);
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith("Plans");
    // Non disegna il proprio contenuto nel frattempo.
    expect(renderer.toJSON()).toBeNull();

    act(() => {
      renderer.unmount();
    });
  });

  it("con diritto AI non sostituisce niente", async () => {
    mockAccountState = { token: "t", aiEnabled: true, isHydrated: true };

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<GenerateRoutineScreen />);
      await Promise.resolve();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(renderer.toJSON()).not.toBeNull();

    act(() => {
      renderer.unmount();
    });
  });
});
