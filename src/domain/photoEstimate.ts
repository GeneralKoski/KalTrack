import type { PhotoEstimateItem } from "@/src/ai/estimateFromPhoto";
import {
  scaleNutrients,
  sumNutrients,
  type Nutrients,
} from "@/src/domain/nutrition";

/**
 * Una riga del foglio di revisione della stima da foto.
 *
 * La stima arriva con valori assoluti della porzione, ma qui si tiene
 * `per100`: i grammi si correggono, e riscalare ogni volta dai valori assoluti
 * appena riscalati li farebbe derivare a ogni tocco.
 */
export interface EstimateRow {
  /**
   * Chiave stabile per la lista. Non l'indice: le righe si escludono mentre
   * sono a schermo, e con l'indice togliere la prima fa ereditare alla seconda
   * lo stato della prima.
   */
  key: string;
  label: string;
  /** Grammi correnti, correggibili. */
  grams: number;
  /** Valori per 100 g, fissi: sono la base da cui si riscala. */
  per100: Nutrients;
  confidence: number;
  included: boolean;
  /**
   * `true` se i numeri vengono dal catalogo e non dal modello. Va detto a
   * schermo: una porzione stimata da una foto e dei valori censiti a mano non
   * meritano la stessa fiducia.
   */
  fromCatalog: boolean;
}

export function rowsFromEstimate(items: PhotoEstimateItem[]): EstimateRow[] {
  return items.map((item, index) => ({
    key: `${index}-${item.label}`,
    label: item.label,
    grams: item.quantityG,
    per100: item.per100,
    confidence: item.confidence,
    included: true,
    fromCatalog: !item.isEstimated,
  }));
}

/** I valori della riga ai grammi correnti. */
export const rowNutrients = (row: EstimateRow): Nutrients =>
  scaleNutrients(row.per100, row.grams);

/** Quel che finirebbe nel diario premendo Conferma adesso. */
export const savableRows = (rows: EstimateRow[]): EstimateRow[] =>
  rows.filter(
    (row) => row.included && row.grams > 0 && row.label.trim().length > 0,
  );

export const includedTotals = (rows: EstimateRow[]): Nutrients =>
  sumNutrients(savableRows(rows).map(rowNutrients));

/**
 * Grammi da quel che si e' digitato. La virgola e' il separatore decimale
 * italiano, e un campo vuoto o assurdo vale zero: zero grammi esclude la riga
 * dal salvataggio invece di scriverne una a caso.
 */
export function toGrams(text: string): number {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
