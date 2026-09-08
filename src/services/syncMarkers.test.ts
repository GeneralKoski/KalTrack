import { AI_ENABLED, readAiEnabled, writeAiEnabled } from "@/src/services/syncMarkers";

const mockGetSetting = jest.fn();
const mockSetSetting = jest.fn(async () => undefined);
jest.mock("@/src/db/queries/settings", () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...(args as [])),
  setSetting: (...args: unknown[]) => mockSetSetting(...(args as [])),
}));

beforeEach(() => {
  mockGetSetting.mockReset();
  mockSetSetting.mockClear();
});

describe("readAiEnabled", () => {
  /**
   * `restore()` chiama questa funzione DENTRO il proprio `try`, ma solo
   * perche' questa non lancia mai: se lo facesse, un database non sano
   * lascerebbe `isHydrated` per sempre falso, e con lui l'intera catena di
   * avvio (`runSync`, `syncSharedStats`, il catalogo) non partirebbe.
   */
  it("non lancia se la lettura fallisce, e torna null", async () => {
    mockGetSetting.mockRejectedValueOnce(new Error("database non sano"));
    await expect(readAiEnabled()).resolves.toBeNull();
  });

  it("torna null quando la riga non c'e' ancora", async () => {
    mockGetSetting.mockResolvedValueOnce(null);
    await expect(readAiEnabled()).resolves.toBeNull();
  });

  it("legge '1'/'0' come booleano", async () => {
    mockGetSetting.mockResolvedValueOnce("1");
    await expect(readAiEnabled()).resolves.toBe(true);
    mockGetSetting.mockResolvedValueOnce("0");
    await expect(readAiEnabled()).resolves.toBe(false);
  });
});

describe("writeAiEnabled", () => {
  it("scrive '1'/'0' per un booleano esplicito", async () => {
    await writeAiEnabled(true);
    expect(mockSetSetting).toHaveBeenCalledWith(AI_ENABLED, "1");
    await writeAiEnabled(false);
    expect(mockSetSetting).toHaveBeenCalledWith(AI_ENABLED, "0");
  });

  /**
   * `/api/me` e' un confine di sistema: `apiRequest` non valida la risposta,
   * e un campo assente (versione del backend disallineata) non deve
   * collassare in "no". Un valore che non e' un booleano non scrive NIENTE:
   * il segnaposto resta quel che era.
   */
  it("non scrive nulla per un valore che non e' un booleano esplicito", async () => {
    await writeAiEnabled(undefined as unknown as boolean);
    expect(mockSetSetting).not.toHaveBeenCalled();

    await writeAiEnabled(null as unknown as boolean);
    expect(mockSetSetting).not.toHaveBeenCalled();
  });
});
