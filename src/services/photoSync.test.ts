import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import {
  catalogPhotoPath,
  collectOrphanPhotos,
  ensureLocalPhoto,
  nameOf,
  uploadPendingPhotos,
} from "@/src/services/photoSync";
import { PHOTOS_DIR } from "@/src/services/photoStorage";
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
  fs.makeDirectoryAsync.mockResolvedValue(undefined);
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

describe("la raccolta delle foto orfane", () => {
  let db: LocalDatabase;

  /** Una foto dei progressi, cancellata o no. */
  const progressPhoto = async (
    id: string,
    name: string,
    cancellata: boolean,
  ) => {
    await db.runAsync(
      `INSERT INTO progress_photos (id, date, uri, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        "2026-09-02",
        `file:///doc/photos/${name}`,
        "2026-09-02T08:00:00.000Z",
        "2026-09-02T08:00:00.000Z",
        cancellata ? "2026-09-02T09:00:00.000Z" : null,
      ],
    );
  };

  beforeEach(async () => {
    db = createTestDb();
    await runMigrations(db);
    __setDbForTesting(db);
    fs.getInfoAsync.mockResolvedValue({ exists: true } as never);
    // La cartella del catalogo vuota: questi test parlano delle foto
    // dell'utente, e `jest.clearAllMocks()` azzera le chiamate ma NON le
    // implementazioni, quindi senza questa riga un elenco lasciato da un
    // test precedente conterebbe come foto di catalogo da raccogliere.
    fs.readDirectoryAsync.mockResolvedValue([]);
  });

  afterEach(() => __setDbForTesting(null));

  it("toglie la foto di una riga cancellata, qui e sul server", async () => {
    await progressPhoto("p1", "progress-morta.jpg", true);
    mockApiRequest.mockImplementation(async (args: { method: string }) =>
      args.method === "get" ? { names: ["progress-morta.jpg"] } : {},
    );

    expect(await collectOrphanPhotos()).toBe(1);

    expect(fs.deleteAsync).toHaveBeenCalledWith(
      "file:///doc/photos/progress-morta.jpg",
      { idempotent: true },
    );
    expect(mockApiRequest).toHaveBeenCalledWith({
      method: "delete",
      path: "/images/progress-morta.jpg",
    });
  });

  /**
   * CLAUDE.md § Le foto: "Due ordini che non si invertono - prima il file
   * locale, poi quello remoto". Nell'altro verso, un'interruzione fra i due
   * passaggi lascerebbe qui un file che nessuna riga nomina piu', e
   * `uploadPendingPhotos` - che manda tutto quel che trova in cartella - lo
   * ricaricherebbe al giro dopo: una foto cancellata e rimessa all'infinito.
   */
  it("cancella prima il file locale e poi quello remoto", async () => {
    await progressPhoto("p1", "progress-morta.jpg", true);
    const ordine: string[] = [];
    fs.deleteAsync.mockImplementation(async () => {
      ordine.push("locale");
    });
    mockApiRequest.mockImplementation(async (args: { method: string }) => {
      if (args.method === "delete") ordine.push("remoto");
      return args.method === "get" ? { names: ["progress-morta.jpg"] } : {};
    });

    await collectOrphanPhotos();

    expect(ordine).toEqual(["locale", "remoto"]);
  });

  it("non tocca la foto di una riga viva", async () => {
    await progressPhoto("p1", "progress-viva.jpg", false);
    mockApiRequest.mockResolvedValue({ names: ["progress-viva.jpg"] });

    expect(await collectOrphanPhotos()).toBe(0);
    expect(fs.deleteAsync).not.toHaveBeenCalled();
  });

  /**
   * Il caso normale, non la cautela in piu': una foto libera del diario e'
   * condivisa fra le N voci nate dalla stessa stima. Togliere "il pane" non
   * deve portare via l'immagine alle altre due.
   */
  it("non tocca una foto che una riga viva nomina ancora", async () => {
    await progressPhoto("p1", "condivisa.jpg", true);
    await progressPhoto("p2", "condivisa.jpg", false);
    mockApiRequest.mockResolvedValue({ names: ["condivisa.jpg"] });

    expect(await collectOrphanPhotos()).toBe(0);
    expect(fs.deleteAsync).not.toHaveBeenCalled();
  });

  /**
   * Il difetto che questo test blocca: il criterio ovvio - "quel che il server
   * ha e il telefono no" - avrebbe cancellato l'unica copia di una foto
   * scattata su un altro dispositivo e non ancora scaricata qui.
   */
  it("non cancella quel che sta solo sul server", async () => {
    mockApiRequest.mockResolvedValue({
      names: ["scattata-altrove.jpg", "e-questa-pure.jpg"],
    });

    expect(await collectOrphanPhotos()).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "delete" }),
    );
  });

  it("toglie comunque il file locale se il server non risponde", async () => {
    await progressPhoto("p1", "progress-morta.jpg", true);
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    // Con l'elenco remoto illeggibile il nome risulta "non sul server", quindi
    // la cancellazione remota non parte. Il file locale se ne va comunque, e la
    // riga resta cancellata: al giro dopo `orphanPhotoUris` la ritrova e la
    // remota se ne va allora. Si sistema da solo.
    await collectOrphanPhotos();

    expect(fs.deleteAsync).toHaveBeenCalledWith(
      "file:///doc/photos/progress-morta.jpg",
      { idempotent: true },
    );
  });
});

describe("le foto del catalogo", () => {
  /**
   * La cartella decide l'endpoint, e non e' una scorciatoia: una foto di
   * catalogo e' comune a tutti gli iscritti e vive in
   * `storage/app/private/catalog/`, mentre `/images/{name}` serve i file di
   * un utente. Chiedere una foto di catalogo a `/images` e' un 404 sicuro, e
   * il segnaposto resterebbe per sempre.
   */
  it("scarica da /catalog/images quando la foto e' di catalogo", async () => {
    const uri = catalogPhotoPath("ex-panca.jpg");
    fs.getInfoAsync.mockResolvedValue({ exists: false } as never);
    fs.downloadAsync.mockResolvedValue({ status: 200 } as never);

    expect(await ensureLocalPhoto(uri)).toBe(uri);

    expect(fs.downloadAsync).toHaveBeenCalledWith(
      "https://esempio.tld/api/catalog/images/ex-panca.jpg",
      uri,
      expect.objectContaining({
        headers: { Authorization: "Bearer token-valido" },
      }),
    );
  });

  it("una foto dell'utente continua a passare da /images", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false } as never);
    fs.downloadAsync.mockResolvedValue({ status: 200 } as never);

    await ensureLocalPhoto(`${PHOTOS_DIR}/recipe-1.jpg`);

    expect(fs.downloadAsync).toHaveBeenCalledWith(
      "https://esempio.tld/api/images/recipe-1.jpg",
      `${PHOTOS_DIR}/recipe-1.jpg`,
      expect.anything(),
    );
  });

  /**
   * Il pull scrive il percorso prima che i byte ci siano: la foto gia' qui non
   * deve costare una richiesta a ogni disegno.
   */
  it("non chiede niente se la foto di catalogo e' gia' qui", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true } as never);

    const uri = catalogPhotoPath("ex-panca.jpg");
    expect(await ensureLocalPhoto(uri)).toBe(uri);
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });
});

/**
 * F6 della review finale: le foto di catalogo non si raccoglievano MAI, e il
 * raccoglitore dichiarava di averle rimosse. `orphanPhotoUris` restituiva
 * anche i loro nomi (le due colonne che le contengono sono nell'elenco), e
 * `collectOrphanPhotos` cancellava `PHOTOS_DIR/<nome>` - la cartella
 * sbagliata, quindi un no-op - e lo contava fra le rimosse perche' quel nome
 * non e' nell'elenco `/images` dell'utente.
 */
describe("la raccolta delle foto di catalogo", () => {
  let db: LocalDatabase;

  const esercizio = async (
    id: string,
    photoUri: string | null,
    cancellato = false,
  ) => {
    await db.runAsync(
      `INSERT INTO exercises (id, name, name_norm, muscle_group, photo_uri,
                              created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        id,
        id,
        "petto",
        photoUri,
        "2026-09-09T08:00:00.000Z",
        "2026-09-09T08:00:00.000Z",
        cancellato ? "2026-09-09T09:00:00.000Z" : null,
      ],
    );
  };

  beforeEach(async () => {
    db = createTestDb();
    await runMigrations(db);
    __setDbForTesting(db);
    fs.getInfoAsync.mockResolvedValue({ exists: true } as never);
    mockApiRequest.mockResolvedValue({ names: [] });
  });

  afterEach(() => __setDbForTesting(null));

  /**
   * Il caso che non era raccoglibile nemmeno in principio: il pannello
   * sostituisce la foto, il pull scrive il percorso nuovo su una riga VIVA, e
   * dal quel momento il file vecchio non e' nominato da nessuno - ne' fra le
   * righe cancellate ne' fra le vive.
   */
  it("toglie il file che nessuna riga nomina piu', e non chiede niente al server", async () => {
    await esercizio("ex-panca", catalogPhotoPath("nuova.jpg"));
    fs.readDirectoryAsync.mockResolvedValue(["nuova.jpg", "vecchia.jpg"]);

    expect(await collectOrphanPhotos()).toBe(1);

    expect(fs.deleteAsync).toHaveBeenCalledWith(catalogPhotoPath("vecchia.jpg"), {
      idempotent: true,
    });
    expect(fs.deleteAsync).not.toHaveBeenCalledWith(
      catalogPhotoPath("nuova.jpg"),
      expect.anything(),
    );
    // La foto sta in `storage/app/private/catalog/`, comune a tutti gli
    // iscritti: cancellarla di la' la porterebbe via a tutti.
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "delete" }),
    );
  });

  /**
   * Una riga cancellata dall'utente non rende orfana la foto di catalogo: e'
   * ancora la foto di quella voce per tutti gli altri, e se la ripristinasse
   * la vorrebbe vedere.
   */
  it("non tocca la foto di catalogo di una riga cancellata", async () => {
    await esercizio("ex-panca", catalogPhotoPath("ex-panca.jpg"), true);
    fs.readDirectoryAsync.mockResolvedValue(["ex-panca.jpg"]);

    expect(await collectOrphanPhotos()).toBe(0);
    expect(fs.deleteAsync).not.toHaveBeenCalled();
  });

  /**
   * L'altra meta' del difetto: quel nome non deve entrare fra le orfane
   * dell'utente, dove veniva contato come rimosso dopo aver cancellato un
   * file in una cartella dove non e' mai stato.
   */
  it("il nome di una foto di catalogo non si conta fra le orfane dell'utente", async () => {
    await esercizio("ex-panca", catalogPhotoPath("ex-panca.jpg"), true);
    // La cartella del catalogo e' vuota: il file non e' ancora stato
    // scaricato. Nessuna delle due raccolte ha niente da fare.
    fs.readDirectoryAsync.mockResolvedValue([]);

    expect(await collectOrphanPhotos()).toBe(0);
    expect(fs.deleteAsync).not.toHaveBeenCalledWith(
      `${PHOTOS_DIR}/ex-panca.jpg`,
      expect.anything(),
    );
  });

  /** Senza la cartella non c'e' niente da raccogliere, e non e' un errore. */
  it("una cartella che non esiste non e' un guasto", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: false } as never);

    expect(await collectOrphanPhotos()).toBe(0);
    expect(fs.readDirectoryAsync).not.toHaveBeenCalled();
  });
});
