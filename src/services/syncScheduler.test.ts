import { syncCatalog } from "@/src/services/catalogSync";
import { runSync } from "@/src/services/sync";
import {
  __resetSchedulerForTesting,
  startSyncScheduler,
  SYNC_INTERVAL_MS,
} from "@/src/services/syncScheduler";
import { AppState } from "react-native";

jest.mock("@/src/services/sync", () => ({
  runSync: jest.fn(async () => ({ pushed: 0, pulled: 0 })),
}));

// Senza questo mock la suite carica il servizio vero (e il db/api dietro di
// lui) e resta innocua solo perche' `attivo()` risulta falso qui dentro: un
// mock esplicito e' l'unico modo di verificare CHE il catalogo venga chiamato
// (finding 10), non solo che il test non esploda.
jest.mock("@/src/services/catalogSync", () => ({
  syncCatalog: jest.fn(async () => ({ toccate: 0, riuscito: true })),
}));

const syncMock = jest.mocked(runSync);
const catalogMock = jest.mocked(syncCatalog);

/** Cattura l'ascoltatore di AppState per simulare i cambi di stato. */
let appStateListener: ((state: string) => void) | null = null;
/** Cattura la `remove` della sottoscrizione per verificarne la pulizia. */
let removeSpy: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  syncMock.mockClear();
  catalogMock.mockClear();
  __resetSchedulerForTesting();
  appStateListener = null;
  removeSpy = jest.fn();
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_event, handler) => {
      appStateListener = handler as (state: string) => void;
      return { remove: removeSpy } as never;
    });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Lascia girare le promise in sospeso tra un avanzamento e l'altro. */
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("quando parte la sincronizzazione", () => {
  it("una volta subito, all'avvio", async () => {
    const stop = startSyncScheduler();
    await flush();

    expect(syncMock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("di nuovo a ogni intervallo", async () => {
    const stop = startSyncScheduler();
    await flush();

    jest.advanceTimersByTime(SYNC_INTERVAL_MS);
    await flush();
    expect(syncMock).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(SYNC_INTERVAL_MS);
    await flush();
    expect(syncMock).toHaveBeenCalledTimes(3);

    stop();
  });

  /**
   * Il caso per cui esiste la pausa minima: alternare due app avanti e
   * indietro scatenerebbe una sincronizzazione a ogni passaggio.
   */
  it("non riparte a ogni ritorno in primo piano", async () => {
    const stop = startSyncScheduler();
    await flush();
    expect(syncMock).toHaveBeenCalledTimes(1);

    appStateListener?.("background");
    appStateListener?.("active");
    await flush();

    expect(syncMock).toHaveBeenCalledTimes(1);
    stop();
  });

  it("riparte al ritorno in primo piano se e' passato abbastanza tempo", async () => {
    const stop = startSyncScheduler();
    await flush();

    jest.advanceTimersByTime(2 * 60 * 1000);
    appStateListener?.("active");
    await flush();

    expect(syncMock).toHaveBeenCalledTimes(2);
    stop();
  });

  /**
   * Finding 10. Due dei cinque inneschi del catalogo (§ Il catalogo comune,
   * dal telefono) - l'avvio e il ritorno in primo piano - non erano pinnati:
   * cancellare `void syncCatalog();` da `runIfDue` lasciava la suite verde.
   */
  it("chiama anche il catalogo, all'avvio e al ritorno in primo piano", async () => {
    const stop = startSyncScheduler();
    await flush();
    expect(catalogMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2 * 60 * 1000);
    appStateListener?.("active");
    await flush();

    expect(catalogMock).toHaveBeenCalledTimes(2);
    stop();
  });

  /**
   * Senza la fermata, un ricaricamento in sviluppo lascerebbe dietro un timer
   * per ogni ricarica, e le sincronizzazioni si moltiplicherebbero.
   */
  it("si ferma davvero quando si chiama la funzione di stop", async () => {
    const stop = startSyncScheduler();
    await flush();
    stop();

    jest.advanceTimersByTime(SYNC_INTERVAL_MS * 3);
    await flush();

    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Finding 11. La pulizia e' completa e simmetrica (`clearInterval` +
   * `subscription.remove()`), ma nessun test lo diceva: cancellare la seconda
   * riga lasciava la suite verde perche' la `remove` mockata non era mai
   * ispezionata.
   */
  it("rimuove anche l'ascoltatore di AppState alla fermata", async () => {
    const stop = startSyncScheduler();
    await flush();
    stop();

    expect(removeSpy).toHaveBeenCalled();
  });

  /** Due inneschi ravvicinati non devono mandare due richieste insieme. */
  it("non sovrappone due giri", async () => {
    let resolveSync: (() => void) | undefined;
    syncMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSync = () => resolve({ pushed: 0, pulled: 0 });
        }),
    );

    const stop = startSyncScheduler();
    await flush();

    // Il primo giro e' ancora in volo: l'intervallo scatta ma non deve
    // aggiungerne un secondo.
    jest.advanceTimersByTime(SYNC_INTERVAL_MS);
    await flush();
    expect(syncMock).toHaveBeenCalledTimes(1);

    resolveSync?.();
    await flush();
    stop();
  });
});
