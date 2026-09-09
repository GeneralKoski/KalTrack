import type { EstimateRow } from "@/src/domain/photoEstimate";
import type { Nutrients } from "@/src/domain/nutrition";
import { TodayScreen } from "@/src/navigation/screens/TodayScreen";
import React from "react";
import { TouchableOpacity } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("@/src/hooks/useAppNav", () => ({
  useAppNav: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock("@/src/stores/accountStore", () => ({
  useAccountStore: (
    selector: (state: {
      token: string | null;
      aiEnabled: boolean | null;
      isHydrated: boolean;
    }) => unknown,
  ) => selector({ token: null, aiEnabled: null, isHydrated: true }),
}));

jest.mock("@react-navigation/native", () => {
  // jest issa jest.mock in cima al file: la fabbrica non puo' leggere il
  // modulo React importato sotto, e deve richiederselo da se'.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactLib.useEffect(() => effect(), []);
    },
  };
});

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

/*
 * Il caricamento (getDayDiary/listMealTypes/getTargetsFor/entryDisplayNames)
 * non e' l'oggetto dell'osservazione: qui interessa solo cosa TodayScreen
 * scrive quando si conferma una voce, non come li' arrivano i dati. Un
 * `mealTypes` con una riga basta a far risolvere `defaultMealTypeId` al tocco
 * del "+", che senza un pasto scelto blocca sia `confirmFree` sia
 * `confirmPhotoEstimate`.
 */
jest.mock("@/src/hooks/useFocusData", () => ({
  useFocusData: () => ({
    data: {
      diary: {
        date: "2026-09-09",
        meals: [
          {
            meal: {
              id: "meal-1",
              date: "2026-09-09",
              meal_type_id: "colazione",
              name: null,
              time: null,
              notes: null,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              deleted_at: null,
            },
            type: {
              id: "colazione",
              name: "Colazione",
              icon: null,
              sort: 0,
              is_custom: 0,
              hidden: 0,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              deleted_at: null,
            },
            // Una voce libera e una con un alimento dietro: e' il bivio che
            // `onEditEntry` deve fare fra FreeEntrySheet e QuantityPrompt.
            entries: [
              {
                id: "free-1",
                meal_id: "meal-1",
                source_kind: "free",
                food_id: null,
                recipe_id: null,
                label: "Pizza al taglio",
                quantity_g: 1,
                servings: null,
                kcal: 800,
                protein: 30,
                carbs: 90,
                sugars: 0,
                fat: 25,
                saturated_fat: 0,
                fiber: 0,
                salt: 0,
                is_estimated: 0,
                confidence: null,
                note: null,
                photo_uri: null,
                components: null,
                created_via: "manual",
                sort: 0,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
                deleted_at: null,
              },
              {
                id: "food-1",
                meal_id: "meal-1",
                source_kind: "food",
                food_id: "food-x",
                recipe_id: null,
                label: null,
                quantity_g: 150,
                servings: null,
                kcal: 300,
                protein: 20,
                carbs: 10,
                sugars: 0,
                fat: 5,
                saturated_fat: 0,
                fiber: 0,
                salt: 0,
                is_estimated: 0,
                confidence: null,
                note: null,
                photo_uri: null,
                components: null,
                created_via: "manual",
                sort: 1,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
                deleted_at: null,
              },
            ],
            totals: {
              kcal: 1100,
              protein: 50,
              carbs: 100,
              sugars: 0,
              fat: 30,
              saturatedFat: 0,
              fiber: 0,
              salt: 0,
            },
          },
        ],
        totals: {
          kcal: 1100,
          protein: 50,
          carbs: 100,
          sugars: 0,
          fat: 30,
          saturatedFat: 0,
          fiber: 0,
          salt: 0,
        },
      },
      names: {},
      mealTypes: [
        {
          id: "colazione",
          name: "Colazione",
          icon: null,
          sort: 0,
          is_custom: 0,
          hidden: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          deleted_at: null,
        },
      ],
      targets: {
        id: "t1",
        valid_from: "2026-01-01",
        kcal: 2000,
        protein_g: 150,
        carbs_g: 250,
        fat_g: 70,
        steps: 8000,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
    },
    loading: false,
    reload: () => {},
    refresh: async () => {},
    refreshing: false,
  }),
}));

jest.mock("@/src/services/achievements", () => ({
  checkAchievements: jest.fn(async () => []),
}));

jest.mock("@/src/db/queries/foods", () => ({
  getFood: jest.fn(async () => null),
}));

jest.mock("@/src/db/queries/settings", () => ({
  getTargetsFor: jest.fn(async () => null),
}));

/*
 * Il barrel `kal` porta PhotoField -> DfBottomSheet -> @gorhom/bottom-sheet ->
 * reanimated/worklets, che sotto Jest non e' montabile (vedi
 * SessionScreen.test.tsx). Qui interessa solo il flag scritto da
 * `confirmFree`/`confirmPhotoEstimate`, non come la schermata si disegna.
 */
jest.mock("@/src/components/kal", () => {
  const passthrough = ({ children }: { children: React.ReactNode }) =>
    children;
  return {
    EmptyState: () => null,
    HeroPanel: passthrough,
    MetalSurface: passthrough,
    ScreenBackground: () => null,
  };
});

jest.mock("@/src/containers/assistant/AssistantButton", () => ({
  AssistantButton: () => null,
  ASSISTANT_FAB_CLEARANCE: 0,
  SCREEN_FAB_BOTTOM: 0,
  SCREEN_FAB_SIZE: 56,
}));

jest.mock("@/src/containers/diary/AddEntrySheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  return { AddEntrySheet: ReactLib.forwardRef(() => null) };
});
jest.mock("@/src/containers/diary/CalorieRing", () => ({
  CalorieRing: () => null,
}));
jest.mock("@/src/containers/diary/DayHeader", () => ({ DayHeader: () => null }));
jest.mock("@/src/containers/diary/DayPickerSheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLib = require("react");
  return { DayPickerSheet: ReactLib.forwardRef(() => null) };
});
jest.mock("@/src/containers/diary/EntryCompositionSheet", () => ({
  EntryCompositionSheet: () => null,
}));
jest.mock("@/src/containers/diary/MacroBars", () => ({ MacroBars: () => null }));
/*
 * Interessa `onEditEntry`, che e' la via per cui TodayScreen sceglie fra
 * FreeEntrySheet (in modifica) e QuantityPrompt.
 */
const mockMealSectionProps = jest.fn();
jest.mock("@/src/containers/diary/MealSection", () => ({
  MealSection: (props: Record<string, unknown>) => {
    mockMealSectionProps(props);
    return null;
  },
}));

const mockQuantityPromptProps = jest.fn();
jest.mock("@/src/containers/recipes/QuantityPrompt", () => ({
  QuantityPrompt: (props: Record<string, unknown>) => {
    mockQuantityPromptProps(props);
    return null;
  },
}));
jest.mock("@/src/containers/settings/AiKeyPrompt", () => ({
  AiKeyPrompt: () => null,
}));
jest.mock("@/src/containers/wellbeing/WaterCard", () => ({
  WaterCard: () => null,
}));

/*
 * Le due modali dell'osservazione: si registrano le props a ogni render
 * invece di montarle per davvero, come GenerateMealPlanModal in
 * MealPlanScreen.test.tsx. Interessa solo `onConfirm`, che e' la via per cui
 * TodayScreen chiama `addFreeEntry`.
 */
const mockFreeEntrySheetProps = jest.fn();
jest.mock("@/src/containers/diary/FreeEntrySheet", () => ({
  FreeEntrySheet: (props: Record<string, unknown>) => {
    mockFreeEntrySheetProps(props);
    return null;
  },
}));

const mockPhotoEstimateSheetProps = jest.fn();
jest.mock("@/src/containers/diary/PhotoEstimateSheet", () => ({
  PhotoEstimateSheet: (props: Record<string, unknown>) => {
    mockPhotoEstimateSheetProps(props);
    return null;
  },
}));

const mockAddFreeEntry = jest.fn(async (_args: Record<string, unknown>) => "entry-1");
const mockUpdateFreeEntry = jest.fn(
  async (_entryId: string, _args: Record<string, unknown>) => undefined,
);
jest.mock("@/src/db/queries/diary", () => ({
  addFoodEntry: jest.fn(),
  addFreeEntry: (args: Record<string, unknown>) => mockAddFreeEntry(args),
  addRecipeEntry: jest.fn(),
  deleteEntry: jest.fn(),
  entryDisplayNames: jest.fn(async () => ({})),
  getDayDiary: jest.fn(),
  listMealTypes: jest.fn(),
  updateEntryQuantity: jest.fn(),
  updateFreeEntry: (entryId: string, args: Record<string, unknown>) =>
    mockUpdateFreeEntry(entryId, args),
}));

beforeEach(() => {
  mockFreeEntrySheetProps.mockClear();
  mockPhotoEstimateSheetProps.mockClear();
  mockMealSectionProps.mockClear();
  mockQuantityPromptProps.mockClear();
  mockAddFreeEntry.mockClear();
  mockUpdateFreeEntry.mockClear();
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

/** Apre il "+" per far risolvere `mealTypeId`: senza, `confirmFree` e
 * `confirmPhotoEstimate` tornano subito senza scrivere niente. */
const openAdd = async (renderer: ReactTestRenderer) => {
  const fab = renderer.root.findByType(TouchableOpacity);
  await act(async () => {
    fab.props.onPress();
    await flush();
  });
};

const emptyNutrients: Nutrients = {
  kcal: 300,
  protein: 10,
  carbs: 20,
  sugars: 5,
  fat: 8,
  saturatedFat: 2,
  fiber: 3,
  salt: 1,
};

/**
 * Important del round di review: mutare `isEstimated` a TodayScreen.tsx:296
 * lasciava tutti i 1247 test verdi. Il flag decide cosa finisce scritto nel
 * diario e nel CSV (backup.csv_header, colonna "stimato"), non solo
 * un'etichetta - merita un pin, e in ENTRAMBE le direzioni: una voce libera
 * scritta a mano non deve MAI portare la stellina, e una stima da foto vera
 * non deve MAI perderla. Un test che controllasse solo la prima direzione
 * passerebbe anche se qualcuno "risolvesse" il difetto azzerando il flag
 * ovunque, togliendo un segnale vero alle voci che lo meritano davvero.
 */
describe("TodayScreen, il flag is_estimated", () => {
  it("una voce libera scritta a mano si salva con is_estimated false", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<TodayScreen />);
      await flush();
    });

    await openAdd(renderer);

    const freeProps = mockFreeEntrySheetProps.mock.calls.at(-1)?.[0] as {
      onConfirm: (label: string, nutrients: Nutrients) => void;
    };
    await act(async () => {
      freeProps.onConfirm("Pizza al taglio", emptyNutrients);
      await flush();
    });

    expect(mockAddFreeEntry).toHaveBeenCalledTimes(1);
    expect(mockAddFreeEntry.mock.calls[0]?.[0]).toMatchObject({
      isEstimated: false,
    });

    act(() => {
      renderer.unmount();
    });
  });

  it("una voce che viene davvero da una stima da foto si salva con is_estimated true", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<TodayScreen />);
      await flush();
    });

    await openAdd(renderer);

    const photoProps = mockPhotoEstimateSheetProps.mock.calls.at(-1)?.[0] as {
      onConfirm: (rows: EstimateRow[]) => void;
    };
    const row: EstimateRow = {
      key: "0-cotoletta",
      label: "Cotoletta",
      grams: 150,
      per100: emptyNutrients,
      confidence: 0.7,
      included: true,
      // Numeri immaginati dal modello, non letti da un alimento censito:
      // e' esattamente il caso che la stellina deve segnalare.
      fromCatalog: false,
    };
    await act(async () => {
      photoProps.onConfirm([row]);
      await flush();
    });

    expect(mockAddFreeEntry).toHaveBeenCalledTimes(1);
    expect(mockAddFreeEntry.mock.calls[0]?.[0]).toMatchObject({
      isEstimated: true,
      createdVia: "photo",
    });

    act(() => {
      renderer.unmount();
    });
  });
});

/**
 * Il bivio 4b: toccare una voce libera apriva "× la porzione", una modale
 * senza senso per un piatto che non ha grammi. Ora il tocco fa una scelta per
 * `source_kind`: "free" va a FreeEntrySheet in modifica, il resto continua ad
 * aprire QuantityPrompt esattamente come prima.
 */
describe("TodayScreen, il bivio di onEditEntry", () => {
  it("una voce libera apre FreeEntrySheet in modifica, non QuantityPrompt", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<TodayScreen />);
      await flush();
    });

    const sectionProps = mockMealSectionProps.mock.calls.at(-1)?.[0] as {
      onEditEntry: (entryId: string) => void;
    };
    await act(async () => {
      sectionProps.onEditEntry("free-1");
      await flush();
    });

    const freeProps = mockFreeEntrySheetProps.mock.calls.at(-1)?.[0] as {
      isOpen: boolean;
      editing: { id: string } | null;
      onConfirm: (label: string, nutrients: Nutrients) => void;
    };
    expect(freeProps.isOpen).toBe(true);
    expect(freeProps.editing?.id).toBe("free-1");

    const quantityProps = mockQuantityPromptProps.mock.calls.at(-1)?.[0] as {
      isOpen: boolean;
    };
    expect(quantityProps.isOpen).toBe(false);

    await act(async () => {
      freeProps.onConfirm("Pizza XL", emptyNutrients);
      await flush();
    });

    expect(mockUpdateFreeEntry).toHaveBeenCalledTimes(1);
    expect(mockUpdateFreeEntry).toHaveBeenCalledWith("free-1", {
      label: "Pizza XL",
      nutrients: emptyNutrients,
    });
    expect(mockAddFreeEntry).not.toHaveBeenCalled();

    act(() => {
      renderer.unmount();
    });
  });

  it("una voce con un alimento dietro apre QuantityPrompt, non FreeEntrySheet in modifica", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<TodayScreen />);
      await flush();
    });

    const sectionProps = mockMealSectionProps.mock.calls.at(-1)?.[0] as {
      onEditEntry: (entryId: string) => void;
    };
    await act(async () => {
      sectionProps.onEditEntry("food-1");
      await flush();
    });

    const quantityProps = mockQuantityPromptProps.mock.calls.at(-1)?.[0] as {
      isOpen: boolean;
    };
    expect(quantityProps.isOpen).toBe(true);

    const freeProps = mockFreeEntrySheetProps.mock.calls.at(-1)?.[0] as {
      isOpen: boolean;
      editing: { id: string } | null;
    };
    expect(freeProps.isOpen).toBe(false);
    expect(freeProps.editing).toBeNull();

    act(() => {
      renderer.unmount();
    });
  });
});
