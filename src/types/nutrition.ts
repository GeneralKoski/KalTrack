import type { Nutrients } from "@/src/domain/nutrition";

export type FoodSource = "seed" | "off" | "user" | "ai";

/** Riga della tabella foods, così come torna da SQLite (snake_case). */
export interface FoodRow {
  id: string;
  name: string;
  name_norm: string;
  brand: string | null;
  source: FoodSource;
  barcode: string | null;
  off_id: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  sugars: number;
  fat: number;
  saturated_fat: number;
  fiber: number;
  salt: number;
  is_liquid: number;
  default_serving_g: number | null;
  serving_label: string | null;
  image_uri: string | null;
  is_favorite: number;
  usage_count: number;
  is_estimated: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Valori nutrizionali per 100 g/ml di un alimento. */
export const foodNutrients = (row: FoodRow): Nutrients => ({
  kcal: row.kcal,
  protein: row.protein,
  carbs: row.carbs,
  sugars: row.sugars,
  fat: row.fat,
  saturatedFat: row.saturated_fat,
  fiber: row.fiber,
  salt: row.salt,
});

/** Input di creazione/modifica alimento (camelCase, lato applicativo). */
export interface FoodInput {
  name: string;
  brand?: string | null;
  source?: FoodSource;
  barcode?: string | null;
  offId?: string | null;
  nutrients: Nutrients;
  isLiquid?: boolean;
  defaultServingG?: number | null;
  servingLabel?: string | null;
  imageUri?: string | null;
  isEstimated?: boolean;
}
