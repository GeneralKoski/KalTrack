import { LabelScanner } from "@/src/containers/foods/LabelScanner";
import React from "react";
import { useForm, FormProvider } from "react-hook-form";
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

jest.mock("@/src/ai/config", () => ({
  hasAiKey: () => true,
}));

const mockReadNutritionLabel = jest.fn(async () => ({}));
jest.mock("@/src/ai/readNutritionLabel", () => ({
  readNutritionLabel: (...args: unknown[]) =>
    mockReadNutritionLabel(...(args as [])),
  labelUpdates: () => ({ nutrients: {}, name: null, defaultServingG: null, missing: [] }),
}));

const mockRequestCameraPermissions = jest.fn(async () => ({ granted: false }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: () => mockRequestCameraPermissions(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// Non c'entra con quel che si verifica (se il gate lascia passare l'azione);
// porta DfAlert, che sotto Jest non si mocka gratis (vedi SessionScreen.test).
jest.mock("@/src/containers/settings/AiKeyPrompt", () => ({
  AiKeyPrompt: () => null,
}));

const Wrapper: React.FC = () => {
  const form = useForm({ defaultValues: { name: "", defaultServingG: null } });
  return (
    <FormProvider {...form}>
      <LabelScanner />
    </FormProvider>
  );
};

beforeEach(() => {
  mockNavigate.mockClear();
  mockRequestCameraPermissions.mockClear();
  mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
});

describe("LabelScanner, il sesto punto d'ingresso", () => {
  /**
   * M14: `guard` chiedeva gia' `hasAiKey()`, ma non il diritto AI. Senza
   * diritto lo scanner deve mandare ai piani invece di aprire la fotocamera.
   */
  it("senza diritto AI naviga ai piani e non apre la fotocamera", () => {
    mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Wrapper />);
    });

    const [cameraButton] = renderer.root.findAllByType(TouchableOpacity);
    act(() => {
      cameraButton.props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Plans");
    expect(mockRequestCameraPermissions).not.toHaveBeenCalled();
  });

  it("con diritto AI apre la fotocamera invece di navigare", () => {
    mockAccountState = { token: "t", aiEnabled: true, isHydrated: true };
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Wrapper />);
    });

    const [cameraButton] = renderer.root.findAllByType(TouchableOpacity);
    act(() => {
      cameraButton.props.onPress();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockRequestCameraPermissions).toHaveBeenCalledTimes(1);
  });
});
