import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toCatalogExercises, toCatalogFoods } from "../src/db/seed/catalogExport";
import { SEED_EXERCISES } from "../src/db/seed/exercises";
import { SEED_FOODS } from "../src/db/seed/foods";

/*
 * Il seed dell'app, in una forma che il server sa leggere.
 *
 * Il comando `catalog:seed` NON legge `src/db/seed/`: in produzione
 * `backend/` viene rsyncata da sola e quella cartella li' non esiste, quindi
 * il comando fallirebbe solo sul server e solo al primo tentativo. Legge
 * invece questi due JSON, che sono committati.
 *
 * Va rilanciato quando il seed cambia. A ricordarlo c'e' un test in
 * `src/db/seed/seed.test.ts` che confronta il contenuto esportato con quello
 * dei costanti dal vivo: senza, un esercizio o un alimento modificato e non
 * riesportato diventerebbe una copia disallineata su ogni telefono.
 */

const OUT = join(__dirname, "..", "backend", "database", "seeders", "data");

mkdirSync(OUT, { recursive: true });

const scrivi = (nome: string, dati: unknown[]): void => {
  writeFileSync(join(OUT, nome), `${JSON.stringify(dati, null, 2)}\n`, "utf8");
  console.log(`${nome}: ${dati.length} voci`);
};

scrivi("exercises.json", toCatalogExercises(SEED_EXERCISES));
scrivi("foods.json", toCatalogFoods(SEED_FOODS));
