import { FoodCatalogScreen } from "@/src/navigation/screens/FoodCatalogScreen";
import type { FoodRow } from "@/src/types/nutrition";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ goBack: jest.fn(), navigate: mockNavigate }),
}));

jest.mock("@/src/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Come negli altri test di schermata: il barrel `kal` porta PhotoField ->
// DfBottomSheet -> gorhom, che qui non c'entra.
jest.mock("@/src/components/kal", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require("react-native");
  return {
    ScreenBackground: () => null,
    SearchBar: () => null,
    EmptyState: ({ message }: { message: string }) =>
      ReactLib.createElement(RN.Text, null, message),
  };
});

/*
 * Delle righe interessa solo con quali prop la schermata le apre: la riga ha
 * il suo aspetto altrove (`FoodListItem`), qui conta che il tocco porti a Info
 * e non a un modulo.
 */
const mockRowProps = jest.fn();
jest.mock("@/src/containers/foods/FoodListItem", () => ({
  FoodListItem: (props: Record<string, unknown>) => {
    mockRowProps(props);
    return null;
  },
}));

jest.mock("@/src/containers/foods/FoodFacts", () => ({
  FoodFacts: () => null,
}));

const mockAlertProps = jest.fn();
jest.mock("@/src/components/DfAlert", () => ({
  DfAlert: (props: Record<string, unknown>) => {
    mockAlertProps(props);
    return null;
  },
}));

const mockSearchFoods = jest.fn(
  async (_term?: string, _limit?: number) => [] as FoodRow[],
);
const mockSearchMyFoods = jest.fn(
  async (_term?: string, _limit?: number) => [] as FoodRow[],
);
const mockToggleFavorite = jest.fn(async (_id: string) => {});
jest.mock("@/src/db/queries/foods", () => ({
  searchFoods: (term?: string, limit?: number) => mockSearchFoods(term, limit),
  searchMyFoods: (term?: string, limit?: number) =>
    mockSearchMyFoods(term, limit),
  toggleFoodFavorite: (id: string) => mockToggleFavorite(id),
}));

const mockSyncCatalog = jest.fn(async (_forza?: boolean) => ({
  toccate: 0,
  riuscito: true,
}));
jest.mock("@/src/services/catalogSync", () => ({
  syncCatalog: (forza?: boolean) => mockSyncCatalog(forza),
}));

jest.mock("@/src/utils/toast", () => ({
  showToast: { success: jest.fn(), error: jest.fn() },
}));

let mockRows: FoodRow[] = [];
const mockReload = jest.fn();
let capturedLoader: (() => Promise<FoodRow[]>) | null = null;
jest.mock("@/src/hooks/useFocusData", () => ({
  useFocusData: (loader: () => Promise<FoodRow[]>) => {
    capturedLoader = loader;
    return {
      data: mockRows,
      loading: false,
      reload: mockReload,
      refresh: async () => {},
      refreshing: false,
    };
  },
}));

const food = (over: Partial<FoodRow> = {}): FoodRow => ({
  id: "f1",
  name: "Bresaola",
  name_norm: "bresaola",
  brand: null,
  source: "seed",
  barcode: null,
  off_id: null,
  kcal: 151,
  protein: 32,
  carbs: 0.5,
  sugars: 0.5,
  fat: 2,
  saturated_fat: 0.7,
  fiber: 0,
  salt: 4,
  is_liquid: 0,
  default_serving_g: 50,
  serving_label: null,
  image_uri: null,
  catalog_uid: "food-bresaola",
  is_favorite: 0,
  usage_count: 0,
  is_estimated: 0,
  created_at: "2026-09-10T10:00:00.000Z",
  updated_at: "2026-09-10T10:00:00.000Z",
  deleted_at: null,
  ...over,
});

const render = () => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FoodCatalogScreen />);
  });
  return tree;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRows = [];
  capturedLoader = null;
});

describe("FoodCatalogScreen", () => {
  /*
   * La ragione per cui questa schermata esiste: "I miei alimenti" legge
   * `searchMyFoods`, che esclude i seed, quindi il bottone del catalogo li'
   * aggiornava righe che quella schermata non puo' mostrare.
   */
  it("legge tutto il catalogo, non solo gli alimenti dell'utente", async () => {
    render();

    expect(capturedLoader).not.toBeNull();
    await act(async () => {
      await capturedLoader?.();
    });

    expect(mockSearchFoods).toHaveBeenCalled();
    expect(mockSearchMyFoods).not.toHaveBeenCalled();
  });

  /*
   * `searchFoods` ha `limit = 50` di default: sul catalogo intero taglierebbe
   * l'elenco a un quarto senza dirlo, e la riga che manca non si distingue da
   * una riga che il server non ha mandato.
   */
  it("chiede un limite che copre tutto il catalogo", async () => {
    render();
    await act(async () => {
      await capturedLoader?.();
    });

    const [, limit] = mockSearchFoods.mock.calls[0] as unknown[];
    expect(typeof limit).toBe("number");
    expect(limit as number).toBeGreaterThanOrEqual(300);
  });

  it("il bottone del catalogo forza il giro e ricarica quando qualcosa cambia", async () => {
    mockSyncCatalog.mockResolvedValueOnce({ toccate: 3, riuscito: true });
    const tree = render();

    const bottone = tree.root
      .findAll(
        (node) =>
          node.props?.accessibilityLabel === "foods.import_catalog" &&
          typeof node.props?.onPress === "function",
      )
      .at(0);
    expect(bottone).toBeDefined();

    await act(async () => {
      bottone?.props.onPress();
    });

    // `true`: la finestra di un'ora renderebbe questo comando un comando che
    // non fa niente.
    expect(mockSyncCatalog).toHaveBeenCalledWith(true);
    expect(mockReload).toHaveBeenCalled();
  });

  it("non ricarica se il giro non ha toccato niente", async () => {
    mockSyncCatalog.mockResolvedValueOnce({ toccate: 0, riuscito: true });
    const tree = render();

    const bottone = tree.root
      .findAll(
        (node) =>
          node.props?.accessibilityLabel === "foods.import_catalog" &&
          typeof node.props?.onPress === "function",
      )
      .at(0);

    await act(async () => {
      bottone?.props.onPress();
    });

    expect(mockReload).not.toHaveBeenCalled();
  });

  /*
   * Sola lettura, ed e' la regola che un refactor romperebbe per prima: da
   * qui si consulta. Creare e correggere vivono in "I miei alimenti", che e'
   * la sola pagina dove si scrive.
   */
  it("toccare una riga apre Info e non porta al modulo", () => {
    mockRows = [food()];
    const tree = render();

    const props = mockRowProps.mock.calls.at(0)?.[0] as {
      food: FoodRow;
      onPress: () => void;
    };
    expect(props.food.name).toBe("Bresaola");

    act(() => {
      props.onPress();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    const ultimo = mockAlertProps.mock.calls.at(-1)?.[0] as {
      isOpen: boolean;
      title?: string;
    };
    expect(ultimo.isOpen).toBe(true);
    expect(ultimo.title).toBe("Bresaola");

    act(() => {
      tree.unmount();
    });
  });

  it("la stella scrive il preferito e ricarica", async () => {
    mockRows = [food()];
    render();

    const props = mockRowProps.mock.calls.at(0)?.[0] as {
      onToggleFavorite: () => void;
    };
    await act(async () => {
      props.onToggleFavorite();
    });

    expect(mockToggleFavorite).toHaveBeenCalledWith("f1");
    expect(mockReload).toHaveBeenCalled();
  });
});
