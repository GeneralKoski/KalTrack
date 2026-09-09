import { FreeEntrySheet } from "@/src/containers/diary/FreeEntrySheet";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";
import type { MealEntryRow } from "@/src/types/nutrition";
import React from "react";
import { TextInput as RNTextInput } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

/*
 * DfAlert vero monta l'AlertDialog di gluestack, che sotto Jest non ha il
 * portale (OverlayProvider) in cui rimontarsi. Il mock e' un passthrough: rende
 * `children` cosi' com'e' - il corpo vero del foglio, coi suoi cinque campi -
 * e cattura `onConfirm`/`onClose`, che qui si guardano direttamente invece che
 * passare per un bottone che non esiste piu'.
 */
const mockDfAlertProps = jest.fn();
jest.mock("@/src/components/DfAlert", () => ({
  DfAlert: (props: { children?: React.ReactNode }) => {
    mockDfAlertProps(props);
    return props.children ?? null;
  },
}));

beforeEach(() => {
  mockDfAlertProps.mockClear();
});

/** I cinque campi, nell'ordine in cui il JSX li scrive: nome, kcal, poi i tre
 * macro (proteine, carboidrati, grassi). */
const fields = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType(RNTextInput);

const lastDfAlertProps = () =>
  mockDfAlertProps.mock.calls.at(-1)?.[0] as {
    onConfirm: () => void;
    onClose: () => void;
  };

/**
 * Una voce nata da una stima da foto: porta sugars/saturated_fat/fiber/salt,
 * che il foglio non ha campi per mostrare ma che deve comunque restituire
 * intatti - e' esattamente il caso che il difetto del round di review
 * colpiva.
 */
const baseEntry: MealEntryRow = {
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
  sugars: 12,
  fat: 25,
  saturated_fat: 8,
  fiber: 4,
  salt: 2,
  is_estimated: 1,
  confidence: 0.6,
  note: null,
  photo_uri: null,
  components: null,
  created_via: "photo",
  sort: 0,
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
  deleted_at: null,
};

describe("FreeEntrySheet, modalita' modifica", () => {
  it("apre riempito dai valori della voce", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <FreeEntrySheet
          isOpen
          editing={baseEntry}
          onConfirm={jest.fn()}
          onClose={jest.fn()}
        />,
      );
    });

    const [label, kcal, protein, carbs, fat] = fields(renderer);
    expect(label?.props.value).toBe("Pizza al taglio");
    expect(kcal?.props.value).toBe("800");
    expect(protein?.props.value).toBe("30");
    expect(carbs?.props.value).toBe("90");
    expect(fat?.props.value).toBe("25");

    act(() => renderer.unmount());
  });

  /**
   * Il Critical del round di review: `confirm()` partiva sempre da
   * `EMPTY_NUTRIENTS`, quindi confermare SENZA toccare niente azzerava
   * sugars, saturated_fat, fiber e salt - i quattro valori che il foglio non
   * mostra ma che la voce porta comunque. E' la regola della fotografia letta
   * al contrario: correggere una voce non deve riscrivere quel che nessuno ha
   * toccato.
   */
  it("confermare senza modifiche riporta indietro tutti e otto i valori, non solo i quattro visibili", () => {
    const onConfirm = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <FreeEntrySheet
          isOpen
          editing={baseEntry}
          onConfirm={onConfirm}
          onClose={jest.fn()}
        />,
      );
    });

    act(() => {
      lastDfAlertProps().onConfirm();
    });

    const expected: Nutrients = {
      kcal: 800,
      protein: 30,
      carbs: 90,
      sugars: 12,
      fat: 25,
      saturatedFat: 8,
      fiber: 4,
      salt: 2,
    };
    expect(onConfirm).toHaveBeenCalledWith("Pizza al taglio", expected);

    act(() => renderer.unmount());
  });

  /**
   * L'Important del round di review: nessun test copriva il riempimento da
   * `editing` ne' il ritorno a quei valori alla chiusura - una mutazione che
   * svuota il foglio a ogni apertura lasciava l'intera suite verde. Qui si
   * digita un valore abbandonato, si chiude SENZA confermare, si riapre sulla
   * stessa voce: deve tornare "800", non "999" (l'abbandono) e non "" (il
   * vuoto).
   */
  it("chiudere senza confermare e riaprire la stessa voce mostra di nuovo i suoi valori, non l'abbandono e non il vuoto", () => {
    const props = (isOpen: boolean) => (
      <FreeEntrySheet
        isOpen={isOpen}
        editing={baseEntry}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />
    );

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(props(true));
    });

    act(() => {
      fields(renderer)[1]?.props.onChangeText("999");
    });
    expect(fields(renderer)[1]?.props.value).toBe("999");

    act(() => {
      renderer.update(props(false));
    });
    act(() => {
      renderer.update(props(true));
    });

    const [label, kcal] = fields(renderer);
    expect(label?.props.value).toBe("Pizza al taglio");
    expect(kcal?.props.value).toBe("800");

    act(() => renderer.unmount());
  });
});

describe("FreeEntrySheet, modalita' aggiunta", () => {
  it("senza `editing` apre vuoto e conferma con la base vuota", () => {
    const onConfirm = jest.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <FreeEntrySheet
          isOpen
          onConfirm={onConfirm}
          onClose={jest.fn()}
        />,
      );
    });

    const [label, kcal] = fields(renderer);
    expect(label?.props.value).toBe("");
    expect(kcal?.props.value).toBe("");

    act(() => {
      fields(renderer)[0]?.props.onChangeText("Margherita al ristorante");
    });
    act(() => {
      fields(renderer)[1]?.props.onChangeText("850");
    });
    act(() => {
      lastDfAlertProps().onConfirm();
    });

    expect(onConfirm).toHaveBeenCalledWith("Margherita al ristorante", {
      ...EMPTY_NUTRIENTS,
      kcal: 850,
    });

    act(() => renderer.unmount());
  });
});
