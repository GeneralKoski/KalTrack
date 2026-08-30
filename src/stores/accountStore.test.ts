import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { CURSOR_KEY, PUSHED_KEY } from "@/src/services/syncMarkers";
import { useAccountStore } from "@/src/stores/accountStore";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock("@/src/api/social", () => ({
  fetchMyProfile: jest.fn(async () => ({
    id: 1,
    handle: "anna",
    displayName: "Anna",
  })),
  logout: jest.fn(async () => undefined),
}));

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  useAccountStore.setState({ token: null, profile: null });
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
