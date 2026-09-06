import { apiRequest } from "@/src/api/client";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { runSync } from "@/src/services/sync";

jest.mock("@/src/api/client");
jest.mock("@/src/api/config", () => ({
  hasBackend: () => true,
  API_URL: "https://esempio.test/api",
}));
jest.mock("@/src/stores/accountStore", () => ({
  useAccountStore: { getState: () => ({ token: "token-di-prova" }) },
}));
jest.mock("@/src/services/photoSync", () => ({
  collectOrphanPhotos: jest.fn(async () => {}),
  uploadPendingPhotos: jest.fn(async () => {}),
}));

const apiMock = jest.mocked(apiRequest);

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  apiMock.mockReset();
});

afterEach(() => __setDbForTesting(null));

/** Una risposta vuota: niente da applicare, niente da continuare. */
const emptyResponse = { applied: 0, changes: [], cursor: "0" };

describe("un giro alla volta", () => {
  /**
   * Il difetto che questo test blocca: all'avvio partivano due giri insieme -
   * `App.tsx` chiama `runSync` nel `.then()` di `restore()`, e
   * `startSyncScheduler` ne fa partire un altro subito - e il server si vedeva
   * arrivare due `POST /sync` nello stesso secondo. La guardia stava in
   * `syncScheduler`, che pero' e' solo uno dei tre chiamanti.
   */
  it("un secondo giro chiamato mentre il primo e' in corso non parte", async () => {
    let sblocca: () => void = () => {};
    const inCorso = new Promise<void>((resolve) => {
      sblocca = resolve;
    });
    apiMock.mockImplementation(async () => {
      await inCorso;
      return emptyResponse as never;
    });

    const primo = runSync();
    // Nessun await in mezzo: e' esattamente la sovrapposizione che si vuole.
    const secondo = runSync();

    expect(await secondo).toBeNull();
    sblocca();
    await primo;
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it("finito il primo, il giro dopo parte di nuovo", async () => {
    apiMock.mockResolvedValue(emptyResponse as never);

    await runSync();
    await runSync();

    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  /** La guardia si libera anche quando il giro fallisce, o si bloccherebbe per sempre. */
  it("un giro fallito non lascia la porta chiusa", async () => {
    apiMock.mockRejectedValueOnce(new Error("server error"));
    expect(await runSync()).toBeNull();

    apiMock.mockResolvedValue(emptyResponse as never);
    expect(await runSync()).not.toBeNull();
  });
});
