import type { Migration } from "@/src/db/migrations/types";

/**
 * Aggiunge la colonna `label` alla tabella `reminders` per consentire promemoria
 * personalizzati con nome libero.
 */
export const migration012: Migration = {
  version: 12,
  name: "reminder_label",
  up: `
ALTER TABLE reminders ADD COLUMN label TEXT;
`,
};
