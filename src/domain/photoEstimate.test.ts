import type { PhotoEstimateItem } from "@/src/ai/estimateFromPhoto";
import {
  includedTotals,
  rowNutrients,
  rowsFromEstimate,
  savableRows,
} from "@/src/domain/photoEstimate";
import { EMPTY_NUTRIENTS, type Nutrients } from "@/src/domain/nutrition";

const nutrients = (partial: Partial<Nutrients>): Nutrients => ({
  ...EMPTY_NUTRIENTS,
  ...partial,
});

const stimata = (
  label: string,
  quantityG: number,
  per100: Partial<Nutrients>,
  confidence = 0.6,
): PhotoEstimateItem => ({
  label,
  quantityG,
  per100: nutrients(per100),
  nutrientsForPortion: EMPTY_NUTRIENTS,
  confidence,
  isEstimated: true,
  resolved: null,
});

describe("rowsFromEstimate", () => {
  it("porta una riga per piatto, con grammi e per 100 g della stima", () => {
    const righe = rowsFromEstimate([
      stimata("Pasta al pomodoro", 180, { kcal: 130 }),
      stimata("Cotoletta", 150, { kcal: 250 }),
    ]);

    expect(righe).toHaveLength(2);
    expect(righe[0]).toMatchObject({
      label: "Pasta al pomodoro",
      grams: 180,
      included: true,
    });
    expect(righe[0].per100.kcal).toBe(130);
  });

  // Chiavi stabili: la lista si modifica mentre e' a schermo, e con l'indice
  // come chiave togliere la prima riga fa ereditare alla seconda lo stato
  // della prima.
  it("da a ogni riga una chiave sua", () => {
    const righe = rowsFromEstimate([
      stimata("Pane", 50, { kcal: 270 }),
      stimata("Pane", 50, { kcal: 270 }),
    ]);

    expect(righe[0].key).not.toBe(righe[1].key);
  });

  it("dice se i numeri vengono dal catalogo o dalla foto", () => {
    const righe = rowsFromEstimate([stimata("Insalata", 100, { kcal: 20 })]);
    expect(righe[0].fromCatalog).toBe(false);
  });
});

describe("rowNutrients", () => {
  it("riscala dai per 100 g ai grammi correnti", () => {
    const [riga] = rowsFromEstimate([
      stimata("Pasta al pomodoro", 180, { kcal: 130, carbs: 25 }),
    ]);

    expect(rowNutrients(riga).kcal).toBeCloseTo(234);
    expect(rowNutrients({ ...riga, grams: 200 }).kcal).toBeCloseTo(260);
  });

  /*
   * E' l'errore che `registry.ts` documenta come "meta' delle calorie su una
   * piadina da 200 g, in silenzio": cambiare i grammi senza riscalare, o
   * riscalare partendo dai valori gia' riscalati.
   */
  it("tornando ai grammi di partenza torna ai valori di partenza", () => {
    const [riga] = rowsFromEstimate([
      stimata("Riso", 200, { kcal: 111, protein: 2.6 }),
    ]);
    const partenza = rowNutrients(riga);

    const andata = { ...riga, grams: 350 };
    const ritorno = { ...andata, grams: 200 };

    expect(rowNutrients(ritorno).kcal).toBeCloseTo(partenza.kcal);
    expect(rowNutrients(ritorno).protein).toBeCloseTo(partenza.protein);
  });

  it("con zero grammi non da valori negativi ne NaN", () => {
    const [riga] = rowsFromEstimate([stimata("Pane", 50, { kcal: 270 })]);
    expect(rowNutrients({ ...riga, grams: 0 })).toEqual(EMPTY_NUTRIENTS);
  });
});

describe("includedTotals", () => {
  it("somma solo le righe incluse", () => {
    const righe = rowsFromEstimate([
      stimata("Pasta", 100, { kcal: 130 }),
      stimata("Pane", 100, { kcal: 270 }),
    ]);

    expect(includedTotals(righe).kcal).toBeCloseTo(400);
    expect(
      includedTotals([righe[0], { ...righe[1], included: false }]).kcal,
    ).toBeCloseTo(130);
  });

  it("senza righe incluse il totale e' zero, non NaN", () => {
    const righe = rowsFromEstimate([stimata("Pane", 100, { kcal: 270 })]);
    expect(includedTotals([{ ...righe[0], included: false }])).toEqual(
      EMPTY_NUTRIENTS,
    );
  });
});

describe("savableRows", () => {
  it("scarta le escluse, quelle a zero grammi e quelle senza nome", () => {
    const [pasta, pane, vuota] = rowsFromEstimate([
      stimata("Pasta", 180, { kcal: 130 }),
      stimata("Pane", 50, { kcal: 270 }),
      stimata("   ", 30, { kcal: 100 }),
    ]);

    const salvabili = savableRows([
      pasta,
      { ...pane, grams: 0 },
      vuota,
    ]);

    expect(salvabili.map((r) => r.label)).toEqual(["Pasta"]);
  });
});
