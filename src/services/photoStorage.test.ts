import {
  deletePhoto,
  discardPhoto,
  persistPhoto,
  PHOTOS_DIR,
} from "@/src/services/photoStorage";
import { logger } from "@/src/utils/logger";
import * as FileSystem from "expo-file-system/legacy";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///doc/",
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

// Il prefisso `mock` e' obbligatorio: jest.mock viene issato in cima al file.
const mockRenderAsync = jest.fn();
const mockResize = jest.fn();
const mockSaveAsync = jest.fn();

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
  ImageManipulator: {
    manipulate: () => ({ resize: mockResize, renderAsync: mockRenderAsync }),
  },
}));

const fs = FileSystem as jest.Mocked<typeof FileSystem>;

/** Un render di dimensioni date, che si sa salvare. */
const render = (width: number, height: number) => ({
  width,
  height,
  saveAsync: mockSaveAsync,
});

/**
 * Un finto filesystem, e non un `getInfoAsync` che risponde sempre lo stesso.
 *
 * `persistPhoto` ora chiede all'archivio se il file c'e' DOPO averlo scritto:
 * con una risposta fissa i due casi - scritto e non scritto - non si
 * distinguerebbero. Qui `copyAsync` annota dove ha copiato, e `getInfoAsync`
 * risponde di conseguenza.
 */
const scritti = new Set<string>();

beforeEach(() => {
  jest.clearAllMocks();
  scritti.clear();
  fs.getInfoAsync.mockImplementation(
    async (uri: string) => ({ exists: scritti.has(uri) }) as never,
  );
  fs.makeDirectoryAsync.mockResolvedValue(undefined);
  fs.copyAsync.mockImplementation(async ({ to }) => {
    scritti.add(to);
  });
  fs.deleteAsync.mockResolvedValue(undefined);
  mockResize.mockReturnValue({ renderAsync: mockRenderAsync });
  mockSaveAsync.mockResolvedValue({ uri: "file:///cache/ridotta.jpg" });
});

describe("persistPhoto", () => {
  /**
   * Il difetto che questo test blocca: l'archivio conservava il file come
   * usciva dalla fotocamera. Il server rifiuta oltre i 5 MB, `uploadOne`
   * annotava il rifiuto e andava avanti, e sull'altro telefono restava il
   * segnaposto per sempre - con la riga sincronizzata e nessuno a dire perche'.
   */
  it("riduce il lato lungo prima di archiviare", async () => {
    mockRenderAsync.mockResolvedValue(render(4032, 3024));

    const uri = await persistPhoto("file:///cache/scatto.jpg", "progress");

    expect(mockResize).toHaveBeenCalledWith({ width: 1600 });
    expect(mockSaveAsync).toHaveBeenCalledWith(
      expect.objectContaining({ format: "jpeg" }),
    );
    expect(uri.startsWith(`${PHOTOS_DIR}/progress-`)).toBe(true);
    expect(uri.endsWith(".jpg")).toBe(true);
  });

  it("riduce sul lato giusto per una foto verticale", async () => {
    mockRenderAsync.mockResolvedValue(render(3024, 4032));

    await persistPhoto("file:///cache/scatto.jpg", "progress");

    expect(mockResize).toHaveBeenCalledWith({ height: 1600 });
  });

  it("non riduce quel che e' gia' piccolo", async () => {
    mockRenderAsync.mockResolvedValue(render(800, 600));

    await persistPhoto("file:///cache/scatto.jpg", "meal");

    expect(mockResize).not.toHaveBeenCalled();
    expect(mockSaveAsync).toHaveBeenCalled();
  });

  /**
   * Una foto piu' grande del necessario e' un difetto di peso; una foto che non
   * si salva e' un pasto che non si registra. Se il formato non si sa leggere,
   * meglio il file intero che niente.
   */
  it("archivia l'originale se la riduzione non riesce", async () => {
    mockRenderAsync.mockRejectedValue(new Error("formato non supportato"));

    const uri = await persistPhoto("file:///cache/scatto.heic", "meal");

    expect(fs.copyAsync).toHaveBeenCalledWith({
      from: "file:///cache/scatto.heic",
      to: uri,
    });
  });

  /** L'estensione dell'archivio dice il formato del file, non quello di partenza. */
  it("nomina sempre .jpg, qualunque cosa sia entrata", async () => {
    mockRenderAsync.mockResolvedValue(render(200, 200));

    const uri = await persistPhoto("file:///cache/scatto.png", "food");

    expect(uri.endsWith(".jpg")).toBe(true);
  });

  it("lascia stare quel che non e' un file locale", async () => {
    const spia = jest.spyOn(logger, "warn").mockImplementation(() => {});
    const remoto = "https://esempio.tld/foto.jpg";
    expect(await persistPhoto(remoto, "food")).toBe(remoto);
    expect(fs.copyAsync).not.toHaveBeenCalled();
    spia.mockRestore();
  });

  /**
   * Il difetto che ha portato al riquadro nero nel modulo di un alimento: se
   * ne' la riduzione ne' il ripiego mettono il file in archivio, `persistPhoto`
   * restituiva `target` comunque - un percorso senza niente dietro, scritto a
   * database, e un'anteprima vuota senza un guasto da nessuna parte.
   */
  it("non promette un archivio che non ha ricevuto il file", async () => {
    mockRenderAsync.mockResolvedValue(render(200, 200));
    // La copia "riesce" senza scrivere niente: e' il caso che nessuno vedeva.
    fs.copyAsync.mockResolvedValue(undefined);
    const spia = jest.spyOn(logger, "error").mockImplementation(() => {});

    const uri = await persistPhoto("file:///cache/scatto.jpg", "food");

    expect(uri).toBe("file:///cache/scatto.jpg");
    expect(spia).toHaveBeenCalled();
    spia.mockRestore();
  });

  /** L'archivio si interroga dopo aver scritto, non prima: prima la risposta
   *  era sempre "no", perche' il nome e' un UUID appena generato. */
  it("chiede all'archivio dopo aver scritto, non prima", async () => {
    mockRenderAsync.mockResolvedValue(render(200, 200));

    const uri = await persistPhoto("file:///cache/scatto.jpg", "food");

    const domande = fs.getInfoAsync.mock.calls.map((call) => call[0]);
    expect(domande).toEqual([PHOTOS_DIR, uri]);
    expect(fs.getInfoAsync).toHaveBeenCalledTimes(2);
  });

  /**
   * Un URI che non e' un file locale - un `content://` di Android - si
   * restituisce com'e', perche' non c'e' niente da copiare. Ma va REGISTRATO:
   * era l'unica uscita di questa funzione che non lasciava traccia, e la riga
   * salvata puntava alla cache invece che all'archivio.
   */
  it("registra l'URI che non si sa archiviare", async () => {
    const spia = jest.spyOn(logger, "warn").mockImplementation(() => {});
    const content = "content://media/external/images/42";

    expect(await persistPhoto(content, "food")).toBe(content);

    expect(spia).toHaveBeenCalledWith(expect.stringContaining(content));
    spia.mockRestore();
  });

  it("lascia stare quel che e' gia' in archivio", async () => {
    const dentro = `${PHOTOS_DIR}/food-abc.jpg`;
    expect(await persistPhoto(dentro, "food")).toBe(dentro);
    expect(fs.copyAsync).not.toHaveBeenCalled();
  });
});

describe("cancellazione", () => {
  it("cancella solo le foto dell'archivio", async () => {
    await discardPhoto(`${PHOTOS_DIR}/food-abc.jpg`);
    expect(fs.deleteAsync).toHaveBeenCalledWith(
      `${PHOTOS_DIR}/food-abc.jpg`,
      { idempotent: true },
    );

    jest.clearAllMocks();
    // L'URI di un picker sta in cache e non e' nostro: cancellarlo non e'
    // affar nostro.
    await discardPhoto("file:///cache/altro.jpg");
    expect(fs.deleteAsync).not.toHaveBeenCalled();
  });

  it("su null non fa niente e non solleva", async () => {
    await expect(discardPhoto(null)).resolves.toBeUndefined();
    expect(fs.deleteAsync).not.toHaveBeenCalled();
  });

  it("deletePhoto e discardPhoto sono la stessa funzione", () => {
    expect(deletePhoto).toBe(discardPhoto);
  });
});
