import {
  AI_ENABLED,
  LOCAL_ONLY_SETTINGS,
  readAiEnabled,
  RESTORE_BUCKETS,
  writeAiEnabled,
} from "@/src/services/syncMarkers";

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

/**
 * IL QUARTO CANCELLO DELLE DICHIARAZIONI, che era l'unico senza guardia.
 *
 * `SYNCED_TABLES`/`LOCAL_ONLY_TABLES` hanno il loro test contro lo schema
 * reale, `BACKUP_TABLES` ha il suo, `LOCAL_ONLY_SETTINGS` non ne aveva
 * nessuno: niente costringeva una chiave nuova a entrarci, e nessuno chiedeva
 * se una chiave local-only dovesse anche restare fuori dal BACKUP - che e'
 * un'altra domanda, perche' `settings` sta in `BACKUP_TABLES` e `buildBackup`
 * fa `SELECT *`. E' la condizione che ha lasciato `progress_photos` fuori
 * dalla sincronizzazione per settimane, e qui aveva lasciato `ai.enabled`
 * dentro un backup ripristinabile su un altro account (F9).
 */
describe("il cancello di LOCAL_ONLY_SETTINGS", () => {
  it("e' l'unione esatta dei due elenchi del ripristino", () => {
    const unione = [...RESTORE_BUCKETS.forgotten, ...RESTORE_BUCKETS.kept];

    expect([...LOCAL_ONLY_SETTINGS].sort()).toEqual([...unione].sort());
  });

  /**
   * Disgiunti: una chiave in entrambi vorrebbe dire che nessuno ha risposto
   * alla domanda, l'ha solo scritta due volte.
   */
  it("nessuna chiave sta in tutti e due", () => {
    const dimenticate = new Set<string>(RESTORE_BUCKETS.forgotten);

    for (const chiave of RESTORE_BUCKETS.kept) {
      expect(dimenticate.has(chiave)).toBe(false);
    }
  });

  /**
   * `ai.enabled` e' la cache di un fatto di cui il server e' l'autorita' per
   * QUELL'account: il backup di A ripristinato da B lo giudicherebbe sul
   * diritto di A fino al primo `/api/me` riuscito.
   */
  it("il diritto AI e' fra quelle che un ripristino dimentica", () => {
    expect(RESTORE_BUCKETS.forgotten).toContain(AI_ENABLED);
  });
});
