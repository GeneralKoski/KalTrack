import type { Migration } from "@/src/db/migrations/types";

/**
 * I gruppi muscolari e l'attrezzatura, come righe invece che come union.
 *
 * Fin qui erano `MUSCLE_GROUPS` ed `EQUIPMENT` in `src/types/gym.ts`, cioe'
 * un elenco chiuso dal compilatore: aggiungere un gruppo voleva dire un
 * rilascio dell'app. Dalla Fase 1 del gestionale sono tabelle sul server, e un
 * amministratore ne aggiunge uno dal pannello; qui arrivano col pull, e le
 * costanti restano soltanto come SEME di questa migrazione.
 *
 * LO SLUG E' LA CHIAVE E NON CAMBIA MAI. E' quel che sta in colonna su
 * `exercises.muscle_group` e dentro i JSON di `equipment` e
 * `secondary_muscles`: rinominare "Femorali" in "Ischiocrurali" cambia
 * `label_it`, non lo slug, o ogni esercizio che lo nomina resterebbe orfano.
 *
 * DUE COLONNE DI ETICHETTA E NON UNA CHIAVE i18n: un gruppo aggiunto dal
 * pannello non ha una chiave in `it.json` per definizione, e arriva con la
 * propria etichetta gia' scritta da chi l'ha creato. Le chiavi `gym.muscle.*`
 * restano come ricaduta per i ventitre' che ci sono oggi.
 *
 * `deleted_at` e non una riga tolta: sul telefono ci sono esercizi che
 * nominano quello slug, e togliere la riga li lascerebbe senza etichetta - chi
 * la cerca penserebbe a un difetto dell'app. E' la stessa scelta di `hidden`
 * sui tipi di pasto: chi OFFRE UNA SCELTA legge i vivi, chi DISEGNA QUEL CHE
 * C'E' GIA' legge tutti.
 *
 * L'ordine dei `sort` e le etichette sono gli stessi di
 * `backend/database/seeders/TaxonomySeeder.php`: le due parti devono nascere
 * identiche, o il primo pull riordinerebbe l'elenco senza che sia cambiato
 * niente.
 */
export const migration020: Migration = {
  version: 20,
  name: "taxonomies",
  up: `
CREATE TABLE muscle_groups (
  slug TEXT PRIMARY KEY,
  label_it TEXT NOT NULL,
  label_en TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE TABLE equipment_types (
  slug TEXT PRIMARY KEY,
  label_it TEXT NOT NULL,
  label_en TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

INSERT INTO muscle_groups (slug, label_it, label_en, sort) VALUES
  ('petto', 'Petto', 'Chest', 10),
  ('schiena', 'Schiena', 'Back', 20),
  ('spalle', 'Spalle', 'Shoulders', 30),
  ('bicipiti', 'Bicipiti', 'Biceps', 40),
  ('tricipiti', 'Tricipiti', 'Triceps', 50),
  ('avambracci', 'Avambracci', 'Forearms', 60),
  ('addome', 'Addome', 'Abs', 70),
  ('quadricipiti', 'Quadricipiti', 'Quads', 80),
  ('femorali', 'Femorali', 'Hamstrings', 90),
  ('glutei', 'Glutei', 'Glutes', 100),
  ('polpacci', 'Polpacci', 'Calves', 110),
  ('full_body', 'Full body', 'Full body', 120);

INSERT INTO equipment_types (slug, label_it, label_en, sort) VALUES
  ('corpo_libero', 'Corpo libero', 'Bodyweight', 10),
  ('bilanciere', 'Bilanciere', 'Barbell', 20),
  ('manubri', 'Manubri', 'Dumbbells', 30),
  ('kettlebell', 'Kettlebell', 'Kettlebell', 40),
  ('cavi', 'Cavi', 'Cables', 50),
  ('macchina', 'Macchina', 'Machine', 60),
  ('panca', 'Panca', 'Bench', 70),
  ('sbarra', 'Sbarra', 'Pull-up bar', 80),
  ('elastici', 'Elastici', 'Resistance bands', 90),
  ('trx', 'TRX', 'TRX', 100),
  ('cardio', 'Cardio', 'Cardio', 110);
`,
};
