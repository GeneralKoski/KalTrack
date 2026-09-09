import { PhotoField, PhotoTile } from "@/src/components/kal/PhotoField";
import { PHOTOS_DIR } from "@/src/services/photoStorage";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImageOff } from "lucide-react-native";
import React from "react";
import {
  Image as RNImage,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/**
 * Il difetto che questi test bloccano e' il riquadro nero al posto della foto
 * appena scattata nel modulo di un alimento.
 *
 * Le due anteprime di questo file erano le ultime due superfici fotografiche
 * dell'app a disegnare con l'`Image` di React Native invece che con
 * `SyncedPhoto`: nessuna delle due si chiedeva se il file fosse su QUESTO
 * telefono, e per un percorso senza niente dietro - una foto arrivata da un
 * altro dispositivo, o una che l'archivio non ha ricevuto - non disegnavano
 * ne' l'immagine ne' il segnaposto. Solo il vuoto.
 */

jest.mock("@/src/components/DfBottomSheet", () => {
  // jest issa jest.mock in cima al file, prima di ogni import: la fabbrica
  // deve richiedersi React da se'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return {
    DfBottomSheet: ReactLib.forwardRef(
      ({ children }: { children: React.ReactNode }, _ref: unknown) =>
        ReactLib.createElement(View, null, children),
    ),
  };
});

/* Il prefisso `mock` non e' vezzo: senza, jest.mock rifiuta di leggere una
   variabile dichiarata dopo di se'. */
const mockEnsureLocalPhoto = jest.fn<Promise<string | null>, [string]>();
jest.mock("@/src/services/photoSync", () => ({
  ensureLocalPhoto: (uri: string) => mockEnsureLocalPhoto(uri),
}));

const mockPersistPhoto = jest.fn<Promise<string>, [string, string]>();
jest.mock("@/src/services/photoStorage", () => ({
  ...jest.requireActual("@/src/services/photoStorage"),
  persistPhoto: (uri: string, prefix: string) =>
    mockPersistPhoto(uri, prefix),
  discardPhoto: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;

const ARCHIVIATA = `${PHOTOS_DIR}/food-abc.jpg`;
const IN_CACHE = "file:///cache/ImagePicker/scatto.jpg";

const monta = async (element: React.ReactElement): Promise<ReactTestRenderer> => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
};

/** La riga del foglio, che porta l'etichetta come accessibilityLabel. */
const premi = async (renderer: ReactTestRenderer, label: string) => {
  const riga = renderer.root
    .findAllByType(TouchableOpacity)
    .find((node) => node.props.accessibilityLabel === label);
  await act(async () => {
    riga?.props.onPress();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureLocalPhoto.mockResolvedValue(null);
  mockPersistPhoto.mockResolvedValue(ARCHIVIATA);
  picker.requestCameraPermissionsAsync.mockResolvedValue({
    granted: true,
  } as never);
});

describe("PhotoTile", () => {
  it("disegna la foto che e' qui", async () => {
    mockEnsureLocalPhoto.mockResolvedValue(ARCHIVIATA);

    const renderer = await monta(
      <PhotoTile uri={ARCHIVIATA} onChange={() => {}} label="Foto" />,
    );

    expect(mockEnsureLocalPhoto).toHaveBeenCalledWith(ARCHIVIATA);
    expect(renderer.root.findByType(ExpoImage).props.source).toEqual({
      uri: ARCHIVIATA,
    });
    expect(renderer.root.findAllByType(ImageOff)).toHaveLength(0);
  });

  /**
   * Il rettangolo vuoto sembra un difetto dell'app, il segnaposto dice che la
   * foto esiste e non e' ancora arrivata (`CLAUDE.md` § Le foto).
   */
  it("con un uri che non ha un file dietro disegna il segnaposto", async () => {
    const renderer = await monta(
      <PhotoTile uri={ARCHIVIATA} onChange={() => {}} label="Foto" />,
    );

    expect(renderer.root.findAllByType(ImageOff)).toHaveLength(1);
    expect(renderer.root.findAllByType(ExpoImage)).toHaveLength(0);
    // Il difetto era proprio questo: un'`Image` di RN col percorso dentro, che
    // per un file assente non disegna niente e non lo dice.
    expect(renderer.root.findAllByType(RNImage)).toHaveLength(0);
  });

  /**
   * La sostituzione che questo task esiste per fare, enunciata dove si vede:
   * quel che si disegna e' il percorso RISOLTO, non l'uri della riga. Con un
   * `ensureLocalPhoto` che rimanda indietro il suo argomento i due sono
   * indistinguibili, e un'`Image` col percorso della riga dentro passerebbe.
   *
   * Non e' un caso di scuola: la cartella dell'app cambia da un sistema
   * all'altro, quindi una riga arrivata dall'altro telefono porta un percorso
   * che qui non esiste - l'identita' di una foto e' il suo nome.
   */
  it("disegna il percorso risolto, non quello scritto nella riga", async () => {
    const altroTelefono = "file:///var/mobile/x/photos/food-abc.jpg";
    mockEnsureLocalPhoto.mockResolvedValue(ARCHIVIATA);

    const renderer = await monta(
      <PhotoTile uri={altroTelefono} onChange={() => {}} label="Foto" />,
    );

    expect(mockEnsureLocalPhoto).toHaveBeenCalledWith(altroTelefono);
    expect(renderer.root.findByType(ExpoImage).props.source).toEqual({
      uri: ARCHIVIATA,
    });
  });

  /**
   * 64, e non e' una misura qualunque: la tessera esiste perche' la foto del
   * prodotto si prendeva mezza pagina in un modulo il cui lavoro e' digitare
   * numeri. Chi la fa crescere rimette quel difetto.
   */
  it("resta una tessera da 64", async () => {
    const renderer = await monta(
      <PhotoTile uri={null} onChange={() => {}} label="Foto" />,
    );

    const tessera = renderer.root
      .findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === "Foto");
    expect(StyleSheet.flatten(tessera?.props.style)).toMatchObject({
      width: 64,
      height: 64,
    });
  });

  /*
   * I tre stili che insieme rendevano la tessera un quadrato nero su Android:
   * `borderStyle: "dashed"` + `borderRadius` + `overflow: "hidden"`. La vista
   * non disegnava piu' niente - ne' la foto, ne' il bordo, ne' l'icona, ne'
   * l'etichetta - e sembrava che la foto non arrivasse: arrivava, e Glide la
   * caricava dentro una vista che nessuno vedeva.
   *
   * Nessun test puo' accorgersi di quel che Android non disegna, quindi si
   * pinna la combinazione: due dei tre stili sono legittimi e usati in mezza
   * app, e' il terzo insieme agli altri due che uccide la vista. Il giro va
   * fatto in entrambi gli stati, perche' il tratteggio c'e' solo a tessera
   * vuota ma la vista e' la stessa anche con la foto.
   */
  it.each([
    ["vuota", null],
    ["con la foto", ARCHIVIATA],
  ])("%s non rimette i tre stili che la fanno sparire", async (_, uri) => {
    const renderer = await monta(
      <PhotoTile uri={uri} onChange={() => {}} label="Foto" />,
    );

    const tessera = renderer.root
      .findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === "Foto");
    const stile = StyleSheet.flatten(tessera?.props.style) ?? {};

    expect(stile.borderRadius).toBeGreaterThan(0);
    expect(stile.overflow).not.toBe("hidden");
  });

  /*
   * L'arrotondamento della foto viene dall'immagine e non piu' dal ritaglio
   * del genitore: chi lo togliesse da qui riavrebbe una foto quadrata dentro
   * una tessera arrotondata, ed e' la ragione per cui `overflow` se ne e'
   * potuto andare senza perdere niente.
   */
  it("arrotonda la foto sull'immagine, non col ritaglio del genitore", async () => {
    mockEnsureLocalPhoto.mockResolvedValue(ARCHIVIATA);

    const renderer = await monta(
      <PhotoTile uri={ARCHIVIATA} onChange={() => {}} label="Foto" />,
    );

    const stile = StyleSheet.flatten(
      renderer.root.findByType(ExpoImage).props.style,
    );
    expect(stile.borderRadius).toBeGreaterThan(0);
  });

  it("vuota mostra l'icona e l'etichetta, non un segnaposto", async () => {
    const renderer = await monta(
      <PhotoTile uri={null} onChange={() => {}} label="Foto" />,
    );

    expect(renderer.root.findAllByType(ImageOff)).toHaveLength(0);
    expect(mockEnsureLocalPhoto).not.toHaveBeenCalled();
  });
});

describe("la foto appena scattata", () => {
  it("arriva al chiamante col percorso dell'archivio, e si vede", async () => {
    picker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: IN_CACHE }],
    } as never);
    mockEnsureLocalPhoto.mockResolvedValue(ARCHIVIATA);

    const consegnati: (string | null)[] = [];
    const renderer = await monta(
      <PhotoTile
        uri={null}
        onChange={(uri) => consegnati.push(uri)}
        prefix="food"
        label="Foto"
      />,
    );
    await premi(renderer, "Scatta foto");

    expect(mockPersistPhoto).toHaveBeenCalledWith(IN_CACHE, "food");
    expect(consegnati).toEqual([ARCHIVIATA]);

    // Il modulo rimette il valore nella tessera: e' quel giro che si vedeva
    // nero.
    await act(async () => {
      renderer.update(
        <PhotoTile
          uri={ARCHIVIATA}
          onChange={() => {}}
          prefix="food"
          label="Foto"
        />,
      );
    });
    expect(renderer.root.findByType(ExpoImage).props.source).toEqual({
      uri: ARCHIVIATA,
    });
  });

  /**
   * Quando l'archivio non riceve il file, `persistPhoto` torna con l'URI di
   * partenza - che sta in cache e non e' l'archivio. Prima la tessera provava
   * a disegnarlo e restava nera; ora dice che quella foto non c'e'.
   */
  it("se l'archivio non l'ha ricevuta la tessera lo dice", async () => {
    picker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: IN_CACHE }],
    } as never);
    mockPersistPhoto.mockResolvedValue(IN_CACHE);

    const renderer = await monta(
      <PhotoTile uri={IN_CACHE} onChange={() => {}} label="Foto" />,
    );

    expect(renderer.root.findAllByType(ImageOff)).toHaveLength(1);
  });
});

describe("PhotoField", () => {
  it("disegna la foto che e' qui", async () => {
    mockEnsureLocalPhoto.mockResolvedValue(ARCHIVIATA);

    const renderer = await monta(
      <PhotoField uri={ARCHIVIATA} onChange={() => {}} />,
    );

    expect(renderer.root.findByType(ExpoImage).props.source).toEqual({
      uri: ARCHIVIATA,
    });
  });

  /** La stessa regola dell'altra anteprima: erano le ultime due fuori. */
  it("con un uri che non ha un file dietro disegna il segnaposto", async () => {
    const renderer = await monta(
      <PhotoField uri={ARCHIVIATA} onChange={() => {}} />,
    );

    expect(renderer.root.findAllByType(ImageOff)).toHaveLength(1);
    expect(renderer.root.findAllByType(RNImage)).toHaveLength(0);
  });
});
