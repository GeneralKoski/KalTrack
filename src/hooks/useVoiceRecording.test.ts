import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { useVoiceRecording, type VoiceRecording } from "@/src/hooks/useVoiceRecording";
import { logger } from "@/src/utils/logger";

/**
 * expo-audio è nativo: qui è sostituito da un recorder finto che tiene lo
 * stato che il vero hook leggerebbe dal device. Ogni funzione è pilotabile per
 * test perché i rami interessanti (i quattro esiti del permesso, lo smontaggio
 * a microfono aperto) non sono raggiungibili altrimenti.
 */
const mockRecorder = {
  isRecording: false,
  uri: null as string | null,
  prepareToRecordAsync: jest.fn<Promise<void>, []>(),
  record: jest.fn<void, []>(),
  stop: jest.fn<Promise<void>, []>(),
};
const mockGetPermissions = jest.fn<
  Promise<{ granted: boolean; canAskAgain: boolean }>,
  []
>();
const mockRequestPermissions = jest.fn<
  Promise<{ granted: boolean; canAskAgain: boolean }>,
  []
>();
const mockSetAudioMode = jest.fn<Promise<void>, [unknown]>();
const mockRecorderState = jest.fn<
  { isRecording: boolean; metering?: number | null },
  []
>();

jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" } },
  getRecordingPermissionsAsync: () => mockGetPermissions(),
  requestRecordingPermissionsAsync: () => mockRequestPermissions(),
  setAudioModeAsync: (mode: unknown) => mockSetAudioMode(mode),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => mockRecorderState(),
}));

// react-test-renderer richiede il flag per accettare act() fuori dal DOM.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let rendered: VoiceRecording | null = null;

function Harness(): null {
  rendered = useVoiceRecording();
  return null;
}

function current(): VoiceRecording {
  if (!rendered) throw new Error("hook non montato");
  return rendered;
}

function mount(): ReactTestRenderer {
  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(createElement(Harness));
  });
  if (!renderer) throw new Error("render fallito");
  return renderer;
}

/** Forza un nuovo render per far rileggere al hook lo stato del recorder. */
function refresh(renderer: ReactTestRenderer): void {
  act(() => {
    renderer.update(createElement(Harness));
  });
}

function setMetering(metering: number | null | undefined): void {
  mockRecorderState.mockReturnValue({ isRecording: true, metering });
}

beforeEach(() => {
  rendered = null;
  mockRecorder.isRecording = false;
  mockRecorder.uri = null;
  mockRecorder.prepareToRecordAsync.mockReset().mockResolvedValue(undefined);
  mockRecorder.record.mockReset().mockImplementation(() => {
    mockRecorder.isRecording = true;
  });
  mockRecorder.stop.mockReset().mockImplementation(async () => {
    mockRecorder.isRecording = false;
    mockRecorder.uri = "file:///rec.m4a";
  });
  mockGetPermissions.mockReset().mockResolvedValue({
    granted: true,
    canAskAgain: true,
  });
  mockRequestPermissions.mockReset().mockResolvedValue({
    granted: true,
    canAskAgain: true,
  });
  mockSetAudioMode.mockReset().mockResolvedValue(undefined);
  mockRecorderState.mockReset().mockImplementation(() => ({
    isRecording: mockRecorder.isRecording,
    metering: undefined,
  }));
  jest.spyOn(logger, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("permessi del microfono", () => {
  it("non richiede di nuovo il permesso quando è già concesso", async () => {
    mount();

    await act(async () => {
      await current().start();
    });

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    expect(current().error).toBeNull();
  });

  it("chiede il permesso e registra se l'utente lo concede", async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    mount();

    await act(async () => {
      await current().start();
    });

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(current().error).toBeNull();
  });

  it("segnala permission-denied se l'utente rifiuta la richiesta", async () => {
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    mount();

    await act(async () => {
      await current().start();
    });

    expect(current().error).toBe("permission-denied");
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });

  it("non richiede il permesso quando il sistema non lo consente più", async () => {
    mockGetPermissions.mockResolvedValue({
      granted: false,
      canAskAgain: false,
    });
    mount();

    await act(async () => {
      await current().start();
    });

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(current().error).toBe("permission-denied");
    // Senza permesso la sessione audio non va nemmeno aperta in registrazione.
    expect(mockSetAudioMode).not.toHaveBeenCalled();
    expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
  });

  it("azzera l'errore precedente a ogni nuovo tentativo", async () => {
    mockGetPermissions.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
    });
    const renderer = mount();

    await act(async () => {
      await current().start();
    });
    expect(current().error).toBe("permission-denied");

    await act(async () => {
      await current().start();
    });
    refresh(renderer);

    expect(current().error).toBeNull();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  });

  it("segnala recording-failed se la preparazione del recorder fallisce", async () => {
    mockRecorder.prepareToRecordAsync.mockRejectedValue(
      new Error("device busy"),
    );
    mount();

    await act(async () => {
      await current().start();
    });

    expect(current().error).toBe("recording-failed");
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("livello audio", () => {
  it("normalizza i dBFS in 0..1 sulla soglia di silenzio", () => {
    const renderer = mount();

    setMetering(-60);
    refresh(renderer);
    expect(current().level).toBe(0);

    setMetering(-30);
    refresh(renderer);
    expect(current().level).toBe(0.5);

    setMetering(0);
    refresh(renderer);
    expect(current().level).toBe(1);
  });

  it("clampa i valori fuori scala invece di uscire da 0..1", () => {
    const renderer = mount();

    setMetering(-120);
    refresh(renderer);
    expect(current().level).toBe(0);

    setMetering(12);
    refresh(renderer);
    expect(current().level).toBe(1);
  });

  it("ritorna null con metering assente, null o NaN", () => {
    const renderer = mount();

    setMetering(undefined);
    refresh(renderer);
    expect(current().level).toBeNull();

    // Regressione: con `=== undefined` il null passava e (null + 60) / 60 = 1,
    // cioè un'onda inchiodata al massimo su un livello mai misurato.
    setMetering(null);
    refresh(renderer);
    expect(current().level).toBeNull();

    setMetering(NaN);
    refresh(renderer);
    expect(current().level).toBeNull();
  });

  it("non riporta nessun livello quando non si sta registrando", () => {
    const renderer = mount();

    mockRecorderState.mockReturnValue({ isRecording: false, metering: -10 });
    refresh(renderer);

    expect(current().isRecording).toBe(false);
    expect(current().level).toBeNull();
  });
});

describe("stop", () => {
  it("restituisce ed espone l'uri della registrazione conclusa", async () => {
    const renderer = mount();
    await act(async () => {
      await current().start();
    });

    const results: (string | null)[] = [];
    await act(async () => {
      results.push(await current().stop());
    });
    refresh(renderer);

    expect(results).toEqual(["file:///rec.m4a"]);
    expect(current().uri).toBe("file:///rec.m4a");
    expect(mockSetAudioMode).toHaveBeenLastCalledWith({
      allowsRecording: false,
    });
  });

  it("rilascia la sessione audio anche se lo stop fallisce", async () => {
    mockRecorder.stop.mockRejectedValue(new Error("no session"));
    const renderer = mount();

    const results: (string | null)[] = [];
    await act(async () => {
      results.push(await current().stop());
    });
    refresh(renderer);

    expect(results).toEqual([null]);
    expect(current().error).toBe("recording-failed");
    expect(mockSetAudioMode).toHaveBeenLastCalledWith({
      allowsRecording: false,
    });
  });
});

describe("smontaggio", () => {
  it("chiude il microfono se la schermata sparisce a registrazione aperta", async () => {
    const renderer = mount();
    await act(async () => {
      await current().start();
    });
    expect(mockRecorder.isRecording).toBe(true);

    act(() => {
      renderer.unmount();
    });

    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenLastCalledWith({
      allowsRecording: false,
    });
  });

  it("non tenta lo stop se non stava registrando, ma rilascia la sessione", () => {
    const renderer = mount();

    act(() => {
      renderer.unmount();
    });

    expect(mockRecorder.stop).not.toHaveBeenCalled();
    expect(mockSetAudioMode).toHaveBeenCalledWith({ allowsRecording: false });
  });

  it("ingoia il rifiuto dello stop allo smontaggio senza rilanciarlo", async () => {
    mockRecorder.stop.mockRejectedValue(new Error("already released"));
    const renderer = mount();
    await act(async () => {
      await current().start();
    });

    expect(() =>
      act(() => {
        renderer.unmount();
      }),
    ).not.toThrow();
    // La promise rifiutata va consumata prima della fine del test, altrimenti
    // l'unhandled rejection comparirebbe nel test successivo.
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("non apre il microfono se la schermata si smonta durante la preparazione", async () => {
    const renderer = mount();
    let releasePrepare: (() => void) | undefined;
    mockRecorder.prepareToRecordAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releasePrepare = resolve;
        }),
    );

    let pending: Promise<void> | undefined;
    await act(async () => {
      pending = current().start();
      // Svuota la coda dei microtask: permesso e sessione audio sono risolti,
      // start() è ferma sulla preparazione del recorder.
      await new Promise((resolve) => setImmediate(resolve));
    });
    expect(releasePrepare).toBeDefined();

    act(() => {
      renderer.unmount();
    });

    releasePrepare?.();
    await pending;

    // Il guard `mounted` esiste per questo: senza, record() accenderebbe il
    // microfono su una schermata che non c'è più e nessuno lo spegnerebbe.
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });
});
