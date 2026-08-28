import type { Migration } from "@/src/db/migrations/types";

/**
 * Log delle chiamate AI. Su un'app personale serve a due cose concrete: capire
 * quanto si sta consumando, e poter rileggere un parsing andato male invece di
 * doverlo riprodurre a voce.
 */
export const migration004: Migration = {
  version: 4,
  name: "ai_calls",
  up: `
CREATE TABLE ai_calls (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  success INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_ai_calls_created ON ai_calls (created_at DESC);
`,
};
