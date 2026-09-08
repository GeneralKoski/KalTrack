import { AssistantButton } from "@/src/containers/assistant/AssistantButton";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ navigate: mockNavigate }),
}));

/*
 * Il barrel `kal` porta `PhotoField`, che importa `DfBottomSheet`, che importa
 * @gorhom/bottom-sheet - e quello, sotto jest, cerca il modulo nativo di
 * react-native-worklets che qui non c'e'. Niente di tutto cio' c'entra con
 * quel che si verifica (se l'ascolto parte o si naviga ai piani), quindi si
 * mocka solo `MetalSurface`, l'unica esportazione che questo file usa.
 */
jest.mock("@/src/components/kal", () => ({
  MetalSurface: ({ children }: { children: React.ReactNode }) => children,
}));

// Nessun account: lo stesso stato che gia' spegne il tocco del microfono
// (aiAccess.test.ts, "senza account e' spenta").
jest.mock("@/src/stores/accountStore", () => ({
  useAccountStore: (
    selector: (state: {
      token: string | null;
      aiEnabled: boolean | null;
    }) => unknown,
  ) => selector({ token: null, aiEnabled: null }),
}));

const mockStartListening = jest.fn(async () => undefined);
jest.mock("@/src/containers/assistant/useAssistantSession", () => ({
  useAssistantSession: () => ({
    phase: "idle",
    level: null,
    transcript: "",
    reply: "",
    pending: [],
    executed: [],
    failure: null,
    spokenReplyUnavailable: false,
    cancelListening: jest.fn(),
    startListening: mockStartListening,
    stopListening: jest.fn(),
    submitText: jest.fn(),
    resolvePending: jest.fn(),
    reset: jest.fn(),
  }),
}));

// L'overlay non c'entra con quel che si verifica qui (se si apre l'ascolto o
// si naviga), ed e' pesante da montare per conto suo.
jest.mock("@/src/containers/assistant/AssistantOverlay", () => ({
  AssistantOverlay: () => null,
}));

/*
 * `useAssistantLaunch` e' il hook vero (src/services/assistantLaunch.ts):
 * non lo si mocka, si simula il deep link mockando `expo-linking` a monte,
 * cosi' il test esercita davvero il percorso che parte da
 * `kaltrack://assistente`.
 */
let deepLinkHandler: ((event: { url: string }) => void) | null = null;
jest.mock("expo-linking", () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: (
    _event: string,
    handler: (e: { url: string }) => void,
  ) => {
    deepLinkHandler = handler;
    return { remove: jest.fn() };
  },
}));

beforeEach(() => {
  mockNavigate.mockClear();
  mockStartListening.mockClear();
  deepLinkHandler = null;
});

describe("AssistantButton, la scorciatoia da fuori l'app", () => {
  /**
   * `kaltrack://assistente` e il tocco del microfono sono due porte sulla
   * stessa stanza (§ Dove vive il microfono di CLAUDE.md): prima del fix
   * round 1 solo la prima chiedeva il diritto AI, e la scorciatoia apriva
   * comunque l'ascolto a chi non ce l'ha - un buco nel percorso di
   * conversione, non un problema di sicurezza (il cartello non e' una
   * serratura), ma le due porte devono essere d'accordo.
   */
  it("senza diritto AI naviga ai piani e non apre l'ascolto", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AssistantButton />);
      await Promise.resolve();
    });

    expect(deepLinkHandler).not.toBeNull();

    await act(async () => {
      deepLinkHandler?.({ url: "kaltrack://assistente" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Plans");
    expect(mockStartListening).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });
  });
});
