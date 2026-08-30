import { ensureLocalPhoto, nameOf, uploadPendingPhotos } from "@/src/services/photoSync";
import { useAccountStore } from "@/src/stores/accountStore";
import * as FileSystem from "expo-file-system/legacy";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  getInfoAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
  uploadAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  FileSystemUploadType: { MULTIPART: "multipart" },
}));

jest.mock("@/src/api/config", () => ({
  API_URL: "https://esempio.tld/api",
  API_TIMEOUT_MS: 1000,
  hasBackend: () => true,
}));

// Il prefisso `mock` non e' vezzo: jest.mock viene issato in cima al file e
// senza quel prefisso rifiuta di leggere una variabile dichiarata dopo.
const mockApiRequest = jest.fn();
jest.mock("@/src/api/client", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  // Lo store dell'account lo registra all'import: senza, il modulo non si
  // carica nemmeno.
  setAuthTokenProvider: jest.fn(),
}));

const fs = FileSystem as jest.Mocked<typeof FileSystem>;

beforeEach(() => {
  jest.clearAllMocks();
  useAccountStore.setState({ token: "token-valido", profile: null });
  fs.deleteAsync.mockResolvedValue(undefined);
});

describe("il nome di una foto", () => {
  it("e' l'ultima parte del percorso, che e' la sola cosa che i due telefoni condividono", () => {
    expect(nameOf("file:///doc/photos/recipe-abc.jpg")).toBe("recipe-abc.jpg");
    // Su un altro sistema la cartella e' un'altra, il nome resta lo stesso.
    expect(nameOf("file:///var/mobile/x/photos/recipe-abc.jpg")).toBe(
      "recipe-abc.jpg",
    );
  });
});

describe("mostrare una foto arrivata da un altro telefono", () => {
  it("se il file c'e' gia' non scarica niente", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true } as never);

    const risultato = await ensureLocalPhoto("file:///altro/photos/x.jpg");

    expect(risultato).toBe("file:///doc/photos/x.jpg");
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });

  it("se manca lo scarica dal server", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false } as never);
    fs.downloadAsync.mockResolvedValue({ status: 200 } as never);

    const risultato = await ensureLocalPhoto("file:///altro/photos/x.jpg");

    expect(risultato).toBe("file:///doc/photos/x.jpg");
    expect(fs.downloadAsync).toHaveBeenCalledWith(
      "https://esempio.tld/api/images/x.jpg",
      "file:///doc/photos/x.jpg",
      { headers: { Authorization: "Bearer token-valido" } },
    );
  });

  /**
   * Un 404 e' normale: il telefono che l'ha scattata puo' non averla ancora
   * caricata. Il file scritto a meta' va tolto, o al giro dopo lo troveremmo
   * "esistente" e mostreremmo dei byte che non sono un'immagine.
   */
  it("una foto non ancora caricata non lascia un file rotto", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false } as never);
    fs.downloadAsync.mockResolvedValue({ status: 404 } as never);

    const risultato = await ensureLocalPhoto("file:///altro/photos/x.jpg");

    expect(risultato).toBeNull();
    expect(fs.deleteAsync).toHaveBeenCalledWith("file:///doc/photos/x.jpg", {
      idempotent: true,
    });
  });

  it("senza account non prova nemmeno", async () => {
    useAccountStore.setState({ token: null, profile: null });
    fs.getInfoAsync.mockResolvedValue({ exists: false } as never);

    expect(await ensureLocalPhoto("file:///altro/photos/x.jpg")).toBeNull();
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });

  it("una rete che cade non solleva: l'app deve continuare a disegnare", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false } as never);
    fs.downloadAsync.mockRejectedValue(new Error("niente rete"));

    await expect(
      ensureLocalPhoto("file:///altro/photos/x.jpg"),
    ).resolves.toBeNull();
  });
});

describe("mandare al server le foto che mancano", () => {
  it("manda solo quelle che il server non ha gia'", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true } as never);
    fs.readDirectoryAsync.mockResolvedValue(["vecchia.jpg", "nuova.jpg"]);
    mockApiRequest.mockResolvedValue({ names: ["vecchia.jpg"] });
    fs.uploadAsync.mockResolvedValue({ status: 201 } as never);

    const inviate = await uploadPendingPhotos();

    expect(inviate).toBe(1);
    expect(fs.uploadAsync).toHaveBeenCalledTimes(1);
    expect(fs.uploadAsync).toHaveBeenCalledWith(
      "https://esempio.tld/api/images",
      "file:///doc/photos/nuova.jpg",
      expect.objectContaining({ parameters: { name: "nuova.jpg" } }),
    );
  });

  it("una foto rifiutata non ferma le altre", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true } as never);
    fs.readDirectoryAsync.mockResolvedValue(["enorme.jpg", "normale.jpg"]);
    mockApiRequest.mockResolvedValue({ names: [] });
    fs.uploadAsync
      .mockResolvedValueOnce({ status: 422 } as never)
      .mockResolvedValueOnce({ status: 201 } as never);

    expect(await uploadPendingPhotos()).toBe(1);
  });

  it("senza account non manda niente", async () => {
    useAccountStore.setState({ token: null, profile: null });

    expect(await uploadPendingPhotos()).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it("senza cartella delle foto non chiede nemmeno l'elenco", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false } as never);

    expect(await uploadPendingPhotos()).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  /**
   * Le foto sono un extra della sincronizzazione: se il server non risponde i
   * dati sono comunque al sicuro, e si riprova al giro dopo.
   */
  it("un errore del server non solleva", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true } as never);
    fs.readDirectoryAsync.mockResolvedValue(["x.jpg"]);
    mockApiRequest.mockRejectedValue(new Error("500"));

    await expect(uploadPendingPhotos()).resolves.toBe(0);
  });
});
