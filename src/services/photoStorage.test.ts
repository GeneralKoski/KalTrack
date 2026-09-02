import {
  deletePhoto,
  discardPhoto,
  persistPhoto,
  PHOTOS_DIR,
} from "@/src/services/photoStorage";
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

beforeEach(() => {
  jest.clearAllMocks();
  fs.getInfoAsync.mockResolvedValue({ exists: false } as never);
  fs.makeDirectoryAsync.mockResolvedValue(undefined);
  fs.copyAsync.mockResolvedValue(undefined);
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
    const remoto = "https://esempio.tld/foto.jpg";
    expect(await persistPhoto(remoto, "food")).toBe(remoto);
    expect(fs.copyAsync).not.toHaveBeenCalled();
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
