import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import {
  AI_ENABLED,
  CURSOR_KEY,
  PUSHED_KEY,
} from "@/src/services/syncMarkers";
import { useAccountStore } from "@/src/stores/accountStore";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const mockFetchMyProfile = jest.fn(async () => ({
  id: 1,
  handle: "anna",
  displayName: "Anna",
  aiEnabled: true,
}));

jest.mock("@/src/api/social", () => ({
  fetchMyProfile: (...args: unknown[]) => mockFetchMyProfile(...(args as [])),
  logout: jest.fn(async () => undefined),
}));

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  useAccountStore.setState({ token: null, profile: null, aiEnabled: null });
  mockFetchMyProfile.mockClear();
  mockFetchMyProfile.mockImplementation(async () => ({
    id: 1,
    handle: "anna",
    displayName: "Anna",
    aiEnabled: true,
  }));
});

describe("accesso", () => {
  /**
   * I segnaposto della sincronizzazione valgono per UN account. Entrando con
   * un altro e tenendo quelli di prima, il telefono chiede al server le righe
   * dopo una posizione che per il nuovo utente non esiste ancora: la risposta
   * e' vuota e i suoi dati non arrivano mai, senza nessun errore che lo dica.
   */
  it("azzera i segnaposto della sincronizzazione", async () => {
    await setSetting(CURSOR_KEY, "406");
    await setSetting(PUSHED_KEY, "2026-08-29T10:00:00.000Z");

    await useAccountStore.getState().signIn("token-di-un-altro-account");

    expect(await getSetting(CURSOR_KEY)).toBeNull();
    expect(await getSetting(PUSHED_KEY)).toBeNull();
    expect(useAccountStore.getState().token).toBe("token-di-un-altro-account");
  });
});

describe("il segnaposto del diritto AI", () => {
  it("dopo un /api/me con aiEnabled:false il segnaposto contiene false", async () => {
    mockFetchMyProfile.mockImplementation(async () => ({
      id: 1,
      handle: "anna",
      displayName: "Anna",
      aiEnabled: false,
    }));

    await useAccountStore.getState().signIn("un-token");

    expect(await getSetting(AI_ENABLED)).toBe("0");
    expect(useAccountStore.getState().aiEnabled).toBe(false);
  });

  it("un restore senza rete lascia in piedi l'ultimo valore noto invece di azzerarlo", async () => {
    await setSetting(AI_ENABLED, "1");
    const secureStore = jest.requireMock("expo-secure-store") as {
      getItemAsync: jest.Mock;
    };
    secureStore.getItemAsync.mockResolvedValueOnce("un-token");
    // Un errore di rete, non una sessione scaduta: `refreshProfile` non deve
    // cancellare ne' il token ne' l'ultimo valore noto.
    mockFetchMyProfile.mockImplementation(async () => {
      throw new Error("offline");
    });

    await useAccountStore.getState().restore();
    // `restore` non aspetta `refreshProfile`: si lascia correre il microtask.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(useAccountStore.getState().token).toBe("un-token");
    expect(useAccountStore.getState().aiEnabled).toBe(true);
  });
});
