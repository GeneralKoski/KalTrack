import type { Migration } from "@/src/db/migrations/types";

/**
 * Registro dei guasti dell'app.
 *
 * Esiste per una ragione precisa: i difetti capitano sul telefono, dove non
 * c'e' nessuna console attaccata. Fino a qui l'unico modo di sapere perche'
 * qualcosa non era andato era riprodurlo sull'emulatore con `adb logcat`
 * aperto - cioe' sperare che si ripresentasse, e nel frattempo avere in mano
 * solo "qualcosa e' andato storto".
 *
 * `scope` e' la parte di app che ha scritto la riga (`[assistant]`, `[sync]`),
 * `message` la riga leggibile e `detail` quel che c'era intorno: stack, corpo
 * della risposta, argomenti. Diviso in tre perche' l'elenco si scorre per
 * `scope` e `message`, e il dettaglio si apre solo su quello che interessa.
 *
 * Non si sincronizza: parla di questo telefono, non dei dati di chi lo usa.
 */
export const migration009: Migration = {
  version: 9,
  name: "app_logs",
  up: `
CREATE TABLE app_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  scope TEXT,
  message TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_app_logs_created ON app_logs (created_at DESC);
`,
};
