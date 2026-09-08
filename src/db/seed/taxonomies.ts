/**
 * Il seme delle due tassonomie, duplicato dalla migrazione 020.
 *
 * La migrazione scrive questi stessi valori come SQL statico eseguito UNA
 * VOLTA SOLA, alla creazione dello schema: da li' in poi `PRAGMA user_version`
 * e' gia' all'ultima versione e quell'`up` non riparte piu', qualunque cosa
 * succeda alle due tabelle. Questa copia serve a `applyTaxonomySeeds`
 * (`src/db/seed/index.ts`), che invece puo' girare quante volte serve - a ogni
 * avvio e dopo un ripristino - per rimettere gli slug che mancano.
 *
 * Chi tocca uno slug in `020_taxonomies.ts` tocca anche questo file: sono la
 * stessa lista, e un disallineamento si vedrebbe solo il giorno in cui una
 * tabella vuota va riseminata con valori vecchi.
 */
export const SEED_MUSCLE_GROUPS = [
  { slug: "petto", label_it: "Petto", label_en: "Chest", sort: 10, deleted_at: null },
  { slug: "schiena", label_it: "Schiena", label_en: "Back", sort: 20, deleted_at: null },
  { slug: "spalle", label_it: "Spalle", label_en: "Shoulders", sort: 30, deleted_at: null },
  { slug: "bicipiti", label_it: "Bicipiti", label_en: "Biceps", sort: 40, deleted_at: null },
  { slug: "tricipiti", label_it: "Tricipiti", label_en: "Triceps", sort: 50, deleted_at: null },
  { slug: "avambracci", label_it: "Avambracci", label_en: "Forearms", sort: 60, deleted_at: null },
  { slug: "addome", label_it: "Addome", label_en: "Abs", sort: 70, deleted_at: null },
  { slug: "quadricipiti", label_it: "Quadricipiti", label_en: "Quads", sort: 80, deleted_at: null },
  { slug: "femorali", label_it: "Femorali", label_en: "Hamstrings", sort: 90, deleted_at: null },
  { slug: "glutei", label_it: "Glutei", label_en: "Glutes", sort: 100, deleted_at: null },
  { slug: "polpacci", label_it: "Polpacci", label_en: "Calves", sort: 110, deleted_at: null },
  { slug: "full_body", label_it: "Full body", label_en: "Full body", sort: 120, deleted_at: null },
] as const;

export const SEED_EQUIPMENT_TYPES = [
  { slug: "corpo_libero", label_it: "Corpo libero", label_en: "Bodyweight", sort: 10, deleted_at: null },
  { slug: "bilanciere", label_it: "Bilanciere", label_en: "Barbell", sort: 20, deleted_at: null },
  { slug: "manubri", label_it: "Manubri", label_en: "Dumbbells", sort: 30, deleted_at: null },
  { slug: "kettlebell", label_it: "Kettlebell", label_en: "Kettlebell", sort: 40, deleted_at: null },
  { slug: "cavi", label_it: "Cavi", label_en: "Cables", sort: 50, deleted_at: null },
  { slug: "macchina", label_it: "Macchina", label_en: "Machine", sort: 60, deleted_at: null },
  { slug: "panca", label_it: "Panca", label_en: "Bench", sort: 70, deleted_at: null },
  { slug: "sbarra", label_it: "Sbarra", label_en: "Pull-up bar", sort: 80, deleted_at: null },
  { slug: "elastici", label_it: "Elastici", label_en: "Resistance bands", sort: 90, deleted_at: null },
  { slug: "trx", label_it: "TRX", label_en: "TRX", sort: 100, deleted_at: null },
  { slug: "cardio", label_it: "Cardio", label_en: "Cardio", sort: 110, deleted_at: null },
] as const;
