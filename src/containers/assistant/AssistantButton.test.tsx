import { AssistantButton } from "@/src/containers/assistant/AssistantButton";
import React from "react";
import { TouchableOpacity } from "react-native";
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

/**
 * Stato dell'account, controllabile per test: `token`, `aiEnabled` e
 * `isHydrated` sono TRE informazioni diverse (vedi `aiAccess.ts`), e un mock
 * che ne fissasse solo due renderebbe indistinguibili "nessun account" e
 * "non ancora idratato" - esattamente il difetto che ha portato un utente con
 * diritto sui piani da un deep link a freddo.
 */
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

// L'overlay non c'entra con la logica verificata qui, ma il suo prop
// `visible` e' l'unico modo di vedere dall'esterno se `setOpen(true)` e'
// scattato: senza chiamare l'AI davvero, e' il segno che il cancello ha
// lasciato passare l'azione invece di navigare.
const mockOverlay = jest.fn();
jest.mock("@/src/containers/assistant/AssistantOverlay", () => ({
  AssistantOverlay: (props: { visible: boolean }) => {
    mockOverlay(props);
    return null;
  },
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
  mockOverlay.mockClear();
  deepLinkHandler = null;
  mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
});

const lastVisible = (): boolean =>
  Boolean(mockOverlay.mock.calls.at(-1)?.[0]?.visible);

describe("AssistantButton, il tocco sul microfono", () => {
  /**
   * M12: senza diritto AI il tocco deve navigare ai piani, non aprire
   * l'overlay. `token: null` con `isHydrated: true` e' "nessun account"
   * CONFERMATO, non "non lo so ancora".
   */
  it("senza account naviga ai piani e non apre l'overlay", () => {
    mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<AssistantButton />);
    });

    act(() => {
      renderer.root.findByType(TouchableOpacity).props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Plans");
    expect(lastVisible()).toBe(false);
  });

  /** M18: il cancello deve guardare DAVVERO `aiEnabled`, non solo il token. */
  it("con account ma senza diritto (ai_enabled: false) naviga ai piani", () => {
    mockAccountState = { token: "t", aiEnabled: false, isHydrated: true };
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<AssistantButton />);
    });

    act(() => {
      renderer.root.findByType(TouchableOpacity).props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith("Plans");
    expect(lastVisible()).toBe(false);
  });

  it("con account e diritto apre l'overlay, senza navigare", () => {
    mockAccountState = { token: "t", aiEnabled: true, isHydrated: true };
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<AssistantButton />);
    });

    act(() => {
      renderer.root.findByType(TouchableOpacity).props.onPress();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(lastVisible()).toBe(true);
  });
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
  it("senza account (confermato) naviga ai piani e non apre l'ascolto", async () => {
    mockAccountState = { token: null, aiEnabled: null, isHydrated: true };
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

  /**
   * Important 1: `token: null` prima che `restore()` finisca NON e' "nessun
   * account" - e' "non lo so ancora". Un deep link a freddo, con l'idratazione
   * ancora in corso, deve aprire l'ascolto come chi ha diritto: negarlo per
   * ignoranza e' esattamente il difetto che questo task esiste per impedire.
   */
  it("prima che l'idratazione finisca, apre l'ascolto invece di navigare", async () => {
    mockAccountState = { token: null, aiEnabled: null, isHydrated: false };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<AssistantButton />);
      await Promise.resolve();
    });

    await act(async () => {
      deepLinkHandler?.({ url: "kaltrack://assistente" });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockStartListening).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.unmount();
    });
  });
});
