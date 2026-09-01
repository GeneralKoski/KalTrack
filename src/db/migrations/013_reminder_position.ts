import type { Migration } from "@/src/db/migrations/types";

/**
 * Aggiunge la colonna `position` alla tabella `reminders` per supportare il
 * riordinamento manuale dei promemoria.
 */
export const migration013: Migration = {
  version: 13,
  name: "reminder_position",
  up: `
ALTER TABLE reminders ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
`,
};
