import type { Migration } from "@/src/db/migrations/types";

/**
 * La schermata di dettaglio esercizio mostra una foto, ma la colonna non
 * c'era mai stata: fin qui `exercises` non ne aveva bisogno, il catalogo
 * condiviso lavora solo di testo.
 */
export const migration018: Migration = {
  version: 18,
  name: "exercise_photo",
  up: `
ALTER TABLE exercises ADD COLUMN photo_uri TEXT;
`,
};
