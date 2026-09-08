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

/*
 * `writeAiEnabled` resta quella VERA di serie (delega a `jest.requireActual`),
 * cosi' i test esistenti che leggono `getSetting(AI_ENABLED)` dopo un
 * `signIn` continuano a vedere una scrittura reale sul DB di prova. Solo i
 * test che vogliono simulare una scrittura fallita la sovrascrivono con
 * `mockRejectedValueOnce`.
 */
const mockWriteAiEnabled = jest.fn((value: boolean) => {
  const actual = jest.requireActual<{
    writeAiEnabled: (value: boolean) => Promise<void>;
  }>("@/src/services/syncMarkers");
  return actual.writeAiEnabled(value);
});
jest.mock("@/src/services/syncMarkers", () => ({
  ...jest.requireActual("@/src/services/syncMarkers"),
  writeAiEnabled: (value: boolean) => mockWriteAiEnabled(value),
}));

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  useAccountStore.setState({
    token: null,
    profile: null,
    aiEnabled: null,
    isHydrated: false,
  });
  mockFetchMyProfile.mockClear();
  mockFetchMyProfile.mockImplementation(async () => ({
    id: 1,
    handle: "anna",
    displayName: "Anna",
    aiEnabled: true,
  }));
  mockWriteAiEnabled.mockClear();
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

  /**
   * Minor 8: la cache (il segnaposto) e' il valore minore. Un profilo appena
   * arrivato davvero non si butta perche' la SUA scrittura sul database
   * fallisce - e il registro non deve dire "profilo non letto" quando invece
   * lo e' stato.
   */
  it("un profilo arrivato resta anche se la scrittura del segnaposto fallisce", async () => {
    mockWriteAiEnabled.mockRejectedValueOnce(new Error("disco pieno"));

    await useAccountStore.getState().signIn("un-token");

    expect(useAccountStore.getState().profile?.handle).toBe("anna");
    expect(useAccountStore.getState().aiEnabled).toBe(true);
  });

  /** Minor 9: `setProfile` e' il quarto percorso da cui arriva un profilo. */
  it("setProfile scrive il segnaposto come gli altri tre percorsi", async () => {
    useAccountStore.getState().setProfile({
      handle: "anna",
      displayName: "Anna",
      avatarUrl: null,
      bio: null,
      email: "anna@example.com",
      isAdmin: false,
      aiEnabled: false,
      shares: {
        calories: false,
        steps: false,
        weight: false,
        workouts: false,
        gym: false,
      },
    });
    // La scrittura e' fire-and-forget: si lascia correre il microtask.
    await Promise.resolve();

    expect(await getSetting(AI_ENABLED)).toBe("0");
    expect(useAccountStore.getState().aiEnabled).toBe(false);
  });

  /**
   * Minor 10: il valore noto appartiene all'account che sta uscendo. Senza
   * azzerarlo, un secondo utente il cui primo `/api/me` fallisse verrebbe
   * giudicato sul diritto di chi era uscito prima.
   */
  it("signOut azzera il valore noto, in stato e nel segnaposto", async () => {
    await setSetting(AI_ENABLED, "0");
    useAccountStore.setState({ token: "un-token", aiEnabled: false });

    await useAccountStore.getState().signOut();

    expect(useAccountStore.getState().aiEnabled).toBeNull();
    expect(await getSetting(AI_ENABLED)).toBeNull();
  });
});
