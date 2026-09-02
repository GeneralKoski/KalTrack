import { escludiGiaPresenti } from "@/src/containers/foods/useOffSearch";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { FoodInput, FoodRow } from "@/src/types/nutrition";

const prodotto = (over: Partial<FoodInput>): FoodInput => ({
  name: "Skyr naturale",
  brand: "Arla",
  nutrients: { ...EMPTY_NUTRIENTS, kcal: 63 },
  ...over,
});

const inLibreria = (over: Partial<FoodRow>): FoodRow =>
  ({
    id: "f1",
    name: "Skyr naturale",
    barcode: null,
    brand: null,
    kcal: 63,
    is_liquid: 0,
    is_favorite: 0,
    ...over,
  }) as FoodRow;

describe("escludiGiaPresenti", () => {
  it("toglie il prodotto che la libreria ha con lo stesso codice a barre", () => {
    const risultato = escludiGiaPresenti(
      [prodotto({ barcode: "5701130001234" })],
      [inLibreria({ barcode: "5701130001234", name: "Un altro nome" })],
    );

    expect(risultato).toEqual([]);
  });

  /**
   * Il nome copre quel che e' stato aggiunto a mano, che non ha un codice a
   * barre. Senza, lo stesso yogurt compariva due volte a due centimetri di
   * distanza, una volta per sezione.
   */
  it("toglie il prodotto che la libreria ha con lo stesso nome", () => {
    const risultato = escludiGiaPresenti(
      [prodotto({ barcode: "5701130001234" })],
      [inLibreria({ name: "Skyr naturale" })],
    );

    expect(risultato).toEqual([]);
  });

  it("il confronto sul nome ignora accenti e maiuscole", () => {
    const risultato = escludiGiaPresenti(
      [prodotto({ name: "Purè di patate" })],
      [inLibreria({ name: "PURE DI PATATE" })],
    );

    expect(risultato).toEqual([]);
  });

  it("tiene quel che la libreria non ha", () => {
    const risultato = escludiGiaPresenti(
      [prodotto({ name: "Skyr proteico" })],
      [inLibreria({ name: "Skyr naturale" })],
    );

    expect(risultato).toHaveLength(1);
    expect(risultato[0].name).toBe("Skyr proteico");
  });

  /**
   * Un codice a barre diverso non e' un motivo per tenere un prodotto che si
   * chiama come uno gia' presente: sarebbero due righe indistinguibili in
   * elenco.
   */
  it("il nome vince anche quando il codice a barre e' diverso", () => {
    const risultato = escludiGiaPresenti(
      [prodotto({ barcode: "999" })],
      [inLibreria({ barcode: "111", name: "Skyr naturale" })],
    );

    expect(risultato).toEqual([]);
  });

  it("una libreria vuota non toglie niente", () => {
    expect(escludiGiaPresenti([prodotto({})], [])).toHaveLength(1);
  });
});
