import type { Migration } from "@/src/db/migrations/types";

/**
 * Un pasto che non si usa mai si spegne, e spegnerlo non e' cancellarlo.
 *
 * `deleted_at` toglie il tipo dall'elenco, e `getDayDiary` salta i pasti il
 * cui tipo non c'e' piu': chi spegnesse "brunch" cosi' si vedrebbe sparire
 * dallo storico i brunch gia' registrati, e dai totali di quei giorni.
 * `hidden` toglie soltanto la scelta.
 */
export const migration016: Migration = {
  version: 16,
  name: "meal_type_hidden",
  up: `
ALTER TABLE meal_types ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
`,
};
